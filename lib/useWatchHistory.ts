"use client";

/**
 * THE HISTORY LIST, LOADED ONE WAY FOR EVERY SURFACE THAT SHOWS ONE.
 *
 * The home page's "Reprendre la lecture" and the profile's history tab are the
 * same list read from the same two copies — this browser's store and the
 * account's — and they must not be able to disagree about it. The rule that
 * decides what may be shown, and what belongs in which list, lives in
 * lib/historyList.ts; this module is only the part that needs a browser: the
 * session probe, the two reads, and the re-read after a deliberate change.
 *
 * WHAT IT ADDS OVER THE COMPONENT IT REPLACED
 *
 * A signed-in viewer's account copy can fail to load, and until now that failure
 * and an empty history were the same event: `getServerWatchHistory` answered
 * `[]` for both, so the list simply came up short and said nothing. The viewer
 * whose rows did not load saw a list missing titles they had watched, which
 * reads as "my history is gone" — a statement about their data made by a request
 * that never returned any. `serverUnavailable` is that distinction, and it is
 * only ever set when an account was PROVEN to exist and its copy could not be
 * read: a guest had nothing to read and is not told that anything failed.
 *
 * The local rows are still shown in that case. This browser's copy is real, it
 * is what a guest's history entirely consists of, and withholding it would trade
 * a partial truth for a total absence.
 */

import { useCallback, useEffect, useState } from "react";
import {
  getServerWatchHistory,
  getWatchHistory,
  removeFromHistory,
  removeServerHistoryItem,
  HISTORY_UPDATED_EVENT,
  type WatchHistoryItem,
} from "@/utils/historyManager";
import { resolveHistoryOwner } from "@/lib/historyViewer";
import { historyForDisplay, sameTitle } from "@/lib/historyList";

export interface WatchHistoryOptions {
  /**
   * Keep entries that are over. `true` for the profile, whose subject is the
   * record; the default (false) is "Reprendre la lecture", where a finished film
   * is noise. See lib/historyList.ts.
   */
  readonly includeCompleted?: boolean;
}

export interface WatchHistoryState {
  readonly items: WatchHistoryItem[];
  readonly loading: boolean;
  /**
   * A proven account's copy could not be read. The list on screen is then this
   * browser's copy only, and it may be incomplete — which the caller must say,
   * because otherwise the list is the only thing the viewer sees and it looks
   * complete.
   */
  readonly serverUnavailable: boolean;
  readonly remove: (item: WatchHistoryItem) => void;
}

export const useWatchHistory = (
  { includeCompleted = false }: WatchHistoryOptions = {},
): WatchHistoryState => {
  const [items, setItems] = useState<WatchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [serverUnavailable, setServerUnavailable] = useState(false);

  const load = useCallback(async () => {
    // The whole body is guarded and `setLoading(false)` sits in a `finally`.
    // Reached only on the success path, a throw from the storage read or the
    // probe left a list on its loading state permanently, with nothing on screen
    // to say why.
    try {
      // WHO IS LOOKING, resolved before anything owned is read.
      //
      // Awaited FIRST and not in parallel with the fetch below, because the
      // answer decides whether the local entries may be read at all: with the
      // probe outstanding the state is `loading`, every owned entry is withheld,
      // and the list renders empty. That shape is intended — the alternative
      // paints A's titles for a frame on a browser where B is about to be
      // identified. A later call resolves from memory and costs no request, so
      // this is not one probe per render.
      const viewer = await resolveHistoryOwner();

      let server: WatchHistoryItem[] = [];
      let unavailable = false;

      // The account's copy exists only for a PROVEN account. A guest's request
      // would answer with no rows, which is not an error — there is simply
      // nothing on the server to read, and the local rows are the answer.
      if (viewer.status === "ready" && viewer.owner?.kind === "user") {
        try {
          server = await getServerWatchHistory();
        } catch (error) {
          // A proven account whose copy could not be read. Named and carried,
          // not swallowed: the list below is about to be shorter than the
          // truth, and the caller has to be able to say so.
          console.error("[useWatchHistory] account history unreadable:", error);
          unavailable = true;
        }
      }

      setServerUnavailable(unavailable);
      setItems(
        historyForDisplay({
          server,
          local: getWatchHistory(),
          viewer,
          includeCompleted,
        }),
      );
    } catch (error) {
      // The probe itself failed. Nothing is claimed about anyone: no rows, and
      // no failure notice, because we never established that there was an
      // account to read.
      console.error("[useWatchHistory] could not resolve the viewer:", error);
      setServerUnavailable(false);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [includeCompleted]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Re-reads after a DIRECT change made elsewhere — the history cleared on
   * sign-out is the case that matters. Without this, signing out left the
   * previous viewer's titles on screen until a manual reload.
   *
   * Only deliberate actions announce (§14): a position saved during playback
   * does not, so this cannot become a re-fetch loop driven by the player's own
   * save interval.
   */
  useEffect(() => {
    const onChanged = () => {
      void load();
    };
    window.addEventListener(HISTORY_UPDATED_EVENT, onChanged);
    return () => window.removeEventListener(HISTORY_UPDATED_EVENT, onChanged);
  }, [load]);

  /**
   * Removes an entry from both copies.
   *
   * Local removal alone would be a half-truth for a signed-in viewer: the row
   * would come back from the server on the next load, so the button would look
   * like it had failed. The server call is only attempted when there is an
   * account behind it — `removeServerHistoryItem` checks that itself — and it is
   * not awaited: the list must update on the click, not on the network.
   */
  const remove = useCallback((item: WatchHistoryItem) => {
    removeFromHistory(item.id, item.type);
    void removeServerHistoryItem(item.type, item.id);
    setItems((previous) => previous.filter((entry) => !sameTitle(entry, item)));
  }, []);

  return { items, loading, serverUnavailable, remove };
};
