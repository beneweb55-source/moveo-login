/**
 * BACKFILL — fill `title_features` from TMDB, then un-hide the history.
 *
 * ─── THE MEASUREMENT THIS EXISTS FOR ─────────────────────────────────────────
 *
 * Taken by introspection on the real database, not inferred from the source:
 *
 *     watch_history            108 rows · 7 admin_adjustment · 101 real
 *                             100 of 101 real rows carry a NULL title
 *                             92 distinct pairs · 91 of them title-less
 *     anonymous_watch_history  303 rows · 212 distinct pairs · no title column
 *     title_features                0 rows
 *     distinct pairs across both  279  (171 movie + 108 tv)
 *
 * `GET /api/watch-time` filters on `title IS NOT NULL`. So a viewer whose
 * observations are all in `watch_history` sees an almost empty history — the rows
 * are recorded, they are counted in every total the dashboard shows, and the list
 * the interface renders is empty. That is §8's failure shape exactly: a displayed
 * absence being read as an absence of the thing.
 *
 * The rows cannot gain a title by being read. The values were never stored: the
 * rows predate the `title` column, so there is nothing in the database to recover.
 * The only source of a title is TMDB, and it must be fetched by
 * `(media_type, media_id)` — the pair the history already holds.
 *
 * ─── ONE JOB, TWO FUNCTIONS, AND THAT IS THE DESIGN ──────────────────────────
 *
 * The same fetch also produces `genre_ids` and `original_language`, which is what
 * the recommender needs. The 279 requests happen ONCE and serve both: the history
 * becomes displayable and the taste profile gains the genres it cannot compute
 * without. Doing them as two jobs would mean 558 requests for 279 answers, and
 * would put the two readers in a position to disagree about the same title.
 *
 * ─── SAFETY, STATED PRECISELY ────────────────────────────────────────────────
 *
 *  - DRY RUN unless `--apply`. Without it nothing is written at all, and the plan
 *    is printed with the request count so it can be sized before it is run.
 *  - `--limit=N` bounds the number of FETCHES, which is the observe-first control:
 *    `--limit=5 --apply` resolves five titles and leaves everything else untouched.
 *    Pairs are ordered deterministically, so the same `N` always picks the same
 *    five.
 *  - An existing `watch_history.title` is NEVER overwritten. The backfill uses
 *    `COALESCE(wh.title, tf.title)`, so the only rows it can change are the rows
 *    that are currently invisible — §15's "ne pas perdre de données existantes",
 *    expressed as a column-level rule rather than as an intention.
 *  - `anonymous_watch_history` IS NOT TOUCHED, read-only. It has no title column,
 *    and it is not read for display by anything: the guest's visible history comes
 *    from localStorage, which already carries titles. Adding the columns there would
 *    create a second definition to keep in step with the bootstrap in
 *    `app/api/admin/users/route.ts` — which `tests/schemaBootstrapDrift.test.ts`
 *    pins — to serve no reader. Its 212 pairs are still FETCHED, because the guest
 *    taste profile needs their genres.
 *  - A fetch that fails is COUNTED AND NAMED, and the row is left as it was. §3: a
 *    title we could not resolve stays unresolved and reported, never invented.
 *  - The `--apply` guard against a Neon host is the same one the migrations use
 *    (§14: ne pas modifier la production directement).
 *
 * Run:
 *   npx tsx scripts/backfill-title-features.ts                     # dry run, plan
 *   npx tsx scripts/backfill-title-features.ts --limit=5 --apply    # observe first
 *   npx tsx scripts/backfill-title-features.ts --apply --i-know-this-is-production
 *
 * Exit codes: 0 = completed (dry run, or a run with no failures). 1 = a failure
 * occurred, or the numbers disagree with the plan. 2 = SKIPPED — no API key or no
 * database, so NOTHING was executed, which is not a pass (§8).
 */
import axios from 'axios';
import { Pool } from 'pg';
import dotenv from 'dotenv';

import {
  TITLE_FEATURE_LANGUAGE,
  describeTitle,
  isMediaType,
  satisfiesAllReaders,
  titleFeatureEndpoint,
  titleFeatureFromPayload,
  type CachedFeature,
} from '../lib/titleFeatures';

/**
 * Read from TMDB directly, not through `/api/tmdb-proxy`.
 *
 * That route is served by the Next.js process, and `utils/api.ts` addresses it with
 * a RELATIVE url, which a script outside the browser cannot resolve. It would also
 * apply the site's content filter, which is a display rule: this cache stores what
 * TMDB says about a title the site has ALREADY shown to somebody, so filtering it
 * again could only remove genres from a title that is legitimately in the history.
 */
const TMDB_BASE = 'https://api.themoviedb.org/3';

/**
 * Sequential and paced. TMDB's ceiling is roughly 50 requests per second; 279
 * requests at this pace take about a minute, and the reason to be slow here is that
 * a rate-limit ban would cost far more than the minute it saves.
 */
const REQUEST_DELAY_MS = 250;
const REQUEST_TIMEOUT_MS = 10_000;

const PRODUCTION_HOST_MARKER = 'neon.tech';
const CONFIRM_FLAG = '--i-know-this-is-production';

interface Pair {
  mediaType: 'movie' | 'tv';
  mediaId: number;
  /** Which history table this pair appears in — reported, never written to. */
  signedIn: boolean;
  guest: boolean;
}

/**
 * Every distinct pair the two history tables mention, with where each came from.
 *
 * `admin_adjustment` is excluded by name: it is not a title, it is the reserved row
 * type `/api/admin/watch-time` writes its manual corrections to, and asking TMDB
 * about `media_id 0` would be a request that could never succeed.
 *
 * ORDERED, and that is load-bearing for `--limit`: an unordered query would make
 * "resolve the first five" pick a different five on each run, so the observe-first
 * step could not be repeated or compared with itself.
 */
const PAIRS_QUERY = `
  WITH pairs AS (
    SELECT media_type, media_id,
           bool_or(from_signed_in) AS signed_in,
           bool_or(from_guest)     AS guest
    FROM (
      SELECT media_type, media_id, true AS from_signed_in, false AS from_guest
      FROM watch_history WHERE media_type IN ('movie', 'tv')
      UNION ALL
      SELECT media_type, media_id, false, true
      FROM anonymous_watch_history WHERE media_type IN ('movie', 'tv')
    ) AS sources
    GROUP BY media_type, media_id
  )
  SELECT media_type, media_id, signed_in, guest FROM pairs
  ORDER BY media_type, media_id`;

const CACHE_QUERY = `
  SELECT media_type, media_id, genre_ids, title, fetched_at
  FROM title_features`;

/**
 * `ON CONFLICT … DO UPDATE` on the primary key, so a re-run corrects a row instead
 * of failing on it. `fetched_at` is the server's clock rather than a value passed in
 * from the script: the field exists to answer "is this stale", and a client clock
 * would make that answer depend on whose machine ran the job.
 */
const UPSERT_FEATURE = `
  INSERT INTO title_features
    (media_type, media_id, genre_ids, original_language, title, poster_path, fetched_at)
  VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
  ON CONFLICT (media_type, media_id) DO UPDATE SET
    genre_ids         = EXCLUDED.genre_ids,
    original_language = EXCLUDED.original_language,
    title             = EXCLUDED.title,
    poster_path       = EXCLUDED.poster_path,
    fetched_at        = EXCLUDED.fetched_at`;

/**
 * The un-hiding, and the `COALESCE` is the whole safety story: a stored title is
 * kept, and only a NULL is filled. A row with a title and no poster gains the poster
 * and keeps its title.
 *
 * `media_type IN ('movie','tv')` rather than `<> 'admin_adjustment'`: the two
 * spellings agree today, but the allowlist is the one that stays correct if a third
 * bookkeeping type is ever added — the same reasoning `POST /api/watch-time` uses.
 */
const BACKFILL_HISTORY = `
  UPDATE watch_history wh
  SET title       = COALESCE(wh.title, tf.title),
      poster_path = COALESCE(wh.poster_path, tf.poster_path)
  FROM title_features tf
  WHERE tf.media_type = wh.media_type
    AND tf.media_id   = wh.media_id
    AND wh.media_type IN ('movie', 'tv')
    AND (wh.title IS NULL OR wh.poster_path IS NULL)
    AND (tf.title IS NOT NULL OR tf.poster_path IS NOT NULL)`;

/**
 * §15: the figures printed on BOTH sides. `rows_without_title` is the number this
 * whole script exists to lower, so it is a comparison rather than a promise, and
 * `rows_visible_to_the_ui` is the same claim stated in the reader's terms —
 * `GET /api/watch-time` filters on `media_type IN ('movie','tv')` and a non-null
 * title, which is what this counts.
 *
 * The minute totals are here because the most plausible way to break this job is to
 * touch the wrong table: a watch-time figure that moves means the backfill went
 * somewhere it had no business going.
 */
const RECEIPT_QUERY = `
  SELECT
    (SELECT count(*) FROM watch_history)                            AS watch_history_rows,
    (SELECT coalesce(sum(minutes_watched), 0) FROM watch_history)    AS signedin_minutes,
    (SELECT count(*) FROM anonymous_watch_history)                   AS anon_rows,
    (SELECT coalesce(sum(minutes_watched), 0) FROM anonymous_watch_history) AS anon_minutes,
    (SELECT count(*) FROM title_features)                            AS feature_rows,
    (SELECT count(*) FROM title_features WHERE title IS NOT NULL)     AS feature_rows_titled,
    (SELECT count(*) FROM watch_history
      WHERE media_type IN ('movie', 'tv') AND title IS NULL)          AS rows_without_title,
    (SELECT count(*) FROM watch_history
      WHERE media_type IN ('movie', 'tv')
        AND title IS NOT NULL
        AND last_updated IS NOT NULL)                                 AS rows_visible_to_the_ui`;

function isLoopback(connectionString: string): boolean {
  try {
    const host = new URL(connectionString).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

function requiresProductionConfirmation(connectionString: string): boolean {
  try {
    return new URL(connectionString).hostname.includes(PRODUCTION_HOST_MARKER);
  } catch {
    return false;
  }
}

/** Host and database only — never the user, never the password. */
function describeTarget(connectionString: string): string {
  try {
    const u = new URL(connectionString);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return '(unparseable connection string)';
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Why a fetch produced no row, kept apart because the operator's next move differs:
 * a 404 is a title TMDB does not have, a rejection is a payload we refused to trust,
 * an error is one we never got.
 */
type FailureKind = 'not_found' | 'rejected' | 'error';

interface Failure {
  title: string;
  kind: FailureKind;
  detail: string;
}

type FetchOutcome =
  | {
      ok: true;
      genreIds: number[];
      originalLanguage: string | null;
      title: string | null;
      posterPath: string | null;
    }
  | { ok: false; kind: FailureKind; detail: string };

async function fetchFeature(apiKey: string, pair: Pair): Promise<FetchOutcome> {
  const endpoint = titleFeatureEndpoint(pair.mediaType, pair.mediaId);
  try {
    const { data } = await axios.get(`${TMDB_BASE}${endpoint}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      params: { language: TITLE_FEATURE_LANGUAGE },
      timeout: REQUEST_TIMEOUT_MS,
    });

    const feature = titleFeatureFromPayload(pair.mediaType, pair.mediaId, data);
    if (!feature) {
      // Either TMDB answered `success:false`, or the payload's own id is not the one
      // we asked for. Both mean we must NOT write it under this key: a payload filed
      // under the wrong id is a cache that lies to every later reader.
      return { ok: false, kind: 'rejected', detail: 'payload did not describe the requested title' };
    }
    return {
      ok: true,
      genreIds: feature.genreIds,
      originalLanguage: feature.originalLanguage,
      title: feature.title,
      posterPath: feature.posterPath,
    };
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status === 404) return { ok: false, kind: 'not_found', detail: 'HTTP 404 from TMDB' };
    return {
      ok: false,
      kind: 'error',
      detail: status ? `HTTP ${status}` : (error as Error)?.message || 'request failed',
    };
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');

  const limitArg = argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : Number.POSITIVE_INFINITY;
  if (limitArg && (!Number.isInteger(limit) || limit <= 0)) {
    console.error(`--limit must be a positive whole number, got ${JSON.stringify(limitArg)}`);
    process.exit(1);
  }
  const bounded = Number.isFinite(limit);

  // Loaded inside main so that importing this file has no side effect.
  dotenv.config({ path: '.env.local' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log('SKIPPED: DATABASE_URL is not set, so nothing was executed.');
    process.exit(2);
  }

  // Both names, exactly as `app/api/tmdb-proxy/route.ts` reads them: a deployment
  // that sets only the `NEXT_PUBLIC_` form still has a working catalogue, so
  // refusing here on the server-only name would refuse a working installation.
  const apiKey = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
  if (!apiKey) {
    console.log('SKIPPED: no TMDB key (TMDB_API_KEY / NEXT_PUBLIC_TMDB_API_KEY).');
    console.log('Nothing was fetched and nothing was written — this is NOT a pass.');
    process.exit(2);
  }

  console.log(`target: ${describeTarget(dbUrl)}`);
  console.log(`mode:   ${apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(
    `tmdb:   ${TITLE_FEATURE_LANGUAGE}${bounded ? `, limit ${limit} fetch(es)` : ''}`,
  );

  if (apply && requiresProductionConfirmation(dbUrl) && !argv.includes(CONFIRM_FLAG)) {
    console.error(
      `\nRefusing to --apply against ${PRODUCTION_HOST_MARKER}.\n` +
        `§14 of the brief: do not modify production directly. Rehearse on a copy, then\n` +
        `re-run with ${CONFIRM_FLAG} once the copy has agreed with the plan.`,
    );
    process.exit(2);
  }

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: isLoopback(dbUrl) ? false : { rejectUnauthorized: false },
  });

  try {
    const before = (await pool.query(RECEIPT_QUERY)).rows[0] as Record<string, unknown>;
    console.log('\n--- BEFORE (§15) ---');
    console.table(before);

    const pairsResult = await pool.query<{
      media_type: string;
      media_id: number;
      signed_in: boolean;
      guest: boolean;
    }>(PAIRS_QUERY);

    const pairs: Pair[] = [];
    let unknownTypes = 0;
    for (const row of pairsResult.rows) {
      if (!isMediaType(row.media_type)) {
        // Unreachable through the query's own filter. Kept because a workload that
        // silently drops rows is a workload that looks smaller than it is, and this
        // script's whole report is about how much of the history it can explain.
        unknownTypes += 1;
        continue;
      }
      pairs.push({
        mediaType: row.media_type,
        // `pg` returns an INTEGER as a number and a BIGINT as a STRING, and the
        // difference already caused one dashboard defect (commit 6f7c285). `media_id`
        // is INTEGER today; the conversion is explicit so that widening the column
        // cannot turn an endpoint into `/movie/550.0`.
        mediaId: Number(row.media_id),
        signedIn: row.signed_in,
        guest: row.guest,
      });
    }
    if (unknownTypes > 0) {
      console.warn(`  ignored ${unknownTypes} pair(s) of an unknown media_type`);
    }

    const cacheResult = await pool.query<{
      media_type: string;
      media_id: number;
      genre_ids: number[] | null;
      title: string | null;
      fetched_at: Date | null;
    }>(CACHE_QUERY);

    const cache = new Map<string, CachedFeature>();
    for (const row of cacheResult.rows) {
      cache.set(`${row.media_type}/${Number(row.media_id)}`, {
        fetchedAt: row.fetched_at,
        genreIds: row.genre_ids,
        title: row.title,
      });
    }

    const now = Date.now();
    const toFetch: Pair[] = [];
    let skippedFresh = 0;
    for (const pair of pairs) {
      if (satisfiesAllReaders(cache.get(describeTitle(pair.mediaType, pair.mediaId)), now)) {
        skippedFresh += 1;
        continue;
      }
      toFetch.push(pair);
    }

    const planned = bounded ? toFetch.slice(0, limit) : toFetch;

    console.log('\n--- PLAN ---');
    console.log(`  distinct pairs in the history : ${pairs.length}`);
    console.log(`    from watch_history          : ${pairs.filter((p) => p.signedIn).length}`);
    console.log(`    from anonymous_watch_history: ${pairs.filter((p) => p.guest).length}`);
    console.log(`  already sufficient in cache   : ${skippedFresh}`);
    console.log(`  needing a fetch               : ${toFetch.length}`);
    console.log(`  fetched by this run           : ${planned.length}`);

    if (planned.length === 0) {
      console.log('\nnothing to fetch — the cache already satisfies both readers.');
    }

    let written = 0;
    const failures: Failure[] = [];

    for (let index = 0; index < planned.length; index += 1) {
      const pair = planned[index];
      const label = describeTitle(pair.mediaType, pair.mediaId);

      const result = await fetchFeature(apiKey, pair);
      if (!result.ok) {
        failures.push({ title: label, kind: result.kind, detail: result.detail });
        console.log(`  ! ${label} — ${result.detail}`);
      } else {
        console.log(
          `  ${apply ? '>' : '?'} ${label} — ${result.genreIds.length} genre(s), ` +
            `${result.title === null ? 'NO title' : 'title'}, ${result.originalLanguage ?? 'no language'}`,
        );
        if (apply) {
          await pool.query(UPSERT_FEATURE, [
            pair.mediaType,
            pair.mediaId,
            result.genreIds,
            result.originalLanguage,
            result.title,
            result.posterPath,
          ]);
          written += 1;
        }
      }

      // Paced after every request, refusals included: a 404 still spent one.
      if (index < planned.length - 1) await sleep(REQUEST_DELAY_MS);
    }

    if (!apply) {
      console.log('\n(dry run — no row was written; pass --apply to fetch and store)');
      return;
    }

    // ---- The un-hiding, and the receipt that says whether it worked -----------
    const updated = await pool.query(BACKFILL_HISTORY);
    const updatedCount = updated.rowCount ?? 0;

    const after = (await pool.query(RECEIPT_QUERY)).rows[0] as Record<string, unknown>;
    console.log('\n--- AFTER (§15) ---');
    console.table(after);

    console.log('\n--- REPORT ---');
    console.log(`  features written              : ${written}`);
    console.log(`  history rows un-hidden        : ${updatedCount}`);
    console.log(`  rows still without a title    : ${Number(after.rows_without_title)}`);
    console.log(`  rows visible to the UI        : ${Number(after.rows_visible_to_the_ui)}`);
    console.log(`  failures                      : ${failures.length}`);
    for (const kind of ['not_found', 'rejected', 'error'] as const) {
      const group = failures.filter((f) => f.kind === kind);
      if (group.length > 0) {
        console.log(`    ${kind} (${group.length}): ${group.map((f) => f.title).join(', ')}`);
      }
    }
    if (toFetch.length > planned.length) {
      console.log(
        `  still to fetch                : ${toFetch.length - planned.length} ` +
          `(raise --limit, or re-run with no limit)`,
      );
    }

    // §15: the write targets must not have moved anything else.
    const mustBeEqual = [
      'watch_history_rows',
      'signedin_minutes',
      'anon_rows',
      'anon_minutes',
      'feature_rows',
    ];
    const violations = mustBeEqual.filter((k) => Number(after[k]) !== Number(before[k]));
    if (violations.length > 0) {
      console.error(
        `\nBACKFILL VIOLATED ITS OWN CONTRACT — these must not change: ${violations.join(', ')}`,
      );
      process.exit(1);
    }

    // The claim, checked rather than asserted: the rows that are invisible must have
    // gone down by exactly as many rows as the UPDATE reported. A larger drop means
    // titles arrived from somewhere other than this run; a smaller one means the
    // UPDATE matched rows it did not actually fix.
    const hiddenBefore = Number(before.rows_without_title);
    if (Number(after.rows_without_title) !== hiddenBefore - updatedCount) {
      console.error(
        `\nrows without a title went ${hiddenBefore} -> ${Number(after.rows_without_title)}, ` +
          `but ${updatedCount} row(s) were reported updated ` +
          `(expected ${hiddenBefore - updatedCount}). The report and the data disagree.`,
      );
      process.exit(1);
    }

    console.log('\nno watch-time total and no row count changed.');
    if (failures.length > 0) {
      console.log(
        `${failures.length} title(s) could not be resolved — named above, left exactly as they were.`,
      );
      process.exit(1);
    }
    console.log('\nEXECUTED — the history is complete and the cache serves both readers.');
  } finally {
    await pool.end();
  }
}

// Only run the CLI when invoked directly, so `tests/titleFeatures.test.ts` can read
// this file as SOURCE TEXT without executing a fetch.
if (process.argv[1] && /backfill-title-features/.test(process.argv[1])) {
  main().catch((error) => {
    console.error('backfill failed:', error);
    process.exit(1);
  });
}
