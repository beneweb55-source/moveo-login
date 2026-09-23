/**
 * THE ONE THING A DETAIL PAGE IS ENTITLED TO WRITE DOWN.
 *
 * Pure module: no React, no DOM, no `Date.now()`, no storage. Tested in
 * tests/watchRecord.test.ts. The pages keep the click handler and the
 * persistence call; the DECISION about what such an entry may claim lives here,
 * so it can be driven by a test that does not need a browser.
 *
 * ─── WHY THIS EXISTS AT ALL ──────────────────────────────────────────────────
 *
 * A history entry is written by exactly one of three paths:
 *
 *   1. the provider's own `postMessage`, via VideoPlayer's handler;
 *   2. WatchTimer's minute ticks;
 *   3. the viewer deliberately picking something.
 *
 * On the movie page, paths 1 and 2 are BOTH dead. They begin at
 * `parsePlaybackProgress`, which returns `null` for every message when the
 * active provider's `messageOrigins` is empty (lib/playerMessages.ts, rule 1),
 * and the source a first-time visitor is handed for a film leads the list with
 * an empty allowlist (lib/playerStrategy.ts, `movie`). So a film watched in full
 * left NOTHING — no position, not even a local row.
 *
 * On the series page, paths 1 and 2 are dead for the same reason on Western
 * television, and path 3 was narrower than it looked: it fired only when the
 * slot DIFFERED from the one the page opened on. A viewer who opened a series
 * and simply watched the episode in front of them — which is the ordinary way to
 * watch a series — changed nothing, so nothing was written. Measured against a
 * viewer's own report, 2026-09-23: GoT S7E1 was the only row she had, while the
 * film AND the series she watched immediately afterwards were both absent.
 *
 * So both pages needed a writer that does not depend on a provider's
 * cooperation. It is ONE function and not two, because the two entries differ in
 * a single field group (the slot) and a second copy of the rest is exactly how
 * this codebase's merge rules drifted apart before.
 *
 * ─── OPENING A PAGE IS NOT WATCHING IT ───────────────────────────────────────
 *
 * This is called ONLY from the viewer pressing Regarder — never on mount. That
 * is the rule §13 states for progress: an iframe `load`, a mounted player and a
 * clock are not playback evidence. A page-open write would fill Continue Watching
 * with titles that were merely glanced at, which is the defect the series page's
 * own comment records for the default slot — and it is why the fix below is a
 * button rather than a relaxation of that rule.
 *
 * ─── WHAT THE ENTRY CLAIMS, AND WHAT IT REFUSES TO ───────────────────────────
 *
 * It carries NO `timestamp` and NO `duration`. No position has been measured, so
 * none is written: `0` is a real position (the start of the film), and storing
 * it as a stand-in for "unknown" is what makes a Reprendre button lie (§3/§4,
 * and see the `timestamp` field's own note in utils/historyManager.ts).
 *
 * For a film it also carries no season/episode, so a film can never be read as a
 * slot of something. For a series it MUST carry one: the entry's whole content
 * is "this is the episode you are on", and a series row with no slot cannot be
 * keyed by `episodeSlotOf` or shown as a resume target. A series call without a
 * usable slot is therefore refused rather than written slotless.
 *
 * The absence of a position is SAFE, which is what makes this worth writing at
 * all: `normaliseItem` preserves it, and `mergeWatchEntries` lets a stored
 * position outrank an incoming observation that has none — so this write can
 * never roll a real progression back (§1). That merge rule is pinned by
 * tests/historyList.test.ts and is deliberately NOT re-asserted here: a second
 * copy of a rule is a second thing to keep in step.
 *
 * Once a provider that CAN report a position is playing, its write supplies one
 * for this same row — at which point the entry stops being "you chose this" and
 * becomes "you are 42 minutes in".
 *
 * ─── WHAT THIS DOES NOT FIX, STATED SO IT IS NOT MISTAKEN FOR FIXED ──────────
 *
 * A viewer who CHANGES episode on a series row that already holds a measured
 * position still will not see the pointer move: `resolveProgression` refuses a
 * position-less slot change, deliberately and with its own pinned test
 * (tests/progressionGuard.test.ts, "does NOT move the slot for an observation
 * that measured nothing"), so that a 32-minute position is never re-labelled
 * onto an episode it does not describe. That is a real limitation of a
 * one-row-per-title model and it is NOT addressed here; on the provider this
 * affects, no position is ever measured either, so the row this function writes
 * has none to protect and moves freely.
 */

import { slotOf } from "@/lib/progressionGuard";
import type { WatchHistoryItem } from "@/utils/historyManager";

export interface WatchRecordInput {
  /** Which detail page is writing. Decides whether a slot is written. */
  readonly type: "movie" | "tv";
  /** The TMDB id from the route. */
  readonly id: unknown;
  /**
   * TMDB's title for this film, or `name` for this series. Its absence means
   * there is nothing to name, and nothing is written.
   */
  readonly title?: string | null;
  readonly posterPath?: string | null;
  /**
   * The provider already stored for this title, carried over unchanged so a
   * later visit does not blank a badge the viewer has already seen. Nothing is
   * claimed when none is known — see `provider` below.
   */
  readonly provider?: string | null;
  /** The season being started. Ignored for a film. */
  readonly season?: unknown;
  /** The episode being started. Ignored for a film. */
  readonly episode?: unknown;
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
export const watchRecord = ({
  type,
  id,
  title,
  posterPath,
  provider,
  season,
  episode,
  now,
}: WatchRecordInput): WatchHistoryItem | null => {
  const mediaId = String(id ?? "").trim();
  const name = typeof title === "string" ? title.trim() : "";
  if (mediaId === "" || name === "") return null;

  const entry: WatchHistoryItem = {
    id: mediaId,
    type,
    title: name,
    poster_path: typeof posterPath === "string" ? posterPath : "",
    // `""` and not a guess: `provider` records which source PLAYED this title,
    // and at the moment the viewer presses Regarder none has been observed to.
    provider: typeof provider === "string" ? provider : "",
    last_watched: now,
    // NO `timestamp` and NO `duration`. That omission is the contract of this
    // function — see the header.
  };

  if (type === "movie") return entry;

  // `slotOf` and not a local check: it is the SAME rule the server applies
  // before it writes `watch_history_episodes` and the one `episodeSlotOf`
  // builds on, so a slot this function accepts is a slot the rest of the system
  // can key. Season 0 is TMDB's SPECIALS and survives as `0`.
  const slot = slotOf(season, episode);
  if (!slot) return null;

  return { ...entry, season: slot.season, episode: slot.episode };
};
