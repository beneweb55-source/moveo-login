/**
 * THE ONE THING THE MOVIE PAGE IS ENTITLED TO WRITE DOWN.
 *
 * Pure module: no React, no DOM, no `Date.now()`, no storage. Tested in
 * tests/movieWatchRecord.test.ts. The page keeps the click handler and the
 * persistence call; the DECISION about what such an entry may claim lives here,
 * so it can be driven by a test that does not need a browser.
 *
 * ─── WHY THE MOVIE PAGE NEEDED THIS AT ALL ───────────────────────────────────
 *
 * A history entry is written by exactly one of three paths:
 *
 *   1. the provider's own `postMessage`, via VideoPlayer's handler;
 *   2. WatchTimer's minute ticks;
 *   3. the viewer deliberately picking something — today, a slot on the series
 *      page (`app/tv/[id]/page.tsx`).
 *
 * The movie page had only the first two, and BOTH begin at
 * `parsePlaybackProgress`, which returns `null` for every message when the
 * active provider's `messageOrigins` is empty (`lib/playerMessages.ts`, rule 1).
 * Measured 2026-09-23: the source a first-time visitor is handed for a film is
 * SmashyStream, whose allowlist is `[]`. So for a film NOTHING was written —
 * not a position, not a minute, not even a local row — and a film watched in
 * full left no trace. That is the reported defect: the watch history did not
 * work, for exactly the content class where it is most used.
 *
 * Path 3 is the one that does not depend on a provider's cooperation, which is
 * why the remedy is to give the movie page the writer it never had.
 *
 * ─── OPENING A PAGE IS NOT WATCHING IT ───────────────────────────────────────
 *
 * This function is called ONLY from the viewer pressing Regarder on this title —
 * never on mount. That is the same rule the series page applies to a slot, and
 * the same one the brief states for progress (§13): an iframe `load`, a mounted
 * player and a clock are not playback evidence. A page-open write would fill
 * Continue Watching with films that were merely glanced at, which is the defect
 * the series page's own comment records for the default slot.
 *
 * ─── WHAT THE ENTRY CLAIMS, AND WHAT IT REFUSES TO ───────────────────────────
 *
 * It carries NO `timestamp` and NO `duration`. No position has been measured, so
 * none is written: `0` is a real position (the start of the film), and storing
 * it as a stand-in for "unknown" is what makes a Reprendre button lie (§3/§4,
 * and see the `timestamp` field's own note in utils/historyManager.ts).
 *
 * It carries no `season`/`episode` either, so a film can never be read as a slot
 * of something.
 *
 * The absence is SAFE, which is what makes this worth writing at all:
 * `normaliseItem` preserves it, and `mergeWatchEntries` lets a stored position
 * outrank an incoming observation that has none — so this write can never roll a
 * real progression back (§1). That merge rule is pinned by
 * tests/historyList.test.ts and is deliberately NOT re-asserted here: a second
 * copy of a rule is a second thing to keep in step.
 *
 * Once a provider that CAN report a position is playing, its write supplies one
 * for this same row — at which point the entry stops being "you chose this" and
 * becomes "you are 42 minutes in".
 */

import type { WatchHistoryItem } from "@/utils/historyManager";

export interface MovieWatchRecordInput {
  /** The TMDB id from the route. */
  readonly id: unknown;
  /** TMDB's title for this film. Its absence means there is nothing to name. */
  readonly title?: string | null;
  readonly posterPath?: string | null;
  /**
   * The provider already stored for this title, carried over unchanged so a
   * later visit does not blank a badge the viewer has already seen. Nothing is
   * claimed for a film opened for the first time — see `provider` below.
   */
  readonly provider?: string | null;
  /** `Date.now()` at the moment of the click, passed in rather than read here. */
  readonly now: number;
}

/**
 * The entry to store, or `null` when there is nothing honest to store.
 *
 * A missing title is the `null` case rather than an empty string. The read side
 * already renders a nameless row as `ID: <media_id>` (lib/historyList.ts), which
 * names a row this browser knows something about — but the page HAS the title
 * before the button exists, so a record with no name would mean we chose to
 * write one we could not name. Refusing is the honest answer, and the caller
 * simply records nothing.
 */
export const movieWatchRecord = ({
  id,
  title,
  posterPath,
  provider,
  now,
}: MovieWatchRecordInput): WatchHistoryItem | null => {
  const mediaId = String(id ?? "").trim();
  const name = typeof title === "string" ? title.trim() : "";
  if (mediaId === "" || name === "") return null;

  return {
    id: mediaId,
    type: "movie",
    title: name,
    poster_path: typeof posterPath === "string" ? posterPath : "",
    // `""` and not a guess: `provider` records which source PLAYED this title,
    // and at the moment the viewer presses Regarder none has been observed to.
    provider: typeof provider === "string" ? provider : "",
    last_watched: now,
    // NO `timestamp`, NO `duration`, NO `season`, NO `episode`.
    // That omission is the contract of this function — see the header.
  };
};
