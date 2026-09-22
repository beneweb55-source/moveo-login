/**
 * PER-EPISODE history: one record per episode a viewer has been on.
 *
 * ─── WHY THE PARENT ROW IS NOT ENOUGH ────────────────────────────────────────
 *
 * `watch_history` has `UNIQUE(user_id, media_type, media_id)` — one row per
 * TITLE. So a series can remember that you are on episode 7 at 32:14, and it
 * cannot remember that you were on S1E4 at 05:00 as well. Watching the next
 * episode overwrites the slot and the timecode of the previous one, and the
 * previous one is gone. §7 of the brief names exactly this.
 *
 * The parent row keeps its job — it IS the Continue Watching pointer, the last
 * content the viewer touched — and this module is the second record beside it:
 * the per-slot one, keyed by (type, id, season, episode) so that a write for one
 * episode never touches another episode's row.
 *
 * ─── WHAT THIS MODULE OWNS ───────────────────────────────────────────────────
 *
 * The SHAPE of a per-episode entry, the SLOT RULE that decides whether an entry
 * describes an episode at all, and the merge. It is pure: no React, no DOM, no
 * storage, no network. The store that persists these lives in
 * utils/historyManager.ts, which is already the single write point for the local
 * copy and already knows how to stamp an owner — so both stores are written by
 * one function and cannot drift apart.
 *
 * The conflict rule is NOT reimplemented here. It is `resolveProgression` in
 * lib/progressionGuard.ts, the same function the browser and the server both
 * call, so a per-episode record is resolved by the same no-regression rule as a
 * parent row.
 */

import type { WatchHistoryItem } from "@/utils/historyManager";
import {
  progressionFieldsFrom,
  resolveProgression,
  type ProgressionFields,
} from "@/lib/progressionGuard";

/**
 * A per-episode entry.
 *
 * The slot is REQUIRED here, and that is the whole difference from
 * `WatchHistoryItem`: an entry without both numbers is not a per-episode record
 * and cannot be keyed, so the type makes the statically impossible case
 * unrepresentable rather than checking for it at each use.
 */
export type EpisodeEntry = WatchHistoryItem & {
  type: "tv";
  season: number;
  episode: number;
};

/** Enough for a long-running series without letting one title fill the store. */
export const MAX_EPISODES_PER_TITLE = 60;

/** A bound on the whole store, so a browser cannot accumulate without limit. */
export const MAX_EPISODE_ENTRIES = 300;

/**
 * The slot an entry describes, or null when it describes none.
 *
 * FOUR CONDITIONS, and each one is load-bearing:
 *
 *  1. `type === "tv"`. A film has no seasons. A film entry that happened to carry
 *     season/episode numbers from some upstream payload must not create an
 *     episode row — §8 forbids endless rows for films.
 *  2. and 3. `Number.isInteger` on BOTH numbers. The database columns are
 *     `INTEGER`, so a fractional value sent as a parameter is `22P02` and would
 *     abort the enclosing transaction — taking the parent row's write with it.
 *     Refusing a non-integer here means the slot is simply not recorded, and the
 *     parent write proceeds exactly as it does today.
 *  4. Neither is negative. TMDB does not number episodes below zero, and a
 *     negative slot is data corruption rather than a special case.
 *
 * Season 0 IS a real slot: it is TMDB's SPECIALS season. The test is `>= 0` and
 * never a truthiness check, which is what turned specials into "no season" in an
 * earlier version of this codebase.
 */
export const episodeSlotOf = (item: {
  type?: unknown;
  season?: unknown;
  episode?: unknown;
}): { season: number; episode: number } | null => {
  if (item.type !== "tv") return null;
  if (!Number.isInteger(item.season) || !Number.isInteger(item.episode)) return null;
  const season = item.season as number;
  const episode = item.episode as number;
  if (season < 0 || episode < 0) return null;
  return { season, episode };
};

/**
 * The identity of one episode record: type, title, and BOTH slot numbers.
 *
 * All four parts, always. The title id alone would make S1E1 and S2E7 the same
 * record — which is the parent row's limitation, and the reason this module
 * exists.
 */
export const episodeKeyOf = (entry: {
  type: string;
  id: string;
  season: number;
  episode: number;
}): string => `${entry.type}:${entry.id}:${entry.season}:${entry.episode}`;

/** The same key from raw parts, for callers that hold no entry yet. */
export const episodeSlotKey = (
  type: string,
  id: string | number,
  season: number,
  episode: number,
): string => episodeKeyOf({ type, id: String(id), season, episode });

/**
 * Narrows a stored entry to a per-episode entry, or null.
 *
 * A film, a series entry with no slot, and a slot with a fractional number all
 * come back null — and the caller's correct response to null is "this is not a
 * per-episode record", not "invent a slot for it".
 */
export const asEpisodeEntry = (item: WatchHistoryItem): EpisodeEntry | null => {
  const slot = episodeSlotOf(item);
  if (!slot) return null;
  return { ...item, type: "tv", season: slot.season, episode: slot.episode };
};

/**
 * Decides which of two records of the SAME episode to keep.
 *
 * Both arguments are the same slot by construction (the store looks the entry up
 * by key), so the guard's same-slot rules are what applies: a position that moved
 * forward wins, a later observation that measured nothing does not displace a
 * stored position, and a stored value that was already complete may be replaced.
 *
 * The fields are built ONCE and held: `resolveProgression` returns one of its two
 * arguments BY REFERENCE, and that identity is how the winner is identified. A
 * second call would build a different object and the comparison would be false
 * for every merge.
 */
export const mergeEpisodeEntries = (
  existing: EpisodeEntry | undefined,
  incoming: EpisodeEntry,
): EpisodeEntry => {
  if (!existing) return incoming;

  const existingFields = progressionFieldsFrom(existing);
  const incomingFields = progressionFieldsFrom(incoming);
  const winner = resolveProgression(existingFields, incomingFields);
  return winner === incomingFields ? incoming : existing;
};

/** The record for one slot, or undefined. */
export const findEpisodeEntry = (
  entries: readonly EpisodeEntry[],
  type: string,
  id: string | number,
  season: number,
  episode: number,
): EpisodeEntry | undefined =>
  entries.find(
    (entry) =>
      entry.type === type &&
      entry.id === String(id) &&
      entry.season === season &&
      entry.episode === episode,
  );

/**
 * Inserts or replaces one episode record, returning the new store.
 *
 * Sorted by `last_watched` descending and bounded twice: a per-title cap so that
 * one series cannot crowd the others out, and a global cap so the store cannot
 * grow without limit. The caps trim the LEAST recently observed records, which is
 * the only order that makes a bound safe — the alternative, trimming by episode
 * number, would drop the earlier episodes of a series the viewer is working
 * through, i.e. exactly the records this module was built to keep.
 */
export const upsertEpisodeEntry = (
  entries: readonly EpisodeEntry[],
  incoming: EpisodeEntry,
): EpisodeEntry[] => {
  const key = episodeKeyOf(incoming);
  const existing = entries.find((entry) => episodeKeyOf(entry) === key);
  const merged = mergeEpisodeEntries(existing, incoming);

  const rest = entries.filter((entry) => episodeKeyOf(entry) !== key);
  const sorted = [merged, ...rest].sort((a, b) => b.last_watched - a.last_watched);

  return capPerTitle(sorted, incoming.type, incoming.id);
};

/**
 * Applies both caps. Exported for the test that pins them.
 *
 * IT TRIMS THE TAIL OF THE ARRAY IT IS GIVEN, and that is the entire contract: it
 * does not sort. The ordering is `upsertEpisodeEntry`'s job, and it discharges it
 * by sorting most-recently-observed first before calling this — which is what
 * makes "trim the tail" mean "trim the least recently watched". A caller that
 * hands it an unsorted list silently trims the wrong records, so the test that
 * matters for the bound is written against `upsertEpisodeEntry` and not against
 * this function.
 */
export const capPerTitle = (
  entries: readonly EpisodeEntry[],
  type: string,
  id: string | number,
): EpisodeEntry[] => {
  const target = String(id);
  let keptForTitle = 0;

  const afterTitleCap = entries.filter((entry) => {
    if (entry.type !== type || entry.id !== target) return true;
    keptForTitle += 1;
    return keptForTitle <= MAX_EPISODES_PER_TITLE;
  });

  return afterTitleCap.slice(0, MAX_EPISODE_ENTRIES);
};

/**
 * Every episode record for one title, most recently observed first.
 *
 * The order is an ANSWER, not a detail: §18 asks for the other started episodes
 * beside the current one, and "most recently watched" is the only order that
 * answers "where else was I".
 */
export const episodesOfTitle = (
  entries: readonly EpisodeEntry[],
  type: string,
  id: string | number,
): EpisodeEntry[] =>
  entries
    .filter((entry) => entry.type === type && entry.id === String(id))
    .sort((a, b) => b.last_watched - a.last_watched);

/**
 * The started episodes of a title EXCLUDING the one the parent row points at.
 *
 * This is the list §18 asks to display, and the exclusion is the reason it is a
 * function here rather than a filter at the call site: including the current
 * episode would show the viewer the same episode twice — once as "Reprendre
 * l'épisode" and once as "also started" — which reads as a bug and is one.
 */
export const otherStartedEpisodes = (
  entries: readonly EpisodeEntry[],
  current: {
    type: string;
    id: string | number;
    season?: number | null;
    episode?: number | null;
  },
): EpisodeEntry[] => {
  const currentSlot = episodeSlotOf({
    type: current.type,
    season: current.season,
    episode: current.episode,
  });
  return episodesOfTitle(entries, current.type, current.id).filter((entry) =>
    currentSlot === null
      ? true
      : entry.season !== currentSlot.season || entry.episode !== currentSlot.episode,
  );
};

/** The guard's view of one episode record, for callers that need it. */
export const episodeProgressionOf = (entry: EpisodeEntry): ProgressionFields =>
  progressionFieldsFrom(entry);
