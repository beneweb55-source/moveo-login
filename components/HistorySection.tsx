"use client";

import React, { useState, useEffect, useCallback } from "react";
import Carousel from "@/components/Carousel";
import HistoryCard from "@/components/HistoryCard";
import {
  getWatchHistory,
  getServerWatchHistory,
  mergeWatchEntries,
  removeFromHistory,
  removeServerHistoryItem,
  isCompleted,
  HISTORY_UPDATED_EVENT,
  WatchHistoryItem,
} from "@/utils/historyManager";
import { visibleEntriesFor, type HistoryViewer } from "@/lib/historyOwnership";
import { resolveHistoryOwner } from "@/lib/historyViewer";
import { History } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

/** The identity of an entry: type AND id, never the id alone. */
const sameTitle = (a: WatchHistoryItem, b: WatchHistoryItem) =>
  a.id === b.id && a.type === b.type;

/**
 * Combines the two copies of a viewer's history into one list.
 *
 * The previous version took the server list whenever it was non-empty and threw
 * the local one away. That is the "history lost" defect seen from the other
 * side: a signed-in viewer who watched something in this browser saw a list
 * that did not contain it, because the server row had not been read back yet.
 *
 * The per-title decision is `mergeWatchEntries`, which is also the guest →
 * account rule (§9). It is called and not reimplemented so that the list on
 * screen, the local store and the database cannot disagree about which position
 * is the right one. The local list is passed as the incoming side because it is
 * the more recent observation of the two on this device; where positions or
 * episodes disagree, `mergeWatchEntries` decides on the values, not on the
 * argument order.
 */
const mergeHistories = (
  server: WatchHistoryItem[],
  local: WatchHistoryItem[],
  viewer: HistoryViewer,
): WatchHistoryItem[] => {
  const byTitle = new Map<string, WatchHistoryItem>();
  const key = (item: WatchHistoryItem) => `${item.type}:${item.id}`;

  // The server list passes through UNFILTERED, and that is not an exception to
  // the display rule — it is the same rule applied where it belongs. Those rows
  // came back from an endpoint that answers for the account named by the
  // `auth_token` cookie and for nobody else (`GET /api/watch-time` filters
  // `user_id = $1`), so they are already the viewer's own. Filtering them again
  // against a locally stored owner would be worse than redundant: the server
  // does not send an `owner` field, so every row would be read as `absent`,
  // which is adoptable-and-visible — i.e. the filter would be a no-op that only
  // looked like a check.
  for (const item of server) byTitle.set(key(item), item);

  // The LOCAL list is where the leak was, and this is the line that closes it.
  // These entries sit in a store shared by everyone who uses this browser, and
  // §5/§23 name the case precisely: A's session expires with no logout, so no
  // code of ours ran and nothing removed A's entries — then B signs in here.
  // Without this filter B is shown A's titles from their own machine. The rule
  // is `isVisibleTo`, which fails closed on an account-stamped entry whenever
  // the viewer is not that account, and withholds EVERYTHING while the session
  // probe is still outstanding — so nothing private is painted for the few
  // milliseconds before we know who is looking.
  for (const item of visibleEntriesFor(local, viewer)) {
    const existing = byTitle.get(key(item));
    byTitle.set(key(item), mergeWatchEntries(existing, item));
  }

  return [...byTitle.values()].sort((a, b) => b.last_watched - a.last_watched);
};

/**
 * What belongs in "Reprendre la lecture".
 *
 * A finished FILM is dropped: it is over, and offering to resume it is noise.
 *
 * A finished EPISODE of a series is KEPT. The history does not know how many
 * episodes the season has, so "this episode is finished" says nothing about
 * whether the series is, and dropping the row would remove a show the viewer is
 * in the middle of from their Continue Watching. The card says "Revoir" for it
 * rather than "Continuer", so the entry still tells the truth.
 */
const belongsInContinueWatching = (item: WatchHistoryItem): boolean => {
  if (item.type === "tv") return true;
  return !isCompleted(item.timestamp, item.duration);
};

const HistorySection = () => {
  const [history, setHistory] = useState<WatchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();

  const loadHistory = useCallback(async () => {
    // The whole body is guarded and `setLoading(false)` sits in a `finally`.
    // It used to be reachable only on the success path: any throw from the
    // storage read left this section on its loading state permanently, with
    // nothing on screen to say why.
    try {
      // WHO IS LOOKING, resolved before anything owned is read (§2/§3).
      //
      // This is awaited FIRST and not in parallel with the fetches below, because
      // the answer decides whether the local entries may be read at all: with the
      // probe still outstanding the state is `loading`, every owned entry is
      // withheld, and the list renders empty. That is the intended shape — the
      // alternative paints A's titles for a frame on a browser where B is about
      // to be identified. A later call resolves from memory and costs no request,
      // so this is not one probe per render.
      const viewer = await resolveHistoryOwner();

      // The server copy exists only for a signed-in viewer; a guest's request
      // answers 401 and yields an empty list, which the merge treats as "no
      // server copy" rather than as "no history".
      let serverItems: WatchHistoryItem[] = [];
      try {
        serverItems = await getServerWatchHistory();
      } catch {
        // Offline, or the endpoint refused. The local copy is still the
        // viewer's history and is used on its own.
      }

      const merged = mergeHistories(serverItems, getWatchHistory(), viewer);
      setHistory(merged.filter(belongsInContinueWatching));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  /**
   * Re-reads after a direct change made elsewhere — the history cleared on
   * sign-out is the case that matters. Without this, signing out left the
   * previous viewer's titles on the home page until a manual reload.
   *
   * Only the deliberate actions announce (§14): a position saved during
   * playback does not, so this cannot become a re-fetch loop driven by the
   * player's own save interval.
   */
  useEffect(() => {
    const onChanged = () => { void loadHistory(); };
    window.addEventListener(HISTORY_UPDATED_EVENT, onChanged);
    return () => window.removeEventListener(HISTORY_UPDATED_EVENT, onChanged);
  }, [loadHistory]);

  /**
   * Removes an entry from both copies.
   *
   * Local removal alone would be a half-truth for a signed-in viewer: the row
   * would come back from the server on the next load, so the button would look
   * like it had failed. The server call is only attempted when there is an
   * account behind it, and it is not awaited — the list must update on the
   * click, not on the network.
   */
  const handleRemove = useCallback((item: WatchHistoryItem) => {
    removeFromHistory(item.id, item.type);
    void removeServerHistoryItem(item.type, item.id);
    setHistory((previous) => previous.filter((entry) => !sameTitle(entry, item)));
  }, []);

  if (history.length === 0) {
    return null;
  }

  return (
    <div className="relative mb-12">
      <h2 className="text-2xl md:text-3xl font-bold mb-8 text-white flex items-center gap-2">
        <span className="w-1 h-8 bg-[#E50914] rounded-full mr-2"></span>
        <History className="w-6 h-6 text-[#E50914]" />
        {t.home.resumeWatching}
      </h2>

      <Carousel
        data={history}
        loading={loading}
        renderItem={(item) => <HistoryCard item={item} onRemove={handleRemove} />}
      />
    </div>
  );
};

export default HistorySection;
