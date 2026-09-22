/**
 * Who a locally stored history entry belongs to — and the rule that stops one
 * person's history being handed to another.
 *
 * ─── THE DEFECT THIS EXISTS FOR ──────────────────────────────────────────────
 *
 * `watch_history` in localStorage had no owner. It was one flat list, and the
 * guest → account merge replayed every entry in it into whoever happened to be
 * signed in. That is correct for its intended case — one person, one device,
 * an account they just created — and wrong for the case §6/§8 name:
 *
 *   A watches something. A's session ends WITHOUT the logout button (the cookie
 *   expires, the tab is closed for a week, the JWT lapses — §8 asks for the
 *   expiry case specifically, because no code of ours runs on that path). B then
 *   signs in on the same browser. Nothing in the store said the entries were A's,
 *   so the merge pushed A's titles, with A's positions, into B's account.
 *
 * The sign-out path does clear the local history, and that is the boundary which
 * protects a shared machine — but it only runs when someone presses the button.
 * A protection that depends on the departing viewer tidying up is not a
 * protection. The entry itself has to say whose it is.
 *
 * ─── THE MODEL ───────────────────────────────────────────────────────────────
 *
 * Every local write is stamped with the identity that made it:
 *
 *   guest:<device id>   an opaque random string in this browser (see getDeviceId)
 *   user:<user id>      the numeric id from the verified session
 *
 * Then, on a merge, an entry is carried into an account ONLY when the entry is
 * adoptable by that account: it is the device's guest history, it already belongs
 * to that same account, or it predates this scheme entirely. An entry stamped
 * with a DIFFERENT account is left exactly where it is. That single rule is what
 * makes §8's "B ne doit jamais récupérer automatiquement l'historique A" true
 * even when A left no trace of leaving.
 *
 * ─── NO EMAIL, NO IP, NO FINGERPRINT ─────────────────────────────────────────
 *
 * §6 forbids all three, and the design needs none of them. The device id is the
 * `anon_session_id` this app already creates — `anon_<random>_<timestamp>` — a
 * value with no relationship to a person, an address or a device fingerprint. It
 * identifies a BROWSER STORAGE BUCKET, which is all ownership of localStorage can
 * honestly mean. The account id is the `users.id` from the verified token, not
 * anything the client chose.
 *
 * ─── THE ADOPTION STEP, AND WHY IT IS LOAD-BEARING ───────────────────────────
 *
 * Once a signed-in session is proven, entries that are guest-owned or unstamped
 * are ADOPTED: re-stamped as that account's, after the merge has run.
 *
 * Without it the model leaks in the exact case above. A's entries written while
 * signed in would stay `guest:<device>` — because a write that happened before
 * the session probe answered has nothing better to stamp it with — and a later
 * `guest:*` is adoptable by ANY account, so B would still inherit them. Adopting
 * on proof closes that window: after A's any request, A's entries say `user:A`.
 *
 * It is also coherent with the product's own stated behaviour: the guest → login
 * merge already treats the device's guest history as belonging to the account
 * that just signed in. Adoption writes down what that merge already did.
 *
 * AND THE MIS-STAMP IS ALWAYS TOWARD GUEST, never toward an account, which is
 * the direction that matters. An entry stamped `guest:` that was really written
 * by a signed-in viewer is adoptable by the account that signs in next — which
 * then adopts it. An entry stamped `user:A` that was really B's would be refused
 * to B, losing B's own progression, so no code path may guess a user.
 *
 * Pure module: no React, no DOM beyond localStorage access in getDeviceId, and
 * no network. Tested in tests/historyOwnership.test.ts.
 */

/** The minimum shape this module needs. Structurally compatible with WatchHistoryItem. */
export interface OwnedEntry {
  readonly owner?: string;
}

export type HistoryOwner =
  /** A browser bucket, not a person. */
  | { readonly kind: "guest"; readonly deviceId: string }
  /** The numeric `users.id` carried by the verified session token. */
  | { readonly kind: "user"; readonly userId: string | number };

export const GUEST_PREFIX = "guest:";
export const USER_PREFIX = "user:";

/** `guest:<device id>`. The device id is opaque; see getDeviceId. */
export const guestOwnerKey = (deviceId: string): string => `${GUEST_PREFIX}${deviceId}`;

/** `user:<id>`. */
export const userOwnerKey = (userId: string | number): string => `${USER_PREFIX}${String(userId)}`;

export const ownerKeyOf = (owner: HistoryOwner): string =>
  owner.kind === "guest" ? guestOwnerKey(owner.deviceId) : userOwnerKey(owner.userId);

/**
 * Recognises a key this module wrote, or rejects it.
 *
 * STRICT ON PURPOSE, and there is no trimming. The obvious kindness — accepting
 * `"user:12 "` by trimming it — is the wrong direction here: this function's
 * answer decides whether one account's entry may be handed to another, so
 * anything that is not EXACTLY a form we produce is refused rather than
 * interpreted. The round-trip check at the end enforces that literally: a key
 * that does not survive stringify→parse→stringify unchanged is not a key we can
 * reason about, so it is not one we act on.
 *
 * Returns null for a malformed key, which is deliberately NOT the same as "no
 * owner" — see readStoredOwnership, whose three states keep those apart.
 */
export const parseOwnerKey = (key: unknown): HistoryOwner | null => {
  if (typeof key !== "string") return null;

  const separator = key.indexOf(":");
  if (separator === -1) return null;

  const prefix = key.slice(0, separator + 1);
  const suffix = key.slice(separator + 1);

  // A non-empty suffix with no whitespace and no second colon. `guest:` and
  // `user:` alone are refused: an owner with no identity is not an owner.
  if (suffix === "" || /[\s:]/.test(suffix)) return null;

  const owner: HistoryOwner | null =
    prefix === GUEST_PREFIX
      ? { kind: "guest", deviceId: suffix }
      : prefix === USER_PREFIX
        ? { kind: "user", userId: suffix }
        : null;

  if (!owner) return null;

  // The identity invariant: a recognised key re-serialises to itself.
  return ownerKeyOf(owner) === key ? owner : null;
};

/**
 * What a stored entry says about its owner.
 *
 * THREE states, and collapsing any two of them is a bug:
 *
 *   absent     — written before this scheme existed, or written by a path with
 *                no storage to read a device id from. Adoptable: rejecting it
 *                would knowingly discard the history of every existing visitor,
 *                which §15 forbids.
 *   owned      — a key we recognise. Governed by isAdoptable's rule.
 *   unreadable — a value that is present but is not a key we produce: a number,
 *                an object, `""`, `"user:"`, `"user:12 "`. REFUSED. It cannot be
 *                attributed to anyone, and "cannot be attributed" must never
 *                resolve to "anyone's".
 */
export type StoredOwnership =
  | { readonly state: "absent" }
  | { readonly state: "owned"; readonly owner: HistoryOwner }
  | { readonly state: "unreadable"; readonly value: unknown };

export const readStoredOwnership = (entry: OwnedEntry): StoredOwnership => {
  const raw = (entry as { owner?: unknown }).owner;
  if (raw === undefined || raw === null) return { state: "absent" };
  const owner = parseOwnerKey(raw);
  if (!owner) return { state: "unreadable", value: raw };
  return { state: "owned", owner };
};

/** The stored key as written, when there is one we can read. */
export const readOwnerKey = (entry: OwnedEntry): string | null => {
  const stored = readStoredOwnership(entry);
  return stored.state === "owned" ? ownerKeyOf(stored.owner) : null;
};

/** Stamps an entry. Returns a new object; the input is not modified. */
export const stampOwner = <T extends OwnedEntry>(entry: T, owner: HistoryOwner): T =>
  ({ ...entry, owner: ownerKeyOf(owner) });

/**
 * The owner for a session id the server sent, or null when that id is not one
 * this module can read back.
 *
 * It exists because the two halves have to AGREE, and nothing else makes them.
 * A session id is stamped into `user:<id>` and read back through parseOwnerKey,
 * whose strictness is deliberate: `" 12"`, `"12 "`, `"1:2"` and `""` are all
 * refused as keys. So an id of `" 12"` would produce a stamp that this module
 * then classifies as `unreadable` — and an unreadable entry is invisible AND
 * inadoptable, which means the signed-in viewer's own progression would vanish
 * from their screen and stop syncing, silently and for the whole session.
 *
 * The check is the round trip rather than a copy of the rules: build the key and
 * require that parseOwnerKey recognises it. One source of truth for what a
 * usable id is, and it cannot drift from the parser it has to satisfy.
 */
export const ownerForUserId = (userId: unknown): HistoryOwner | null => {
  if (typeof userId === "number") {
    if (!Number.isFinite(userId)) return null;
  } else if (typeof userId !== "string" || userId === "") {
    return null;
  }

  const candidate: HistoryOwner = { kind: "user", userId };
  return parseOwnerKey(ownerKeyOf(candidate)) === null ? null : candidate;
};

/**
 * May this entry be carried into the account `userId`?
 *
 * THE WHOLE ISOLATION RULE, in one place, so it can be tested directly and so
 * both the merge and any future caller cannot each have their own version of it.
 *
 *   absent                     -> yes. Pre-scheme history; the merge's original
 *                                 and intended case. §15: do not lose it.
 *   guest:<any device>         -> yes. localStorage is per-browser, so a guest
 *                                 key present in this store IS this browser's
 *                                 guest history. (Not necessarily the current
 *                                 viewer's — that is a DISPLAY question, and it
 *                                 is answered separately by isVisibleTo below.)
 *   user:<userId>              -> yes. The same account: a re-run must be able
 *                                 to re-sync its own entries.
 *   user:<other account>       -> NO. This is the fix. §8.
 *   user:<unknown target>      -> NO when `userId` is not known: without a
 *                                 session we cannot tell whose account-stamped
 *                                 entry this is, and guessing is the bug.
 *   unreadable                 -> NO. Fail closed.
 */
export const isAdoptable = (
  entry: OwnedEntry,
  targetUserId: string | number | null | undefined,
): boolean => {
  const stored = readStoredOwnership(entry);

  switch (stored.state) {
    case "absent":
      return true;

    case "unreadable":
      return false;

    case "owned":
      if (stored.owner.kind === "guest") return true;
      if (targetUserId === null || targetUserId === undefined) return false;
      return stored.owner.userId === String(targetUserId);
  }
};

/** Splits a local history into what may be merged and what must be left alone. */
export const partitionForAdoption = <T extends OwnedEntry>(
  entries: readonly T[],
  targetUserId: string | number | null | undefined,
): { readonly adoptable: T[]; readonly withheld: T[] } => {
  const adoptable: T[] = [];
  const withheld: T[] = [];
  for (const entry of entries) {
    (isAdoptable(entry, targetUserId) ? adoptable : withheld).push(entry);
  }
  return { adoptable, withheld };
};

/**
 * Re-stamps entries that are now the account's, after a merge has succeeded.
 *
 * Only `absent` and `guest:*` entries move. An entry already owned by an account
 * is left exactly as it is — including one owned by a different account, which
 * must not be silently claimed just because it was in the same list.
 *
 * Returns the new array and whether anything changed, so a caller writes to
 * localStorage only when there is something to write.
 */
export const adoptEntries = <T extends OwnedEntry>(
  entries: readonly T[],
  owner: HistoryOwner,
): { readonly entries: T[]; readonly changed: boolean } => {
  const key = ownerKeyOf(owner);
  let changed = false;

  const next = entries.map((entry) => {
    const stored = readStoredOwnership(entry);
    const adopt =
      stored.state === "absent" ||
      (stored.state === "owned" && stored.owner.kind === "guest");
    if (!adopt) return entry;
    if (readOwnerKey(entry) === key) return entry;
    changed = true;
    return stampOwner(entry, owner);
  });

  return { entries: changed ? next : (entries as T[]), changed };
};

// ─── §2/§3: may this entry be put on screen for this viewer? ───

/**
 * What the application knows about the viewer in front of the screen.
 *
 * THREE states, and the display has exactly three (§3). Collapsing `loading`
 * into `ready` is the flicker: entries would be painted for the viewer we have
 * not identified yet, and a private entry would be on screen for the few
 * milliseconds before its owner was resolved and it was filtered out.
 *
 *   loading — the session probe has not answered. NOTHING owned is shown.
 *   ready   — an answer arrived. `owner` is the account it names, or null for a
 *             visitor with no session (the guest case, which is an ANSWER and
 *             not a missing one).
 *   error   — we asked and could not find out.
 */
export type HistoryViewer =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly owner: HistoryOwner | null }
  | { readonly status: "error" };

/**
 * May this entry be shown to this viewer?
 *
 * THIS IS NOT isAdoptable, and the two must not be merged. isAdoptable answers
 * "may this be RELAYED into that account" — a question about writing, where a
 * refusal costs the viewer a sync. This answers "may this be PAINTED for who is
 * looking now" — where a mistake shows one person another person's history. The
 * same entry can legitimately be adoptable and invisible, or vice versa: an
 * `absent` entry is adoptable by anyone AND shown to anyone, while the answer
 * for another account's entry is "no" on both. Same inputs, different question,
 * so different functions.
 *
 *   viewer loading            -> NOTHING is shown, whatever the entry says.
 *                                There is no viewer to compare against yet, and
 *                                a guess is what §3 forbids. This is why a list
 *                                renders after the probe rather than during it.
 *
 *   viewer error              -> shown only when the entry names NO account:
 *                                `absent` or `guest:*`. The reasoning is the
 *                                asymmetry of the two mistakes. Withholding a
 *                                `user:*` entry on a failed probe can hide the
 *                                signed-in viewer's own history until it
 *                                succeeds — a temporary, self-inflicted,
 *                                recoverable loss. Showing it can hand B the
 *                                titles A watched. So the account-owned side
 *                                fails closed and the unattributed side stays,
 *                                which is also what keeps an offline guest's
 *                                history on screen.
 *
 *   viewer ready, owner null  -> the visitor has NO session, so an entry naming
 *   (the guest case)             an account is definitively not theirs. Hidden.
 *                                Visible: `absent` (pre-scheme, unattributable)
 *                                and `guest:*` (this browser's anonymous
 *                                bucket). `unreadable` is hidden — see below.
 *
 *   viewer ready, owner user:X -> visible when the entry is X's own, when it is
 *                                `absent`, or when it is `guest:*` — the device's
 *                                anonymous history, which the merge adopts into
 *                                X (§7) and which is therefore X's by the
 *                                product's own rule. Hidden when it names any
 *                                OTHER account (§8), including the case that
 *                                matters most: A's session expired with no
 *                                logout, so A's entries sit in this store still
 *                                stamped `user:A` while B signs in.
 *
 *   unreadable, always        -> hidden. A value that is present and is not a
 *                                key we produce could belong to anyone; it must
 *                                never be resolved to the CURRENT viewer by
 *                                default (§2). Note the direction: hidden, but
 *                                still adoptable-or-not on its own terms — the
 *                                read path must not rewrite it to `absent`,
 *                                which would turn refused into adoptable.
 */
export const isVisibleTo = (entry: OwnedEntry, viewer: HistoryViewer): boolean => {
  if (viewer.status === "loading") return false;

  const stored = readStoredOwnership(entry);

  if (viewer.status === "error") {
    return (
      stored.state === "absent" ||
      (stored.state === "owned" && stored.owner.kind === "guest")
    );
  }

  switch (stored.state) {
    case "absent":
      return true;

    case "unreadable":
      return false;

    case "owned":
      if (stored.owner.kind === "guest") return true;
      if (viewer.owner === null || viewer.owner.kind !== "user") return false;
      // `String()` on one side only: the key's suffix is always a string (it
      // came off a string), while the resolved owner's id may be the number
      // `/api/auth/me` sends. `user:012` is a well-formed key that is NOT
      // identity 12 — it fails here, which is the intended strictness rather
      // than an accident of the comparison.
      return stored.owner.userId === String(viewer.owner.userId);
  }
};

/** isVisibleTo over a list, preserving order. */
export const visibleEntriesFor = <T extends OwnedEntry>(
  entries: readonly T[],
  viewer: HistoryViewer,
): T[] => entries.filter((entry) => isVisibleTo(entry, viewer));

// ─── the current owner, for the write path ───

/**
 * The session-proven owner, or null while none is known.
 *
 * Module state and not localStorage: it must NOT be persisted, because a stored
 * "who was signed in" would outlive the session it describes and would claim
 * this visit's writes for a previous visitor — the same defect in a new place.
 * A reload starts unknown, which resolves to guest, which is the safe direction.
 */
let currentOwner: HistoryOwner | null = null;

/**
 * Records the owner a proven session belongs to, or clears it.
 *
 * Called by the merge component once `/api/auth/me` has answered: a session
 * proves the account, and a 401 clears back to guest. It is set on the ANSWER
 * and never in advance — an unproven guess at a user id is what this module
 * exists to prevent.
 */
export const setCurrentOwner = (owner: HistoryOwner | null): void => {
  currentOwner = owner;
};

export const getCurrentOwner = (): HistoryOwner | null => currentOwner;

/** Test seam: the module's memory between cases. */
export const __resetCurrentOwner = (): void => {
  currentOwner = null;
};

// ─── the device id ───

/**
 * The guest storage handle: a random opaque string, no email, no IP, no
 * fingerprint (§6).
 *
 * Lives here rather than in utils/historyManager.ts because BOTH the write path
 * (stamping) and the merge (adoption) need it, and because the literal has to
 * have one owner. `utils/historyManager.ts` imports this so the key a session id
 * is read from and the key an owner is built from cannot drift apart — a second
 * copy of the string would look like a working build while splitting the
 * identity in two.
 */
export const ANON_SESSION_STORAGE_KEY = "anon_session_id";

/**
 * The device id, creating it on first use.
 *
 * Null when there is no usable storage — private mode, site data disabled, a
 * server render. A caller must then stamp nothing rather than invent a value: an
 * unstamped entry is `absent`, which is adoptable, which is exactly how a guest
 * key behaves. So losing storage degrades to the previous behaviour instead of
 * producing a key no account can ever match.
 */
export const getDeviceId = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(ANON_SESSION_STORAGE_KEY);
    if (existing) return existing;
    const created = `anon_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
    window.localStorage.setItem(ANON_SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return null;
  }
};

/**
 * The owner a write should be stamped with, right now.
 *
 * A proven session wins. Otherwise the device's guest key. Otherwise null, and
 * the write goes unstamped — see getDeviceId for why that is the right
 * degradation rather than a fabricated identity.
 */
export const currentWriteOwner = (): HistoryOwner | null => {
  if (currentOwner) return currentOwner;
  const deviceId = getDeviceId();
  return deviceId === null ? null : { kind: "guest", deviceId };
};

/** The key a write should be stamped with, or null to leave it unstamped. */
export const currentWriteOwnerKey = (): string | null => {
  const owner = currentWriteOwner();
  return owner === null ? null : ownerKeyOf(owner);
};
