/**
 * WHAT A HISTORY LIST SHOWS, DECIDED ONCE.
 *
 * There are now two places that paint a viewer's history — "Reprendre la
 * lecture" on the home page and the history tab of the profile — and the rule
 * that decides what appears there is not a rendering detail. It is the read
 * side of the same ownership rule the write side applies, and if the two
 * surfaces ever disagreed, the disagreement would be a privacy defect on one of
 * them rather than a cosmetic one.
 *
 * So the decision lives here, as pure functions over plain values: no React, no
 * fetch, no localStorage, no `window`. That is what lets it be tested directly
 * (tests/historyList.test.ts) instead of only through a component that needs a
 * browser to run.
 *
 * The two questions it answers, kept separate because they are not the same
 * question:
 *
 *   1. MAY THIS BE SHOWN TO THIS VIEWER? That is `visibleEntriesFor`, imported
 *      and not reimplemented. It is the §5/§23 rule: A's session expires with no
 *      logout, so nothing removes A's entries, and B signs in on the same
 *      browser. An entry naming another account is hidden; an entry naming no
 *      account, or this device's anonymous bucket, stays.
 *
 *   2. DOES THIS BELONG IN *THIS* LIST? "Reprendre la lecture" is a list of
 *      things to resume; the profile's history is the record of what was
 *      watched. A finished film belongs in the second and not the first. Both
 *      are answered from the same merged list, so they cannot disagree about
 *      which position is current.
 */

import {
  isCompleted,
  mergeWatchEntries,
  type WatchHistoryItem,
} from "@/utils/historyManager";
import { visibleEntriesFor, type HistoryViewer } from "@/lib/historyOwnership";

/** The identity of an entry: type AND id, never the id alone. */
export const sameTitle = (a: WatchHistoryItem, b: WatchHistoryItem): boolean =>
  a.id === b.id && a.type === b.type;

/**
 * The name to paint for an entry, which is not always `item.title`.
 *
 * Measured in the browser on 2026-09-23, once `GET /api/watch-time` had stopped
 * hiding title-less rows: an entry whose title was never stored rendered as an
 * `<h3>` holding the empty string — a poster, a provider, a timecode and no name.
 * The viewer cannot tell what it is, which is what "the history doesn't work"
 * looks like from the outside.
 *
 * `ID: <id>` is the spelling this codebase already uses for exactly this
 * situation, in the server read path (utils/historyManager.ts,
 * `getServerWatchHistory`, where a NULL title becomes `ID: <media_id>`). That one
 * must stay there rather than be folded into this: on that path the string is the
 * entry's IDENTITY and enters `mergeWatchEntries` as such, which is what lets it
 * beat a local empty title. This is the same fallback for a LOCAL row — one that
 * knows its id and not its name.
 *
 * Nothing is invented. The id is a fact we hold, and when we hold no name it is
 * the only thing that can honestly be said about the entry. A real title always
 * wins.
 *
 * `||` and not `??`: the storage layer normalises every non-string title to the
 * empty string (`normaliseItem`), so `""` and absent mean the same thing here.
 * `id` is guaranteed non-empty — `normaliseItem` returns null for an entry
 * without one, so an entry cannot exist in the store with nothing to name it by.
 */
export const displayTitleFor = (item: WatchHistoryItem): string =>
  item.title || `ID: ${item.id}`;

/** The key the per-title merge is indexed by. */
export const historyKey = (item: WatchHistoryItem): string =>
  `${item.type}:${item.id}`;

/**
 * Combines the two copies of a viewer's history into one list.
 *
 * The previous version took the server list whenever it was non-empty and threw
 * the local one away. That is the "history lost" defect seen from the other
 * side: a signed-in viewer who watched something in this browser saw a list
 * that did not contain it, because the server row had not been read back yet.
 *
 * The per-title decision is `mergeWatchEntries`, which is also the guest →
 * account rule. It is called and not reimplemented so that the list on screen,
 * the local store and the database cannot disagree about which position is the
 * right one. The local list is passed as the incoming side because it is the
 * more recent observation of the two on this device; where positions or
 * episodes disagree, `mergeWatchEntries` decides on the values, not on the
 * argument order.
 *
 * @param server rows read from the account's copy. Already the viewer's own —
 *   the endpoint that produced them filters on the session cookie — so they are
 *   NOT filtered again here. The server sends no `owner` field, so every one of
 *   them would read as `absent`, which is adoptable-and-visible: the filter
 *   would be a no-op that only looked like a check.
 * @param local rows from this browser's store, which is SHARED by everyone who
 *   uses this browser and is therefore the side that must be filtered.
 */
export const mergeHistories = (
  server: readonly WatchHistoryItem[],
  local: readonly WatchHistoryItem[],
  viewer: HistoryViewer,
): WatchHistoryItem[] => {
  const byTitle = new Map<string, WatchHistoryItem>();

  for (const item of server) byTitle.set(historyKey(item), item);

  for (const item of visibleEntriesFor(local, viewer)) {
    const existing = byTitle.get(historyKey(item));
    byTitle.set(historyKey(item), mergeWatchEntries(existing, item));
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
export const belongsInContinueWatching = (item: WatchHistoryItem): boolean => {
  if (item.type === "tv") return true;
  return !isCompleted(item.timestamp, item.duration);
};

export interface HistoryDisplayInput {
  /** The account's copy, or `[]` when there is no account or it could not be read. */
  readonly server: readonly WatchHistoryItem[];
  /** This browser's copy, unfiltered. Visibility is applied inside. */
  readonly local: readonly WatchHistoryItem[];
  /** Who is looking, resolved before any owned entry is read. */
  readonly viewer: HistoryViewer;
  /**
   * Keep entries that are over.
   *
   * `false` for "Reprendre la lecture" (a finished film is not something to
   * resume), `true` for the profile, whose subject is the record itself: a film
   * watched to the end is exactly what belongs there, and dropping it would
   * make the profile's history contradict the home page's for reasons the
   * viewer cannot see.
   */
  readonly includeCompleted?: boolean;
}

export const historyForDisplay = ({
  server,
  local,
  viewer,
  includeCompleted = false,
}: HistoryDisplayInput): WatchHistoryItem[] => {
  const merged = mergeHistories(server, local, viewer);
  return includeCompleted
    ? merged
    : merged.filter(belongsInContinueWatching);
};
