/**
 * WHO IS LOOKING — resolved once, before anything owned by a previous viewer is
 * painted (§2/§3).
 *
 * ─── THE RESIDUE THIS CLOSES ─────────────────────────────────────────────────
 *
 * The merge learned to refuse another account's entries (§8), so A's history can
 * no longer be CARRIED into B's account. It could still be SHOWN to B. A's
 * entries sit in this browser stamped `user:A` — A's session expired without the
 * logout button, so no code of ours ran and nothing removed them — and the list
 * rendered everything it found in the store. The protection was on the write
 * path while the leak was on the read path.
 *
 * The rule that closes it lives in lib/historyOwnership.ts (`isVisibleTo`), and
 * it needs one input: the viewer. This module is that input, and it is the only
 * place allowed to produce it.
 *
 * ─── ONE PROBE, THREE CONSUMERS ──────────────────────────────────────────────
 *
 * Three things need the answer: the history list (to filter), the merge
 * component (to know whether to relay, and what to adopt into), and the write
 * path (to stamp). They must get the SAME answer, or the list filters against a
 * viewer the stamping path did not use — and the two disagreeing is how an entry
 * becomes invisible to its own author.
 *
 * So the probe is deduplicated here rather than repeated per caller. This module
 * adds no request to the set the application already makes: it is the one the
 * merge component and the list share. (`components/Header.tsx` keeps its own,
 * because that one answers a different question — may this visitor see the admin
 * link, is this account banned — and folding the two would make history display
 * depend on the header's auth flow.)
 *
 * ─── NO FLICKER, AND WHY THE PREVIOUS ANSWER IS KEPT ─────────────────────────
 *
 * §3 asks for two things that pull in opposite directions, and the resolution is
 * the difference between the FIRST answer of a page load and a later one:
 *
 *  - On the first probe nothing is known, so the state is `loading` and every
 *    owned entry is withheld. That is what stops A's entries being painted for a
 *    moment on a browser where B is about to sign in.
 *  - On a LATER probe — a navigation, or a sign-in noticed in the same tab — the
 *    previous ANSWER is kept until the new one arrives. Returning to `loading`
 *    would blank the list on every navigation, and the previous answer is the
 *    best available statement about who is looking: while A's session is still
 *    the one the server recognises, showing A their own entries is correct. The
 *    switch happens on the answer, not before it.
 *
 * Neither rule lets B see A's entries: the first withholds them because nobody is
 * identified, the second shows them only while A is still the identified viewer.
 *
 * ─── WHAT AN ANSWER MEANS ────────────────────────────────────────────────────
 *
 * `interpretAuthResponse` is pure and separate from the transport, so the
 * decision is testable without a network. A 401/403 is an ANSWER — this visitor
 * has no session — and produces `ready` with no owner. Only a response we cannot
 * read, or a request that never completed, is `error`, and an `error` after a
 * resolved viewer keeps the resolved one.
 */

import {
  ownerForUserId,
  setCurrentOwner,
  type HistoryViewer,
} from "@/lib/historyOwnership";
import { __resetServerSyncLatch } from "@/utils/historyManager";

/** The two things a probe can tell us: the status, and whatever body came with it. */
export interface AuthResponse {
  readonly status: number;
  readonly body: unknown;
}

/**
 * What an answer from /api/auth/me means. PURE.
 *
 * The id is narrowed through `ownerForUserId` and not trusted as sent: an id
 * that cannot be turned into a key `parseOwnerKey` reads back would make every
 * entry this session writes unreadable — and an unreadable entry is hidden from
 * its own author and inadoptable, so the viewer's progression would stop
 * appearing and stop syncing, silently, for the whole session. An id we cannot
 * use is therefore `error` — we did not establish who this is — and not an
 * account we half-recognised.
 */
export const interpretAuthResponse = (res: AuthResponse): HistoryViewer => {
  if (res.status !== 200) {
    // 401 (no cookie) and 403 (banned) are both a real answer: this request has
    // no session behind it, so the viewer owns no account. They differ only in
    // whether the visitor exists at all, which is not a question the display
    // asks. Anything else — a 500, a 0 from a failed fetch — is not an answer.
    return res.status === 401 || res.status === 403
      ? { status: "ready", owner: null }
      : { status: "error" };
  }

  const body = res.body as { user?: { id?: unknown } } | null | undefined;
  const owner = ownerForUserId(body?.user?.id);

  // A 200 that names no usable account is a shape we cannot act on. It is NOT
  // read as "guest": a guest's answer is a 401, and treating a malformed success
  // as the absence of a session would quietly clear a real owner.
  return owner === null ? { status: "error" } : { status: "ready", owner };
};

/** The real transport. The only impure part of this module. */
const defaultProbe = async (): Promise<AuthResponse> => {
  const res = await fetch("/api/auth/me");
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // A refusal with no JSON body is normal for a 401 from middleware.
    body = null;
  }
  return { status: res.status, body };
};

let probe: () => Promise<AuthResponse> = defaultProbe;

/**
 * The state, and it starts at `loading` on every page load.
 *
 * Module state and not storage, for the same reason the write-side owner is: a
 * persisted "who was signed in" outlives the session it describes. A reload
 * genuinely does not know yet, and says so.
 */
let viewer: HistoryViewer = { status: "loading" };

/** The in-flight probe, so concurrent callers await one request rather than two. */
let inFlight: Promise<HistoryViewer> | null = null;

/** Monotonic, so a slow answer cannot overwrite a newer one. */
let sequence = 0;

export const getHistoryViewer = (): HistoryViewer => viewer;

/**
 * Records an answer.
 *
 * Setting the module owner is part of resolving, not a side effect to be
 * duplicated at each call site: the answer IS the proof, and the write path must
 * stamp with the identity the list filtered against. A `ready` answer with no
 * owner CLEARS it — that is the expiry and the manually-deleted-cookie path,
 * where the next writes must be a guest's and not the departed account's.
 */
const apply = (answer: HistoryViewer): HistoryViewer => {
  viewer = answer;
  if (answer.status === "ready") {
    setCurrentOwner(answer.owner);
    if (answer.owner !== null) {
      // A proven session must be able to write. The latch is set by a guest's
      // first 401, so a tab that was anonymous and then signed in would otherwise
      // save to localStorage forever while the server row stayed behind.
      __resetServerSyncLatch();
    }
  }
  return answer;
};

/**
 * Asks, unless something is already asking.
 *
 * `refresh` is what the merge component wants on a navigation: it re-checks, so a
 * sign-in performed in this tab is noticed without a reload. Without it, an
 * already-resolved viewer is returned as-is and no request is made — which is
 * what keeps a list that re-reads itself from costing a probe each time.
 */
export const resolveHistoryOwner = (
  options: { readonly refresh?: boolean } = {},
): Promise<HistoryViewer> => {
  if (!options.refresh) {
    if (viewer.status !== "loading") return Promise.resolve(viewer);
    if (inFlight) return inFlight;
  }

  const mine = ++sequence;
  const attempt = (async (): Promise<HistoryViewer> => {
    let answer: HistoryViewer;
    try {
      answer = interpretAuthResponse(await probe());
    } catch {
      answer = { status: "error" };
    }

    // A failed re-probe keeps what was already resolved. Downgrading to `error`
    // would take a signed-in viewer's own history off the screen over one dropped
    // request, and the state we hold is still the server's last statement about
    // who is looking.
    if (answer.status === "error" && viewer.status === "ready") return viewer;

    // Superseded by a newer probe: two navigations in quick succession can have
    // their answers land out of order, and the older one must not win.
    if (mine !== sequence) return viewer;

    return apply(answer);
  })();

  inFlight = attempt;
  void attempt.then(() => {
    if (inFlight === attempt) inFlight = null;
  });

  return attempt;
};

/** Test seam: the module's memory between cases. */
export const __resetHistoryViewer = (): void => {
  viewer = { status: "loading" };
  inFlight = null;
  sequence = 0;
};

/** Test seam: drive the probe without a network. Pass null to restore the real one. */
export const __setAuthProbe = (fn: (() => Promise<AuthResponse>) | null): void => {
  probe = fn ?? defaultProbe;
};
