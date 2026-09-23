/**
 * The seam between what the recommendations endpoint RECEIVES and the taste
 * arithmetic it must not re-implement.
 *
 * WHY THIS EXISTS. `POST /api/ai-recommend` used to build its own notion of
 * preference — count the genre ids in the payload, take the top three, and ask a
 * language model for a percentage bounded by an arbitrary ceiling ("3 to 5 films:
 * max 85%"). That number was not a measurement of anything: it was produced by a
 * model asked to output a number, and it moved with nothing but the LENGTH of the
 * history. §3 forbids exactly that.
 *
 * The arithmetic that replaces it already existed and was already tested
 * (`lib/tasteSignals.ts`): `buildTasteProfile` turns observations into weighted
 * terms, and `affinityScore` reports how much of that weight a candidate carries.
 * What was missing was the layer that reads a request payload into the shapes
 * those functions take — and that layer is where the silent failures live, so it
 * is a module rather than a few lines inside the route.
 *
 * THE SILENT FAILURE THIS MODULE IS WRITTEN AGAINST. Every field below is read
 * from either the camelCase vocabulary of the application or the snake_case
 * vocabulary of the database columns, because both reach this endpoint. A field
 * read under the wrong name is not an error: it is `undefined`, the observation
 * loses its measurement, the title weighs zero, `titleCount` stays at zero,
 * `hasEnoughSignal` answers false, and the endpoint returns "nothing to show".
 * The result would be a recommendations section that is permanently empty and
 * reports no fault anywhere — the same class of quiet failure as reading
 * `genres[]` where TMDB wrote `genre_ids[]`.
 *
 * PURE, and deliberately: no network, no database, no clock, no `process.env`. The
 * clock is a parameter. That is what makes the scoring checkable without a Gemini
 * key, a TMDB key, or a database — none of which is configured in this checkout.
 */
import {
  affinityScore,
  titleKey,
  type MediaType,
  type TasteObservation,
  type TasteProfile,
  type TitleFeatures,
} from './tasteSignals';
// `isMediaType` and `genreIdsOf` are imported rather than restated: the first is
// the rule for which media types can be attributed, and the second validates
// genre ids (whole, positive, deduplicated, sorted). A second copy of either rule
// is a second thing to keep in step, and a genre id that fails validation does not
// raise — it makes PostgreSQL reject the whole row, or here, silently makes a term
// unmatchable.
import { genreIdsOf, isMediaType } from './titleFeatures';

/**
 * A finite number, from either vocabulary. Strings are accepted because `pg`
 * returns SQL `BIGINT` as a JavaScript STRING — a lesson this codebase already
 * paid for once (commit 6f7c285, where `Number.isFinite("8377")` is false and a
 * dashboard printed zeroes). `Number()` is not used on its own: `Number('')` is 0
 * and `Number(' 12 ')` is 12, so the empty string is rejected before coercion.
 */
function numeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Epoch milliseconds, from a `Date`, an ISO string, or a number already in ms. */
function instant(value: unknown): number | null {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  // The contract is milliseconds (`TasteObservation.lastSeenMs`). A payload that
  // sends SECONDS is therefore read as a date in 1970, which `recencyWeight` turns
  // into `RECENCY_FLOOR` — the documented answer for an age we cannot trust. That
  // direction is safe on purpose: guessing "seconds" would be inventing a
  // measurement, and would hand the freshest possible weight to garbage.
  return numeric(value);
}

/**
 * A trimmed non-empty string, or null. `''` means "known to be empty", which is
 * not a language, not a title, and not evidence of anything.
 */
const textOf = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/** The first of several spellings that carries a value. */
const firstOf = (record: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
};

export interface HistorySignals {
  readonly observations: TasteObservation[];
  readonly features: TitleFeatures[];
  /**
   * Items that carried no usable identity — no media type, or no positive integer
   * id — so no title could be attributed to them. Reported rather than ignored: a
   * payload the endpoint cannot read looks identical to a viewer with no taste,
   * and the two must not be confused.
   */
  readonly unreadableCount: number;
}

/** One title, accumulated across every history row that mentions it. */
interface Accumulated {
  mediaType: MediaType;
  mediaId: number;
  rows: number;
  minutes: number | null;
  lastSeenMs: number | null;
  positionSeconds: number | null;
  durationSeconds: number | null;
  bestRatio: number;
  genreIds: number[];
  originalLanguage: string | null;
}

/**
 * The viewer's history, as the observations and features the profile is built from.
 *
 * ONE TITLE IS ACCUMULATED, NOT REPEATED. A series watched across several episodes
 * appears several times in a history, and each row is not a separate taste: the
 * count becomes `observationCount` (which `rewatchMultiplier` rewards) and the
 * furthest progress reached becomes the position, because "did they finish it" is
 * the question `engagementOf` asks. Feeding the rows in separately would let a
 * five-episode series outvote five distinct films.
 *
 * The media type is REQUIRED and is never guessed. `titleKey` is built from the
 * pair, and a film and a series can share an id — attributing a series' genres to
 * a film of the same number would corrupt the profile with no error. An item whose
 * type cannot be read is counted as unreadable instead, which fails closed: the
 * profile loses a title rather than gaining a wrong one.
 */
export function signalsFromHistory(history: unknown): HistorySignals {
  const unreadable = { count: 0 };

  if (!Array.isArray(history)) {
    return { observations: [], features: [], unreadableCount: 0 };
  }

  const byKey = new Map<string, Accumulated>();

  for (const item of history) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      unreadable.count += 1;
      continue;
    }
    const record = item as Record<string, unknown>;

    // Both vocabularies, and the media type strictly.
    const rawType = firstOf(record, 'media_type', 'mediaType');
    const mediaType: MediaType | null = isMediaType(rawType) ? rawType : null;

    const mediaId = numeric(firstOf(record, 'media_id', 'mediaId', 'id'));

    if (mediaType === null || mediaId === null || !Number.isInteger(mediaId) || mediaId <= 0) {
      unreadable.count += 1;
      continue;
    }

    const key = titleKey(mediaType, mediaId);
    const existing = byKey.get(key);

    // Both vocabularies again, and here the two are genuinely different storage
    // shapes: the client sends camelCase, and `watch_history` returns the column
    // names, so a position read only as `positionSeconds` would leave every row
    // read from the database unmeasured — a profile built entirely out of
    // `RECENCY_FLOOR` and zeros, with nothing erroring.
    const position = numeric(
      firstOf(record, 'positionSeconds', 'current_time', 'currentTime', 'position'),
    );
    const duration = numeric(
      firstOf(record, 'durationSeconds', 'total_duration', 'totalDuration', 'duration'),
    );
    const ratio =
      position !== null && duration !== null && duration > 0
        ? Math.min(1, Math.max(0, position / duration))
        : null;

    const minutes = numeric(firstOf(record, 'minutesWatched', 'minutes_watched'));
    // `last_updated` is the `watch_history` column and arrives as a `Date`;
    // `lastSeenMs` is the client's own shape. Both are epoch-convertible, and an
    // absent one degrades to `RECENCY_FLOOR` in `recencyWeight` rather than to
    // "now" — the age of a row we cannot date is unknown, and an unknown age must
    // not be handed the freshest weight in the profile.
    const lastSeen = instant(
      firstOf(record, 'lastSeenMs', 'last_seen_ms', 'last_updated', 'lastUpdated', 'last_watched', 'timestamp'),
    );
    const genres = genreIdsOf(record);
    const language = textOf(firstOf(record, 'original_language', 'originalLanguage'));

    if (existing) {
      existing.rows += 1;
      if (minutes !== null) existing.minutes = (existing.minutes ?? 0) + minutes;
      if (lastSeen !== null) {
        existing.lastSeenMs =
          existing.lastSeenMs === null ? lastSeen : Math.max(existing.lastSeenMs, lastSeen);
      }
      // The furthest progress wins, and it brings its own duration with it, so the
      // pair stays a real measurement of one playback rather than two halves of
      // two different ones.
      if (ratio !== null && ratio > existing.bestRatio) {
        existing.bestRatio = ratio;
        existing.positionSeconds = position;
        existing.durationSeconds = duration;
      }
      if (existing.genreIds.length === 0 && genres.length > 0) existing.genreIds = genres;
      if (existing.originalLanguage === null) existing.originalLanguage = language;
      continue;
    }

    byKey.set(key, {
      mediaType,
      mediaId,
      rows: 1,
      minutes,
      lastSeenMs: lastSeen,
      positionSeconds: ratio === null ? null : position,
      durationSeconds: ratio === null ? null : duration,
      // -1 so that a real ratio of 0 — a title opened and left at the very start —
      // still replaces "no measurement at all". Those two are different states and
      // `engagementOf` gives them different weights.
      bestRatio: ratio === null ? -1 : ratio,
      genreIds: genres,
      originalLanguage: language,
    });
  }

  const observations: TasteObservation[] = [];
  const features: TitleFeatures[] = [];

  for (const entry of byKey.values()) {
    observations.push({
      mediaType: entry.mediaType,
      mediaId: entry.mediaId,
      positionSeconds: entry.positionSeconds,
      durationSeconds: entry.durationSeconds,
      minutesWatched: entry.minutes,
      observationCount: entry.rows,
      lastSeenMs: entry.lastSeenMs,
      // The history does not carry list membership — that lives in the viewer's own
      // lists, which this request does not receive. Left absent rather than guessed
      // as null: `explicitWeight` distinguishes "on no list" from "we were not
      // told", and a guessed null would let a favourite be read as unlisted.
      listed: undefined,
    });

    // Only titles that can be attributed to something become features. A title with
    // neither genres nor a language contributes nothing, and `buildTasteProfile`
    // counts an absent feature as an unknown title — which is the honest report.
    if (entry.genreIds.length > 0 || entry.originalLanguage !== null) {
      features.push({
        mediaType: entry.mediaType,
        mediaId: entry.mediaId,
        genreIds: entry.genreIds,
        originalLanguage: entry.originalLanguage,
      });
    }
  }

  return { observations, features, unreadableCount: unreadable.count };
}

/**
 * The cached features of the titles the viewer actually watched.
 *
 * WHY THE GENRES COME FROM THE CACHE AND NOT FROM THE REQUEST. The endpoint used
 * to count `genre_ids` on the history items it was POSTed. Nothing that posts to
 * it carries that field: the client's stored history holds a title, a poster and
 * a position, and `genre_ids` exists on TMDB responses, which the client does not
 * keep. The count was therefore always empty, the discovery query was never
 * built, and the route answered "nothing to show" on every call before it ever
 * reached the model — dead twice over, which is why the invented percentage in
 * its prompt was unreachable code rather than a lie anyone ever read.
 *
 * Reading the genres from `title_features` makes the input something the server
 * can vouch for: the cache is filled from TMDB by
 * `scripts/backfill-title-features.ts`, and a caller cannot supply the taste it
 * wants to be recommended from.
 *
 * A row with neither genres nor a language is skipped rather than emitted as an
 * empty feature. `buildTasteProfile` would count such a title as known but
 * weightless, when the truth is that we know nothing about it and it belongs in
 * `unknownTitleCount`, where the caller can see it.
 */
export function featuresFromCache(rows: unknown): TitleFeatures[] {
  if (!Array.isArray(rows)) return [];

  const features: TitleFeatures[] = [];

  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const record = row as Record<string, unknown>;

    const rawType = firstOf(record, 'media_type', 'mediaType');
    if (!isMediaType(rawType)) continue;

    const mediaId = numeric(firstOf(record, 'media_id', 'mediaId'));
    if (mediaId === null || !Number.isInteger(mediaId) || mediaId <= 0) continue;

    // `genre_ids` is the cache's column; `genres` is accepted so the same reader
    // also works on a TMDB payload. Both go through the one validation rule.
    const genreIds = genreIdsOf(record);
    const originalLanguage = textOf(firstOf(record, 'original_language', 'originalLanguage'));

    if (genreIds.length === 0 && originalLanguage === null) continue;

    features.push({ mediaType: rawType, mediaId, genreIds, originalLanguage });
  }

  return features;
}

export interface ScoredCandidate {
  readonly id: number;
  readonly mediaType: MediaType;
  /** Whole percent, from `affinityScore`. Never invented, never defaulted. */
  readonly score: number;
  /**
   * Readonly, and copied straight from the candidate's `TitleFeatures` rather
   * than re-derived: a second reading of `genre_ids` here could disagree with the
   * one the score was actually computed from, and the list would then explain a
   * ranking it did not take part in.
   */
  readonly genreIds: readonly number[];
  readonly originalLanguage: string | null;
}

/**
 * Score every candidate, keep the ones that could be scored, and order them.
 *
 * A CANDIDATE WHOSE SCORE IS `null` IS DROPPED, NOT RANKED LAST. `affinityScore`
 * returns null only when the comparison could not be made — no positive weight in
 * the profile, or a candidate whose features are unknown. Ranking those last would
 * present "we could not read this" as "you will not like this", and §21 forbids
 * returning an unscored candidate as though it were a recommendation.
 *
 * The exclusion set is keyed by `titleKey`, so a film in the history does not
 * suppress a SERIES that happens to share its id. The previous version compared
 * bare ids and could not tell them apart.
 */
export function scoreCandidates(
  results: unknown,
  profile: TasteProfile,
  excludedKeys: ReadonlySet<string>,
  mediaType: MediaType,
  limit = 20,
): ScoredCandidate[] {
  if (!Array.isArray(results)) return [];

  const scored: ScoredCandidate[] = [];

  for (const item of results) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;

    const id = numeric(record.id);
    if (id === null || !Number.isInteger(id) || id <= 0) continue;

    if (excludedKeys.has(titleKey(mediaType, id))) continue;

    const candidate: TitleFeatures = {
      mediaType,
      mediaId: id,
      genreIds: genreIdsOf(record),
      originalLanguage: textOf(firstOf(record, 'original_language', 'originalLanguage')),
    };

    const score = affinityScore(candidate, profile);
    if (score === null) continue;

    scored.push({
      id,
      mediaType,
      score,
      genreIds: candidate.genreIds,
      originalLanguage: candidate.originalLanguage ?? null,
    });
  }

  // Score first, id second: the score is the ranking, and the id only makes the
  // order reproducible when two candidates measure the same.
  scored.sort((a, b) => b.score - a.score || a.id - b.id);
  return scored.slice(0, limit);
}
