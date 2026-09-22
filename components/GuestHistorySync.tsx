"use client";

/**
 * Carries a GUEST's watch history into the account when they sign in (§9).
 *
 * The requirement is that creating an account must not lose the progress built
 * up while browsing anonymously. The mechanism is deliberately the ordinary
 * write path — `pushLocalHistoryToAccount` replays every local entry through the
 * same merge and the same write the player uses, so the server sees the same
 * payload it would have seen at the time, and the route applies the same
 * no-regression rule on top. A second, "bulk import" endpoint would have needed
 * its own copy of that rule, and §9's guarantee is only worth having if there is
 * exactly one of it.
 *
 * Renders nothing. It is mounted app-wide rather than on the login screen
 * because a visitor can arrive signed-in without ever passing through a form:
 * an OAuth callback, a restored cookie, a second tab. Keying the merge on
 * "there is now an account and there is local history to carry" covers all of
 * those, and a form-specific hook would cover only one.
 *
 * WHY IT RE-ASKS ON EVERY NAVIGATION, AND WHAT THAT COSTS
 *
 * The first version of this component probed `/api/auth/me` at most once per tab
 * and recorded the attempt in `sessionStorage` BEFORE the answer was known. That
 * flag survived reloads and client-side navigation, and this component lives in
 * the layout, so signing in on a page never remounted it. The result was that
 * the merge could not run in the tab where the sign-in happened — the one
 * scenario §9 is about — and only took effect for a new tab or a full reload.
 * The flag is gone.
 *
 * What replaced it is a probe on mount and on every pathname change, with two
 * cheap guards in front of it: no local history means no request at all, and a
 * visitor who is already signed in asks only once per page load (see
 * `mergeConcluded`). A guest with local history does spend one lightweight
 * `GET /api/auth/me` per navigation, which is the deliberate price of noticing
 * the sign-in where it happens; the request is a cookie read that answers 401
 * for a visitor with no session. §14's concern is a request per rendered frame
 * or per second, not one per navigation.
 *
 * WHAT IT DOES NOT DO
 *
 *  - It does not call the server when there is nothing to merge. A visitor with
 *    no local history — every first-time visitor — makes no request at all.
 *  - It does not delete the local copy. One person, one device, a new account:
 *    the local entries stay, so a later sign-out does not take away progress
 *    they can still see on this machine. The sign-out path clears them, which
 *    is the boundary that protects a shared browser (§23).
 *  - It does not send a `session_id`. The merge is authenticated writes; the
 *    server identifies the account from the token and from nothing else.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { resolveHistoryOwner } from "@/lib/historyViewer";
import {
  HISTORY_UPDATED_EVENT,
  getWatchHistory,
  pushLocalHistoryToAccount,
} from "@/utils/historyManager";

/** Marks the merge as done, per account, so it is not repeated on every load. */
const MERGE_MARKER_PREFIX = "guest_history_merged_for_user";

/**
 * Set once this tab has finished asking — the account's marker was found, or the
 * merge ran and was recorded.
 *
 * Deliberately module state and not a ref: it has to survive a re-render caused
 * by navigation, which is the event that re-runs the effect. Deliberately NOT
 * persisted either: a reload must ask again, because the cookie may have changed
 * while the tab was closed.
 *
 * It is not set when the probe finds no session, so a guest's next navigation
 * asks again — which is how the sign-in gets noticed.
 */
let mergeConcluded = false;

export default function GuestHistorySync() {
  // Re-probed on navigation, not only on mount. A visitor who signs in on the
  // page they are already on produces no remount — this component is mounted by
  // the layout, and the login form navigates with `router.push('/')`, which
  // re-renders the route without unmounting it — so a mount-only probe would
  // never see the account that had just appeared.
  const pathname = usePathname();

  useEffect(() => {
    const run = async () => {
      try {
        // Local and free, and it comes first: after a sign-out the local history
        // has been cleared, so this is also the path that makes a signed-out tab
        // stop asking.
        if (getWatchHistory().length === 0) return;

        // Already settled in this tab. This is what keeps a signed-in visitor's
        // cost at one request per page load rather than one per navigation.
        if (mergeConcluded) return;

        // ONE PROBE, SHARED. This used to be a `fetch("/api/auth/me")` of its
        // own, and that was a real defect rather than duplication: two
        // independent probes can answer differently — one lands after the other,
        // or one fails while the other succeeds — and then this component would
        // relay entries stamped for an account the list was NOT filtering
        // against. The resolver is the single answer, and it owns the two side
        // effects that have to follow it: the module owner (so every write from
        // here on is stamped `user:<id>`) and the sync latch reset (so a tab that
        // was anonymous and then signed in can write to the server at all —
        // audit finding F2; the latch is set by a guest's first 401).
        //
        // Both are set by the resolver on the ANSWER only. Nothing is inferred:
        // the id comes from the cookie via the server, never from anything the
        // client chose (§6 — no email, no IP, no fingerprint).
        const viewer = await resolveHistoryOwner({ refresh: true });

        // `loading` cannot occur here (`refresh` always probes) and `error`
        // means the question was asked and not answered. Neither is a reason to
        // conclude anything about the merge, so both return without marking it
        // done — the next navigation asks again. Note the difference from a 401:
        // that IS an answer, it arrives as `ready` with no owner, and it clears
        // the stamp so a tab whose cookie expired stops writing as the departed
        // account.
        if (viewer.status !== "ready") return;

        // No account behind this request: nothing to merge. A guest's entries
        // stay a guest's.
        if (viewer.owner === null || viewer.owner.kind !== "user") return;
        const userId = viewer.owner.userId;

        const marker = `${MERGE_MARKER_PREFIX}:${userId}`;
        if (window.localStorage.getItem(marker)) {
          mergeConcluded = true;
          return;
        }

        // The result's `withheld` count is read nowhere, deliberately. It counts
        // entries stamped for a DIFFERENT account — someone else's history left
        // in this browser by a session that ended without the logout button —
        // which this merge must not carry into this account (§8). They are left
        // in localStorage, and there is no action to take on them here: deleting
        // another account's entries because a second person signed in would be
        // data loss, and this component is not the owner of that decision.
        const merge = await pushLocalHistoryToAccount(userId);

        // The marker is written ONLY for a relay that fully succeeded. Writing it
        // after a partial one is what made a partial merge permanent: the entries
        // that failed were never retried, because the marker said the work was
        // done (audit finding F3). Left unset, the next navigation tries again —
        // and the merge is cheap, because each entry it does carry is already on
        // the server and the route's no-regression rule accepts it unchanged.
        if (merge.allSynced) {
          window.localStorage.setItem(marker, String(Date.now()));
          mergeConcluded = true;
        }

        // A list already on screen should pick the merged entries up. The event
        // is the same one the delete and sign-out paths use, and it is not fired
        // by playback (§14).
        if (merge.total > 0) {
          window.dispatchEvent(new Event(HISTORY_UPDATED_EVENT));
        }
      } catch {
        // Non-critical. The local history is untouched, and the next navigation
        // tries again because nothing was marked as done.
      }
    };

    void run();
  }, [pathname]);

  return null;
}
