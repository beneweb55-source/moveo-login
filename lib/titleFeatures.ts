/**
 * The single place that turns a TMDB payload into a row of `title_features`.
 *
 * WHY THIS IS A MODULE AND NOT A FEW LINES IN THE SCRIPT THAT USES IT. The job
 * that fills this cache is the one job with two readers — the recommender needs
 * `genre_ids` and `original_language`, the history display needs `title` and
 * `poster_path` — and a mapper written inside the backfill script would be a
 * mapper that only the backfill could test. Everything here is PURE: no network,
 * no database, no clock read, no `process.env`. That is what makes it checkable in
 * an environment where TMDB's key is absent and therefore where no live fetch can
 * be verified at all (§8: a check that cannot run is not a check).
 *
 * ─── THE TWO SHAPES THAT ARE EASY TO CONFUSE ─────────────────────────────────
 *
 * TMDB returns the SAME concept under DIFFERENT FIELD NAMES depending on the
 * endpoint, and both mistakes below are silent — the row is written, the column
 * accepts it, and nothing errors:
 *
 *  1. GENRES. The detail endpoints (`/movie/{id}`, `/tv/{id}`) return
 *     `genres: [{id, name}, …]`. The list and search endpoints return
 *     `genre_ids: [number, …]`. A mapper that reads only one of the two stores an
 *     empty `genre_ids` for half its callers — and an empty genre list is
 *     indistinguishable from "this title has no genres", which is what makes the
 *     recommender quietly stop working rather than loudly.
 *  2. THE TITLE. A movie calls it `title`; a series calls it `name`. Reading the
 *     wrong one yields `undefined`, and `undefined` written to a NULLable column
 *     is NULL — a row that looks exactly like a title TMDB does not know, so the
 *     backfill would retry it forever and the history would keep hiding it.
 *
 * Both are handled by reading the union and by NAMING the field per media type,
 * and `tests/titleFeatures.test.ts` pins each of them.
 *
 * ─── THE ID CHECK IS NOT PARANOIA ────────────────────────────────────────────
 *
 * `titleFeatureFromPayload` takes the id it asked for and REFUSES a payload whose
 * own `id` disagrees. Writing a payload under the key we requested rather than
 * under the key it identifies is how a cache poisons itself: one wrong response
 * would attribute one title's genres to another, and every later read of that pair
 * — including the recompute that builds a viewer's taste — would be built on it,
 * with no error anywhere and no way to notice. A refusal here is a missed cache
 * entry; the alternative is a wrong profile.
 */
import type { MediaType } from './tasteSignals';

export type { MediaType };

/**
 * The language the DISPLAY title is fetched in.
 *
 * `fr-FR` because the interface is French and because it is what the two existing
 * server-side TMDB callers already ask for (`app/api/admin/stats/route.ts:143`,
 * `app/api/ai-recommend/route.ts:111`). It is a named export rather than a literal
 * in the fetch call so that the language is one decision in one place instead of a
 * string that reappears wherever a request is built.
 *
 * IT DOES NOT AFFECT `original_language`. That field is about the WORK, not about
 * the request, and TMDB returns it unchanged whatever `language` asks for. A French
 * title does not mean a French film, and a recommender that read the two as the
 * same would weigh every translation as an original-language signal.
 */
export const TITLE_FEATURE_LANGUAGE = 'fr-FR';

/**
 * How long a cached row is trusted.
 *
 * Ninety days is chosen against what actually changes: a title's genres and its
 * original language are properties of the work and are effectively fixed, while a
 * poster can be replaced at any time. The cost of being wrong is bounded — one
 * refetch — and the cost of never expiring is a cache that can never be corrected.
 */
export const TITLE_FEATURE_MAX_AGE_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The column widths in `scripts/migrate-taste-profile.ts`, so a value cannot be
 * built here that the database would have to truncate or reject.
 */
export const TITLE_FEATURE_TITLE_MAX = 500;
export const TITLE_FEATURE_POSTER_MAX = 500;
export const TITLE_FEATURE_LANGUAGE_MAX = 10;

export interface TitleFeature {
  mediaType: MediaType;
  mediaId: number;
  /**
   * Ascending and deduplicated, so the stored array is a value and not an
   * artefact of the order TMDB happened to list them in.
   */
  genreIds: number[];
  originalLanguage: string | null;
  /**
   * The display title in `TITLE_FEATURE_LANGUAGE`. `null` means "not known" —
   * never `''`, which would be indistinguishable from a title with no name.
   */
  title: string | null;
  /**
   * Exactly as TMDB returns it: a bare path such as `/pB8BM7pd.jpg`, which is
   * what `components/HistoryCard.tsx:28` expects to prefix.
   */
  posterPath: string | null;
}

export const isMediaType = (value: unknown): value is MediaType =>
  value === 'movie' || value === 'tv';

/**
 * The detail endpoint for a pair. `/movie/550`, `/tv/1396` — never `/movie/tv/…`,
 * which is what a template that forgot to branch on the type produces.
 */
export const titleFeatureEndpoint = (mediaType: MediaType, mediaId: number): string =>
  `/${mediaType}/${mediaId}`;

/**
 * Bounded, trimmed, and empty-becomes-null. The three rules are one function
 * because they are one decision: what a string column may hold.
 */
function bounded(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/**
 * The genre ids, from whichever of the two shapes the payload carries.
 *
 * A NON-NUMERIC ID IS DROPPED rather than coerced. `genre_ids` is `INTEGER[]`, so a
 * string that is not an integer would make the whole INSERT fail — one malformed
 * id costing the entire row, including the genres that were fine. Dropping keeps
 * the good ids; the resulting shorter list is visible in the row itself.
 *
 * The two sources are MERGED rather than picked between. On a detail response
 * `genres` is authoritative and `genre_ids` is usually absent; on a search result
 * the reverse. If both are present they agree, and merging is what makes that an
 * observation rather than an assumption.
 */
export function genreIdsOf(payload: Record<string, unknown>): number[] {
  const ids: number[] = [];
  const push = (value: unknown): void => {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      ids.push(value);
      return;
    }
    // `/^\d+$/` and not `Number()`, and that is not style: `Number('')` is 0 and
    // `Number(' 12 ')` is 12, so coercion would accept values that are not ids.
    if (typeof value === 'string' && /^\d+$/.test(value)) {
      const parsed = Number(value);
      if (parsed > 0) ids.push(parsed);
    }
  };

  const genres = payload.genres;
  if (Array.isArray(genres)) {
    for (const entry of genres) {
      if (entry && typeof entry === 'object') push((entry as { id?: unknown }).id);
    }
  }

  const flat = payload.genre_ids;
  if (Array.isArray(flat)) {
    for (const entry of flat) push(entry);
  }

  return [...new Set(ids)].sort((a, b) => a - b);
}

/**
 * A TMDB detail payload to a cache row, or `null` when the payload is not the
 * title that was asked for.
 *
 * `null` is a REPORTED outcome, not a swallowed error: the caller counts it, names
 * the pair, and leaves the cache untouched. Writing a partial row instead would
 * make "TMDB could not describe this title" and "the cache is up to date" the same
 * state.
 */
export function titleFeatureFromPayload(
  mediaType: MediaType,
  mediaId: number,
  payload: unknown,
): TitleFeature | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;

  // TMDB answers a missing resource with `{success:false, status_code:34, …}` on
  // some paths and HTTP 200. Treated as "no such title" rather than as a payload
  // whose fields merely happen to be absent.
  if (record.success === false) return null;

  // The identity check described in the header. A payload with no numeric id
  // cannot be checked at all, and is refused for that reason rather than trusted.
  const id = record.id;
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) return null;
  if (id !== mediaId) return null;

  // Named per type, with no fallback to the other key: see the header. A missing
  // `name` on a series is a series TMDB did not name in this language, which is a
  // fact about the fetch and not a reason to read a field the type does not have.
  const title = bounded(
    mediaType === 'movie' ? record.title : record.name,
    TITLE_FEATURE_TITLE_MAX,
  );

  return {
    mediaType,
    mediaId,
    genreIds: genreIdsOf(record),
    originalLanguage: bounded(record.original_language, TITLE_FEATURE_LANGUAGE_MAX),
    title,
    posterPath: bounded(record.poster_path, TITLE_FEATURE_POSTER_MAX),
  };
}

/** What a caller needs a cached row to be good enough for. */
export type FeatureNeed = 'recommendation' | 'display';

export interface CachedFeature {
  fetchedAt: Date | string | null;
  genreIds: readonly number[] | null;
  title: string | null;
}

export type FetchDecision = 'absent' | 'stale' | 'incomplete' | 'fresh';

/**
 * Whether a cached row must be fetched again, judged against what the caller
 * actually needs from it.
 *
 * THE `need` ARGUMENT IS THE POINT. The same row can be sufficient for one reader
 * and useless for the other, and a single notion of "fresh" would have to pick one
 * and be wrong about the other:
 *
 *  - A recommender can score a title whose display title is NULL — it wants the
 *    genres. Refetching it would spend a request to learn nothing.
 *  - The history backfill cannot show a title whose display title is NULL. It has
 *    to try, or the row stays hidden; that attempt is the only way to find out
 *    whether the gap is ours or TMDB's.
 *
 * `incomplete` is therefore "fresh enough by the clock, but missing the field THIS
 * caller needs". A row that is both stale and incomplete reports `stale`, because
 * that is the simpler statement and it implies a fetch either way.
 */
export function fetchDecision(
  cached: CachedFeature | undefined | null,
  now: number,
  need: FeatureNeed,
  maxAgeDays: number = TITLE_FEATURE_MAX_AGE_DAYS,
): FetchDecision {
  if (!cached) return 'absent';

  const parsed =
    cached.fetchedAt instanceof Date
      ? cached.fetchedAt.getTime()
      : cached.fetchedAt === null
        ? Number.NaN
        : Date.parse(String(cached.fetchedAt));

  if (!Number.isFinite(parsed) || now - parsed >= maxAgeDays * DAY_MS) return 'stale';

  const hasGenres = Array.isArray(cached.genreIds) && cached.genreIds.length > 0;
  const hasTitle = typeof cached.title === 'string' && cached.title.trim() !== '';
  const enough = need === 'recommendation' ? hasGenres : hasTitle;

  return enough ? 'fresh' : 'incomplete';
}

/**
 * Whether a cached row is sufficient for EVERY reader at once.
 *
 * The backfill has two jobs, so it cannot use `fetchDecision` with one `need` and
 * ignore the other — and the failure that produces is asymmetric and quiet. Asking
 * for `'display'` alone would accept a row that has a title and NO genres, which
 * is a row the recommender cannot score: the backfill would report a completed run
 * while leaving every taste profile with nothing to weigh. Asking for
 * `'recommendation'` alone is the mirror image — a fully-scored cache and a history
 * that still hides its rows.
 *
 * So the row is fetched unless BOTH needs are already satisfied, and the predicate
 * lives here rather than in the script because it is the same kind of decision as
 * `fetchDecision` itself and it is testable only if it is pure.
 */
export function satisfiesAllReaders(
  cached: CachedFeature | undefined | null,
  now: number,
  maxAgeDays: number = TITLE_FEATURE_MAX_AGE_DAYS,
): boolean {
  return (
    fetchDecision(cached, now, 'recommendation', maxAgeDays) === 'fresh' &&
    fetchDecision(cached, now, 'display', maxAgeDays) === 'fresh'
  );
}

/** A pair of the two columns that identify a title, for logs and for the report. */
export const describeTitle = (mediaType: MediaType, mediaId: number): string =>
  `${mediaType}/${mediaId}`;
