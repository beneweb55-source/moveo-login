/**
 * WHO MAY SEE WHICH ENTRY, and who the application thinks is looking.
 *
 * THE LEAK THIS PINS. `isAdoptable` stopped A's history being CARRIED into B's
 * account (§8). It did nothing about A's history being SHOWN to B, and that was
 * a real defect rather than a theoretical one: A's session expires with no
 * logout, so no code of ours runs and nothing removes A's entries — they sit in
 * localStorage stamped `user:A` — and the list painted everything it found. The
 * protection was on the write path while the leak was on the read path.
 *
 * The rule that closes it is `isVisibleTo`, and it is tested here against the
 * full cross-product of viewer states and entry states, because the mistakes that
 * matter are the ones in the corner: an `unreadable` entry resolved to the
 * CURRENT viewer by default, and a `loading` viewer treated as a guest.
 *
 * `resolveHistoryOwner` is tested through an injected probe, so the ordering
 * rules — one request for concurrent callers, a slow answer not overwriting a
 * newer one, a failed re-probe keeping the resolved viewer — are exercised
 * without a network and without a browser.
 */

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {beforeEach, describe, it} from 'node:test';

import {
  isVisibleTo,
  userOwnerKey,
  visibleEntriesFor,
  type HistoryViewer,
  type OwnedEntry,
} from '../lib/historyOwnership';
import {
  __resetHistoryViewer,
  __setAuthProbe,
  getHistoryViewer,
  interpretAuthResponse,
  resolveHistoryOwner,
  type AuthResponse,
} from '../lib/historyViewer';

const readyUser = (userId: string | number): HistoryViewer => ({status: 'ready', owner: {kind: 'user', userId}});
const readyGuest: HistoryViewer = {status: 'ready', owner: null};
const loading: HistoryViewer = {status: 'loading'};
const errored: HistoryViewer = {status: 'error'};

const asUser = (id: string | number): OwnedEntry => ({owner: `user:${id}`});
const asDevice = (id: string): OwnedEntry => ({owner: `guest:${id}`});
/** Written before the ownership scheme existed. */
const unstamped: OwnedEntry = {};
/** Present, and not a key this codebase produces. */
const malformed: OwnedEntry = {owner: 'user:'};

describe('the display rule, over every viewer and every entry', () => {
  it('withholds EVERYTHING while the session probe is outstanding', () => {
    // This is the flicker protection, and it is the reason the list renders
    // after the probe rather than during it: at this instant there is no viewer
    // to compare against, and a guess is what paints A's titles for B.
    for (const entry of [asUser(101), asUser(202), asDevice('anon_x'), unstamped, malformed]) {
      assert.equal(isVisibleTo(entry, loading), false, `${JSON.stringify(entry)} while loading`);
    }
  });

  it('shows a visitor with no session only what names no account', () => {
    assert.equal(isVisibleTo(unstamped, readyGuest), true, 'pre-scheme history is unattributable');
    assert.equal(isVisibleTo(asDevice('anon_x'), readyGuest), true, "this browser's own guest bucket");
    assert.equal(isVisibleTo(asUser(101), readyGuest), false, "an account entry is not a guest's");
    assert.equal(isVisibleTo(malformed, readyGuest), false, 'unreadable fails closed');
  });

  it("shows account X its own entries, the device's guest entries, and pre-scheme history", () => {
    assert.equal(isVisibleTo(asUser(202), readyUser('202')), true);
    assert.equal(isVisibleTo(asDevice('anon_x'), readyUser('202')), true, 'the merge adopts these');
    assert.equal(isVisibleTo(unstamped, readyUser('202')), true);
  });

  it("NEVER shows account X another account's entries — including after an expiry", () => {
    // The §8/§23 case, and the reason this function is separate from
    // isAdoptable: A's session expired, no logout ran, A's entries are still in
    // this browser, and B is now signed in here.
    assert.equal(isVisibleTo(asUser(101), readyUser('202')), false);
    assert.equal(isVisibleTo(asUser(202), readyUser('101')), false);
    assert.equal(isVisibleTo(malformed, readyUser('202')), false);
  });

  it('keeps the account-owned side closed when the probe FAILED, and nothing more', () => {
    // The asymmetry of the two mistakes decides this. Hiding a signed-in
    // viewer's own entries until the next successful probe is a temporary,
    // recoverable loss; showing B A's titles is not.
    assert.equal(isVisibleTo(asUser(101), errored), false);
    assert.equal(isVisibleTo(asDevice('anon_x'), errored), true);
    assert.equal(isVisibleTo(unstamped, errored), true);
    assert.equal(isVisibleTo(malformed, errored), false);
  });

  it('is not isAdoptable, and the difference is deliberate', () => {
    // A guest entry is both adoptable and visible; another account's is neither;
    // `unreadable` is invisible AND inadoptable. The two functions agree on all
    // of those, and they are still separate because they answer different
    // questions — one about writing into an account, one about painting.
    assert.equal(isVisibleTo(asUser(101), readyUser('202')), false);
    assert.equal(isVisibleTo(asUser('012'), readyUser('12')), false, 'a padded key is not identity 12');
  });

  it('filters a list preserving order', () => {
    const entries = [asUser(101), asUser(202), unstamped, asDevice('anon_x'), malformed];
    assert.deepEqual(
      visibleEntriesFor(entries, readyUser('202')).map((entry) => entry.owner ?? 'none'),
      ['user:202', 'none', 'guest:anon_x'],
    );
  });
});

describe('what an answer from /api/auth/me means', () => {
  const response = (status: number, body: unknown = null): AuthResponse => ({status, body});

  it('reads 401 and 403 as answers: no account behind this request', () => {
    assert.deepEqual(interpretAuthResponse(response(401)), {status: 'ready', owner: null});
    assert.deepEqual(interpretAuthResponse(response(403)), {status: 'ready', owner: null});
  });

  it('reads a 200 with an id as that account', () => {
    // The id's TYPE is preserved and that is deliberate: `users.id` is an integer
    // and `/api/auth/me` sends a number, while the key it becomes is always a
    // string. Both must resolve to the same account, which is the property
    // `userOwnerKey` states and the one the stamping path depends on.
    assert.deepEqual(interpretAuthResponse(response(200, {user: {id: 202}})), readyUser(202));
    assert.deepEqual(interpretAuthResponse(response(200, {user: {id: '202'}})), readyUser('202'));
    assert.equal(userOwnerKey(202), userOwnerKey('202'));
  });

  it('reads a 200 it cannot use as ERROR, not as "guest"', () => {
    // The distinction is load-bearing: treating a malformed success as the
    // absence of a session would quietly clear a real owner and start stamping
    // this viewer's writes as a guest's.
    for (const body of [{}, {user: {}}, {user: {id: null}}, {user: {id: ' 202'}}, {user: {id: 'a:b'}}, null]) {
      assert.deepEqual(interpretAuthResponse(response(200, body)), {status: 'error'}, JSON.stringify(body));
    }
  });

  it('reads anything that is not 2xx/401/403 as ERROR', () => {
    assert.deepEqual(interpretAuthResponse(response(500)), {status: 'error'});
    assert.deepEqual(interpretAuthResponse(response(0)), {status: 'error'});
    assert.deepEqual(interpretAuthResponse(response(302)), {status: 'error'});
  });
});

describe('the resolver: one answer, shared', () => {
  beforeEach(() => {
    __resetHistoryViewer();
    __setAuthProbe(null);
  });

  it('makes ONE request for concurrent callers', async () => {
    let calls = 0;
    __setAuthProbe(async () => {
      calls += 1;
      return {status: 200, body: {user: {id: 202}}};
    });

    const [a, b, c] = await Promise.all([
      resolveHistoryOwner(),
      resolveHistoryOwner(),
      resolveHistoryOwner(),
    ]);

    assert.equal(calls, 1, 'the history list and the merge must share the probe');
    assert.deepEqual(a, readyUser(202));
    assert.deepEqual(b, a);
    assert.deepEqual(c, a);
  });

  it('costs nothing once resolved, unless a refresh is asked for', async () => {
    let calls = 0;
    __setAuthProbe(async () => {
      calls += 1;
      return {status: 200, body: {user: {id: 202}}};
    });

    await resolveHistoryOwner();
    await resolveHistoryOwner();
    await resolveHistoryOwner();
    assert.equal(calls, 1);

    await resolveHistoryOwner({refresh: true});
    assert.equal(calls, 2, 'a navigation re-checks, which is how a sign-in is noticed');
  });

  it('does not let a superseded answer win', async () => {
    // Two navigations in quick succession can have their answers land out of
    // order, and the older one must not become the viewer.
    const gate: Array<() => void> = [];
    let call = 0;
    __setAuthProbe(async () => {
      call += 1;
      const mine = call;
      await new Promise<void>((resolve) => gate.push(resolve));
      return {status: 200, body: {user: {id: mine === 1 ? 101 : 202}}};
    });

    const first = resolveHistoryOwner();
    const second = resolveHistoryOwner({refresh: true});
    // Release the SECOND probe first, so the FIRST one answers later.
    gate[1]?.();
    await new Promise((resolve) => setImmediate(resolve));
    gate[0]?.();
    await Promise.all([first, second]);

    assert.deepEqual(getHistoryViewer(), readyUser(202), 'the newer answer is the one that stands');
  });

  it('keeps the resolved viewer when a later probe FAILS', async () => {
    // One dropped request must not take a signed-in viewer's own history off the
    // screen, and "we could not ask just now" is not "you are nobody".
    __setAuthProbe(async () => ({status: 200, body: {user: {id: 202}}}));
    await resolveHistoryOwner();

    __setAuthProbe(async () => ({status: 500, body: null}));
    const after = await resolveHistoryOwner({refresh: true});

    assert.deepEqual(after, readyUser(202));
    assert.deepEqual(getHistoryViewer(), readyUser(202));
  });

  it('treats a thrown request as an error, and holds the resolved viewer', async () => {
    __setAuthProbe(async () => ({status: 200, body: {user: {id: 202}}}));
    await resolveHistoryOwner();

    __setAuthProbe(async () => {
      throw new Error('offline');
    });
    assert.deepEqual(await resolveHistoryOwner({refresh: true}), readyUser(202));
  });

  it('starts at loading on a fresh page, so nothing private is painted first', async () => {
    assert.deepEqual(getHistoryViewer(), {status: 'loading'});
  });
});

describe('the consumers use the shared answer, and the list filters the LOCAL store', () => {
  /**
   * The source with its comments removed, because these are assertions about
   * CODE and the files' own headers discuss the very calls being ruled out.
   * Without this the pin would fail on its own explanation — and a test that
   * fails when someone documents the defect is a test that gets deleted.
   */
  const read = (relative: string): string =>
    readFileSync(path.join(process.cwd(), ...relative.split('/')), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '');

  it('the history list filters local entries through the display rule', () => {
    // The leak was here. The server list needs no filter (that route answers for
    // the account on the cookie and sends no `owner` field), but the local store
    // is shared by everyone who uses the browser.
    //
    // The rule has MOVED since — out of the component and into
    // lib/historyList.ts, when the profile gained a history tab over the same
    // list. A copy of the filter in each surface is precisely how the two would
    // come to disagree, and a disagreement here is one surface showing A's
    // titles to B while the other refuses. So the pin follows the code to where
    // it went; it is not relaxed to accommodate the move.
    const rule = read('lib/historyList.ts');
    assert.match(rule, /visibleEntriesFor\(local, viewer\)/);

    // And both surfaces go through that rule rather than reading the store
    // themselves — a third reader added later is what this loop is for.
    for (const component of [
      'components/HistorySection.tsx',
      'components/ProfileHistoryTab.tsx',
    ]) {
      assert.match(
        read(component),
        /useWatchHistory\(/,
        `${component} must read the history through the shared hook, not the store`,
      );
    }
    assert.match(read('lib/useWatchHistory.ts'), /await resolveHistoryOwner\(\)/);
  });

  it('GuestHistorySync asks the resolver instead of fetching /api/auth/me itself', () => {
    // Two independent probes can answer differently, and then the merge relays
    // entries stamped for an account the list was not filtering against.
    const source = read('components/GuestHistorySync.tsx');
    assert.match(source, /resolveHistoryOwner\(\{ refresh: true \}\)/);
    assert.doesNotMatch(source, /fetch\(["']\/api\/auth\/me["']\)/);
  });

  it("sign-out removes the departing account's records and does not wipe the store", () => {
    const source = read('components/Header.tsx');
    assert.match(source, /removeEntriesOwnedBy\(ownerForUserId\(user\?\.id\)\)/);
    assert.doesNotMatch(source, /clearWatchHistory\(\)/);
  });
});
