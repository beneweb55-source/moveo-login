/**
 * §6/§8: one visitor's history must not be handed to another, and the rule that
 * decides it must fail closed.
 *
 * The defect this pins down had no owner on the entry, so the guest → account
 * merge replayed the whole local list into whoever signed in next. On a shared
 * browser that meant: A watches, A's session lapses without the logout button
 * (no code of ours runs on that path, which is why §8 asks for it), B signs in,
 * and A's titles arrive in B's account with A's positions attached.
 *
 * Four properties carry the fix, and each is asserted here for its own reason:
 *
 *   1. A KEY IS READ STRICTLY. `user:12 ` is refused, not trimmed. Trimming is
 *      the kind of kindness that turns an unreadable value into a decision about
 *      WHO an entry belongs to, and this function's answer decides whether one
 *      account's entry may be handed to another.
 *   2. "PRESENT BUT UNREADABLE" IS NOT "ABSENT". An entry with `owner: 42` cannot
 *      be attributed to anyone, and "cannot be attributed" must never resolve to
 *      "anyone's" — absent is adoptable, unreadable is refused. The two cases
 *      below assert that gap directly, because collapsing it IS the bug.
 *   3. ADOPTION NEVER MOVES ANOTHER ACCOUNT'S ENTRY. `adoptEntries` re-stamps the
 *      absent and guest entries only. This is what closes the expiry-without-
 *      logout window: after any proven request, A's entries say `user:A`, so a
 *      later `guest:*` — which any account may adopt — is not what they are.
 *   4. THE DEVICE ID IS NOT A PERSON. §6 forbids email, IP and fingerprint, and
 *      the id is a random string in this browser's storage; a scan below keeps it
 *      that way.
 *
 * The whole thing is traced end to end in "A watches, A's session expires, B
 * signs in" — the scenario §8 names — rather than left to be inferred from the
 * unit cases, because every unit case would still pass if the merge called
 * `isAdoptable` with the wrong argument.
 *
 * Run: node --import tsx --test tests/historyOwnership.test.ts
 */

import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {beforeEach, describe, it} from 'node:test';

import {
  ANON_SESSION_STORAGE_KEY,
  __resetCurrentOwner,
  adoptEntries,
  currentWriteOwnerKey,
  getDeviceId,
  guestOwnerKey,
  isAdoptable,
  ownerKeyOf,
  parseOwnerKey,
  partitionForAdoption,
  readOwnerKey,
  readStoredOwnership,
  setCurrentOwner,
  stampOwner,
  userOwnerKey,
  type HistoryOwner,
  type OwnedEntry,
} from '../lib/historyOwnership';

// ---------------------------------------------------------------------------
// a browser, minimally
// ---------------------------------------------------------------------------

/** Enough of localStorage for the identity contract, and nothing more. */
class MemoryStorage {
  private readonly map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  get length(): number {
    return this.map.size;
  }
}

/** The GLOBAL object, as something we may put a `window` on. */
const GLOBAL = globalThis as unknown as Record<string, unknown>;

const asStorage = (storage: MemoryStorage): Storage => storage as unknown as Storage;

/** Storage that is present but refuses to work — private mode, site data off. */
const brokenStorage = (): Storage =>
  ({
    getItem(): never {
      throw new Error('storage unavailable');
    },
    setItem(): never {
      throw new Error('storage unavailable');
    },
  }) as unknown as Storage;

/**
 * Runs `run` with `window` set to `value`, then puts back exactly what was there.
 *
 * Assigning back rather than deleting, because a global property whose value is
 * `undefined` is indistinguishable from an absent one to `typeof window` — which
 * is the only thing the module checks.
 */
const withWindow = <T>(value: unknown, run: () => T): T => {
  const previous = GLOBAL.window;
  GLOBAL.window = value;
  try {
    return run();
  } finally {
    GLOBAL.window = previous;
  }
};

const sandbox = new MemoryStorage();
GLOBAL.window = {localStorage: asStorage(sandbox)};

beforeEach(() => {
  sandbox.clear();
  __resetCurrentOwner();
});

/** The shape the module stores, plus a title, so traces read like real entries. */
interface Entry extends OwnedEntry {
  readonly title: string;
}

const A: HistoryOwner = {kind: 'user', userId: 101};
const B: HistoryOwner = {kind: 'user', userId: 202};

const titles = (entries: readonly Entry[]): string[] => entries.map((entry) => entry.title);

/**
 * An entry carrying a value the type says cannot be there.
 *
 * `OwnedEntry.owner` is typed as the key we write, which is the honest type for
 * everything we produce. The point of the reader is what a hand-edited store, an
 * older build or an injected value can hold INSTEAD — null, a number, an object,
 * an empty string — so those cases need the same deliberate cast the module uses
 * on the way in. Casting here is what keeps the type honest rather than widening
 * it to `unknown` everywhere, where `owner: 'user:101'` would stop being checked.
 */
const stored = (owner: unknown): OwnedEntry => ({owner: owner as string});

// ---------------------------------------------------------------------------
// 1. reading a key
// ---------------------------------------------------------------------------

describe('the owner keys have exactly two shapes', () => {
  it('builds a guest key and a user key', () => {
    assert.equal(guestOwnerKey('anon_x_1'), 'guest:anon_x_1');
    assert.equal(userOwnerKey(101), 'user:101');
    assert.equal(ownerKeyOf({kind: 'guest', deviceId: 'anon_x_1'}), 'guest:anon_x_1');
    assert.equal(ownerKeyOf({kind: 'user', userId: 101}), 'user:101');
  });

  it('treats a number id and its string form as one identity', () => {
    // The id arrives as a string from the verified token in some places and as a
    // number from a React prop in others. If the two produced different keys, one
    // account would be two owners and its own re-sync would be withheld from it.
    assert.equal(userOwnerKey(101), userOwnerKey('101'));
    assert.deepEqual(parseOwnerKey(userOwnerKey(101)), parseOwnerKey(userOwnerKey('101')));
  });

  it('round-trips every key it writes', () => {
    for (const key of [
      guestOwnerKey('anon_abc123_1699999999999'),
      userOwnerKey(1),
      userOwnerKey('12'),
      userOwnerKey(0),
    ]) {
      const parsed = parseOwnerKey(key);
      assert.notEqual(parsed, null, `${key} must parse — we wrote it`);
      assert.equal(ownerKeyOf(parsed!), key);
    }
  });

  it('refuses anything that is not exactly a form we produce', () => {
    const malformed: unknown[] = [
      '',
      'guest',
      'guest:',
      'user:',
      ':12',
      'user:1:2',
      'user:12 ',
      ' user:12',
      'user:12\t',
      'user:12\n',
      'User:12',
      'GUEST:x',
      'user :12',
      'owner:12',
      12,
      0,
      true,
      {},
      [],
      null,
      undefined,
    ];
    for (const value of malformed) {
      assert.equal(
        parseOwnerKey(value),
        null,
        `${JSON.stringify(value)} must not parse: this answer decides which account an entry may be given to`,
      );
    }
  });

  it('does not trim, and does not pad-match — both fail closed', () => {
    // Trimming "user:12 " into "user:12" is the friendly reading, and it is the
    // wrong direction: it invents a decision about ownership from a value we could
    // not read. A zero-padded id is the same idea on the numeric side — it is a
    // well-formed key, and it is deliberately not the same identity as 12.
    assert.equal(parseOwnerKey('user:12 '), null);
    assert.deepEqual(parseOwnerKey('user:012'), {kind: 'user', userId: '012'});
    assert.equal(isAdoptable({owner: 'user:012'}, 12), false);
  });
});

// ---------------------------------------------------------------------------
// 2. three states
// ---------------------------------------------------------------------------

describe('a stored entry has three states, and two of them are not each other', () => {
  it('absent when there is no owner field at all', () => {
    assert.deepEqual(readStoredOwnership({}), {state: 'absent'});
    assert.deepEqual(readStoredOwnership({owner: undefined}), {state: 'absent'});
    assert.deepEqual(readStoredOwnership(stored(null)), {state: 'absent'});
  });

  it('owned for a key we recognise', () => {
    assert.deepEqual(readStoredOwnership({owner: 'guest:anon_x_1'}), {
      state: 'owned',
      owner: {kind: 'guest', deviceId: 'anon_x_1'},
    });
    assert.deepEqual(readStoredOwnership({owner: 'user:101'}), {
      state: 'owned',
      owner: {kind: 'user', userId: '101'},
    });
    assert.equal(readOwnerKey({owner: 'user:101'}), 'user:101');
    assert.equal(readOwnerKey({}), null, 'absent has no key to read');
  });

  it('unreadable for a value that is present but is not a key', () => {
    for (const value of [42, 0, '', 'user:', 'user:12 ', false, {kind: 'user'}, ['user:101']]) {
      const ownership = readStoredOwnership(stored(value));
      assert.equal(
        ownership.state,
        'unreadable',
        `${JSON.stringify(value)} is present and unreadable`,
      );
    }
  });

  it('unreadable is NOT absent — that gap is the whole fail-open hole', () => {
    // If a value we cannot read were folded into "no owner", it would become
    // adoptable, and an entry nobody can attribute would be handed to whoever
    // signs in next. Both halves are asserted, so neither can drift alone.
    assert.equal(readStoredOwnership(stored(42)).state, 'unreadable');
    assert.equal(readStoredOwnership({}).state, 'absent');
    assert.equal(isAdoptable(stored(42), 202), false);
    assert.equal(isAdoptable({}, 202), true);
  });
});

// ---------------------------------------------------------------------------
// 3. the isolation rule
// ---------------------------------------------------------------------------

describe('isAdoptable is the isolation rule, in one place', () => {
  it('carries pre-scheme history into an account, because §15 forbids losing it', () => {
    for (const target of ['101', '202', null, undefined]) {
      assert.equal(isAdoptable({}, target), true);
      assert.equal(isAdoptable({owner: undefined}, target), true);
    }
  });

  it('carries this browser\'s guest history into an account', () => {
    // localStorage is per-browser, so a guest key in this store IS this browser's
    // guest history. It is adoptable whether or not the id matches the current
    // device: a guest entry is nobody's account, and withholding it would be the
    // "history lost" failure §7/§15 rule out.
    for (const target of ['101', '202', null, undefined]) {
      assert.equal(isAdoptable({owner: 'guest:anon_someone_else'}, target), true);
    }
  });

  it('carries an account\'s own entries into that same account', () => {
    assert.equal(isAdoptable({owner: 'user:101'}, 101), true);
    assert.equal(isAdoptable({owner: 'user:101'}, '101'), true, 'number and string are one id');
  });

  it('REFUSES another account\'s entries, which is §8', () => {
    assert.equal(isAdoptable({owner: 'user:101'}, 202), false);
    assert.equal(isAdoptable({owner: 'user:202'}, 101), false);
  });

  it('REFUSES an account entry when no account is known, rather than guessing', () => {
    // The merge runs on paths where the session probe has not answered yet. With
    // no target, an account-stamped entry cannot be attributed, so it stays put.
    assert.equal(isAdoptable({owner: 'user:101'}, null), false);
    assert.equal(isAdoptable({owner: 'user:101'}, undefined), false);
  });

  it('REFUSES an unreadable owner, for any target', () => {
    for (const target of ['101', null, undefined]) {
      assert.equal(isAdoptable(stored({'kind': 'user', 'userId': 101}), target), false);
    }
  });
});

// ---------------------------------------------------------------------------
// §8: the scenario, traced
// ---------------------------------------------------------------------------

describe("A watches, A's session expires, B signs in", () => {
  /**
   * The store as A leaves it: two entries written while signed in, as the real
   * write path produces them via `stampOwner`, plus one entry from before this
   * scheme existed and one guest entry from the same browser.
   */
  const storeAfterA = (): Entry[] => [
    // The type argument is explicit because inference settles on the parameter's
    // constraint (`OwnedEntry`) here rather than on `Entry`, which would strip the
    // `title` these assertions read. Stating it is the same information the
    // return annotation already carries.
    stampOwner<Entry>({title: 'A: film at 32:14'}, A),
    stampOwner<Entry>({title: 'A: S2E7 at 12:00'}, A),
    {title: 'pre-scheme entry'},
    stampOwner<Entry>({title: 'guest entry, same browser'}, {kind: 'guest', deviceId: 'anon_dev_1'}),
  ];

  it('gives B none of A\'s history', () => {
    const store = storeAfterA();
    const {adoptable, withheld} = partitionForAdoption(store, B.userId);

    assert.deepEqual(titles(withheld), ['A: film at 32:14', 'A: S2E7 at 12:00']);
    assert.deepEqual(titles(adoptable), ['pre-scheme entry', 'guest entry, same browser']);
    for (const entry of adoptable) {
      assert.equal(
        /^A: /.test(entry.title),
        false,
        `${entry.title} reached B — this is the inheritance §8 forbids`,
      );
    }
  });

  it('leaves A\'s entries in the store, untouched, for A to come back to', () => {
    const store = storeAfterA();
    const before = store.map((entry) => ({...entry}));

    partitionForAdoption(store, B.userId);
    // The partition must not be the thing that deletes A's history: B signing in
    // is not a reason to destroy what A recorded (§15).
    assert.deepEqual(store, before);
    assert.equal(readOwnerKey(store[0]), 'user:101');
  });

  it('does not re-stamp A\'s entries when B adopts', () => {
    const store = storeAfterA();
    const {entries} = adoptEntries(store, B);

    assert.equal(readOwnerKey(entries[0]), 'user:101', "A's entry must not become B's");
    assert.equal(readOwnerKey(entries[1]), 'user:101');
    assert.equal(readOwnerKey(entries[2]), 'user:202', "the pre-scheme entry is now B's");
    assert.equal(readOwnerKey(entries[3]), 'user:202', 'and so is the guest entry');
  });

  it('and B\'s own new write is not visible to A either', () => {
    // The rule has to be symmetric, or "isolation" means one direction only.
    //
    // Note what the adoption did to the two community entries: they became B's,
    // so A is now refused them as well. That is the intended reading — the
    // browser's guest history belonged to whoever signed in on it, and after B
    // adopted it, it is B's account history like any other. A keeps exactly what
    // A wrote.
    const store = adoptEntries(storeAfterA(), B).entries;
    const withBsWrite = [stampOwner<Entry>({title: 'B: film'}, B), ...store];

    const {adoptable, withheld} = partitionForAdoption(withBsWrite, A.userId);
    assert.deepEqual(titles(withheld), [
      'B: film',
      'pre-scheme entry',
      'guest entry, same browser',
    ]);
    assert.deepEqual(
      titles(adoptable),
      ['A: film at 32:14', 'A: S2E7 at 12:00'],
      "A must not be refused A's own history",
    );
  });

  it('is the same answer when the session expires without a logout click', () => {
    // §8's expiry case. Nothing runs on that path, so the store is exactly what A
    // left — and that is enough, because the decision is made from the entry
    // rather than from any record of who signed out.
    const store = storeAfterA();
    assert.deepEqual(titles(partitionForAdoption(store, B.userId).withheld), [
      'A: film at 32:14',
      'A: S2E7 at 12:00',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 4. adoption
// ---------------------------------------------------------------------------

describe('adoption moves only what is now the account\'s', () => {
  it('re-stamps absent and guest entries, and nothing else', () => {
    const store: Entry[] = [
      {title: 'pre-scheme'},
      {title: 'guest', owner: 'guest:anon_dev_1'},
      {title: 'mine already', owner: 'user:202'},
      {title: 'someone else', owner: 'user:101'},
      {title: 'unreadable', ...stored(42)},
    ];

    const {entries, changed} = adoptEntries(store, B);

    assert.equal(changed, true);
    assert.deepEqual(entries.map((entry) => readOwnerKey(entry)), [
      'user:202',
      'user:202',
      'user:202',
      'user:101',
      null,
    ]);
    assert.deepEqual(
      titles(entries),
      titles(store),
      'adoption re-stamps; it never reorders or drops',
    );
  });

  it('leaves an entry it has nothing to do to by identity, not by value', () => {
    // Reference equality is the claim: an untouched entry is handed back as the
    // same object, so a caller can tell "nothing happened" from "a rewrite
    // happened to produce an equal value".
    const store: Entry[] = [
      {title: 'someone else', owner: 'user:101'},
      {title: 'unreadable', ...stored(42)},
    ];
    const {entries, changed} = adoptEntries(store, B);

    assert.equal(changed, false);
    assert.equal(entries, store, 'the same array comes back when nothing moved');
    assert.equal(entries[0], store[0]);
  });

  it('does not modify the entries it is given', () => {
    const entry: Entry = {title: 'guest', owner: 'guest:anon_dev_1'};
    const store: Entry[] = [entry];
    adoptEntries(store, B);

    assert.equal(store[0], entry);
    assert.equal(
      readOwnerKey(entry),
      'guest:anon_dev_1',
      'the input object is not re-stamped in place',
    );
  });

  it('is idempotent, so a re-run does not churn storage', () => {
    const store: Entry[] = [{title: 'pre-scheme'}, {title: 'guest', owner: 'guest:anon_dev_1'}];
    const once = adoptEntries(store, B);
    const twice = adoptEntries(once.entries, B);

    assert.equal(twice.changed, false);
    assert.equal(twice.entries, once.entries);
    assert.deepEqual(twice.entries, once.entries);
  });

  it('makes a later merge of the same account keep everything it adopted', () => {
    // The adopted entries must be adoptable by their new owner, or adoption would
    // silently be a way to lose history on the next sign-in.
    const store: Entry[] = [{title: 'pre-scheme'}, {title: 'guest', owner: 'guest:anon_dev_1'}];
    const adopted = adoptEntries(store, B).entries;

    assert.deepEqual(titles(partitionForAdoption(adopted, B.userId).withheld), []);
    assert.deepEqual(titles(partitionForAdoption(adopted, B.userId).adoptable), [
      'pre-scheme',
      'guest',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 5. the write path's owner
// ---------------------------------------------------------------------------

describe('a write is stamped with the proven session, and otherwise with the device', () => {
  it('uses the proven account once one has answered', () => {
    setCurrentOwner(B);
    assert.equal(currentWriteOwnerKey(), 'user:202');
  });

  it('falls back to this browser\'s guest key when no session is proven', () => {
    assert.equal(currentWriteOwnerKey(), guestOwnerKey(getDeviceId()!));
  });

  it('falls back to guest the moment the session stops being proven', () => {
    // The sign-out path. Clearing the local history without clearing the owner
    // would stamp post-sign-out anonymous viewing with the account that just
    // left — the same defect wearing a different hat.
    setCurrentOwner(B);
    setCurrentOwner(null);
    assert.equal(currentWriteOwnerKey(), guestOwnerKey(getDeviceId()!));
  });

  it('stamps nothing when there is no storage to build an identity from', () => {
    setCurrentOwner(B);
    withWindow(undefined, () => {
      // A proven account still wins, because it needs no storage...
      assert.equal(currentWriteOwnerKey(), 'user:202');
    });
    __resetCurrentOwner();
    withWindow(undefined, () => {
      // ...and with neither a session nor a device, the write goes unstamped,
      // which is `absent`, which is adoptable — not a fabricated identity.
      assert.equal(currentWriteOwnerKey(), null);
    });
  });

  it('never invents an account: an unproven session is not a user key', () => {
    // There is no API that takes a user id without a proven session — the setter
    // takes the owner the probe returned. Asserted so a future convenience
    // `setCurrentUserId(12)` is a deliberate act rather than a small addition.
    const before = currentWriteOwnerKey();
    assert.equal(typeof before, 'string');
    assert.equal(before!.startsWith('guest:'), true);
  });
});

// ---------------------------------------------------------------------------
// §6: the device id is a browser bucket, not a person
// ---------------------------------------------------------------------------

describe('the device id is created once, kept, and degrades safely', () => {
  it('is created once and then stable', () => {
    const first = getDeviceId();
    assert.equal(typeof first, 'string');
    assert.equal(getDeviceId(), first);
    assert.equal(sandbox.getItem(ANON_SESSION_STORAGE_KEY), first);
  });

  it('has the opaque shape the app already writes', () => {
    // No email, no address, no fingerprint (§6) — a random suffix and a clock.
    assert.match(getDeviceId()!, /^anon_[a-z0-9]+_\d+$/);
  });

  it('honours an id another tab already wrote instead of replacing it', () => {
    sandbox.setItem(ANON_SESSION_STORAGE_KEY, 'anon_existing_1');
    assert.equal(getDeviceId(), 'anon_existing_1');
    assert.equal(sandbox.getItem(ANON_SESSION_STORAGE_KEY), 'anon_existing_1');
  });

  it('returns null rather than throwing when storage is unavailable', () => {
    withWindow({localStorage: brokenStorage()}, () => {
      assert.equal(getDeviceId(), null);
      assert.equal(currentWriteOwnerKey(), null);
    });
  });

  it('returns null during a server render', () => {
    withWindow(undefined, () => assert.equal(getDeviceId(), null));
  });

  it('uses the anon session key this app already had', () => {
    assert.equal(ANON_SESSION_STORAGE_KEY, 'anon_session_id');
  });
});

// ---------------------------------------------------------------------------
// the constraint, as a scan
// ---------------------------------------------------------------------------

const codeLines = (source: string): {line: number; text: string}[] =>
  source
    .split(/\r?\n/)
    .map((text, index) => ({line: index + 1, text}))
    .filter(({text}) => {
      const trimmed = text.trim();
      return !(trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*'));
    });

const SOURCE_DIRS = ['app', 'components', 'lib', 'utils', 'hooks', 'context'];

const sourceFiles = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full);
    }
  };
  for (const dir of SOURCE_DIRS) {
    if (existsSync(dir)) walk(dir);
  }
  return out;
};

/** §6's prohibition, as something a machine can check. */
const readsSomethingPersonal = (code: string): boolean =>
  /navigator|userAgent|\bemail\b|fingerprint|geolocation|canvas/i.test(code);

const OWNERSHIP_MODULE = path.join('lib', 'historyOwnership.ts');

describe('the owner is not derived from a person', () => {
  it('the check would catch what it forbids', () => {
    assert.equal(readsSomethingPersonal('const id = navigator.userAgent;'), true);
    assert.equal(readsSomethingPersonal('await fetch(`/api/me?email=${email}`);'), true);
    assert.equal(readsSomethingPersonal('const fp = fingerprint();'), true);
    assert.equal(readsSomethingPersonal('const id = window.localStorage.getItem(KEY);'), false);
  });

  it('reads none of it, in library code', () => {
    const offenders = codeLines(readFileSync(OWNERSHIP_MODULE, 'utf8'))
      .filter(({text}) => readsSomethingPersonal(text))
      .map(({line, text}) => `${OWNERSHIP_MODULE}:${line}: ${text.trim()}`);
    assert.deepEqual(offenders, [], offenders.join('\n'));
  });

  it('has exactly one code copy of the storage key literal', () => {
    // Stated in the module header as the reason the literal lives there: two
    // copies would look like a working build while splitting the identity in two,
    // so the key a session id is read from would stop being the key an owner is
    // built from. A comment is not a copy — hence the line filter.
    //
    // The line number is deliberately NOT pinned: this must fail when a second
    // copy appears, not when a comment above the first one is reworded.
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      for (const {line, text} of codeLines(readFileSync(file, 'utf8'))) {
        if (/["'`]anon_session_id["'`]/.test(text)) {
          offenders.push(`${file}:${line}: ${text.trim()}`);
        }
      }
    }
    assert.equal(
      offenders.length,
      1,
      'the anon session key must have one code copy, in lib/historyOwnership.ts — ' +
        `import it rather than repeating the literal:\n${offenders.join('\n')}`,
    );
    assert.equal(
      offenders[0].startsWith(`${OWNERSHIP_MODULE}:`),
      true,
      `the one copy must be the exported constant, not a second literal: ${offenders[0]}`,
    );
    assert.match(offenders[0], /ANON_SESSION_STORAGE_KEY = "anon_session_id"/);
  });

  it('keeps getAnonSessionId a delegation rather than a second implementation', () => {
    // utils/historyManager.ts re-exports it for its existing caller
    // (components/WatchTimer.tsx). It must stay a one-liner over getDeviceId, or
    // the id a request reports and the id an entry is stamped with could differ.
    const source = readFileSync(path.join('utils', 'historyManager.ts'), 'utf8');
    assert.match(
      source,
      /export const getAnonSessionId = \(\): string \| null => getDeviceId\(\);/,
      'getAnonSessionId must delegate to getDeviceId',
    );
  });
});
