/**
 * Additive migration for the watch-history episode architecture.
 *
 * WHAT THIS FIXES, AND WHY IT IS NOT OPTIONAL.
 *
 * Measured, read-only, against the production database (PostgreSQL 17.11):
 * `watch_history` has SIX columns — id, user_id, media_type, media_id,
 * minutes_watched, last_updated. There is no `title`, no `poster_path`, no
 * `current_time`, no `total_duration`, no `season`, no `episode`. `information_schema`
 * counts ZERO columns named `current_time` across both watch tables.
 *
 * Every signed-in watch-history statement in the shipped code addresses those
 * missing columns, so all three fail on the real database:
 *
 *   GET  /api/watch-time   -> ERROR 42703: column "title" does not exist
 *   writeSignedInProgress  -> ERROR 42703: column "title" of relation "watch_history" does not exist
 *   guarded SELECT         -> ERROR 42703: column "current_time" does not exist
 *
 * Part A below adds them, which is what makes the deployed code able to run at
 * all. Parts B and C answer §3/§4/§5 of the brief: the single
 * `UNIQUE(user_id, media_type, media_id)` row cannot remember that S1E1, S1E4,
 * S2E7 and S3E2 were each left at a different timecode, so a per-slot child
 * table is introduced beside it, and the parent keeps its role as the
 * Continue-Watching pointer.
 *
 * WHY THE CHILD TABLE HAS NO `minutes_watched`. §16 requires total watch time and
 * content progression to stay separable, and that an episode switch never
 * inflates watch time. A column that does not exist cannot be incremented by a
 * progression write, so the separation is structural rather than a rule a future
 * caller has to remember. Watch time continues to accumulate on the parent row
 * alone, exactly as it does now.
 *
 * SAFETY. Nothing here DROPs, DELETEs, or rewrites an existing value. Every
 * statement is `IF NOT EXISTS` or `ON CONFLICT DO NOTHING`, so re-running is a
 * no-op and a partial failure is recoverable by re-running. The script is a DRY
 * RUN unless `--apply` is passed, and it refuses `--apply` against a Neon host
 * without a second, explicit flag — §14 of the brief is "ne pas modifier la
 * production directement", and a guard that only lives in a comment is not a
 * guard.
 *
 * The statements are exported as data so `tests/watchHistoryEpisodes.test.ts`
 * can apply them to a scratch schema and assert the resulting shape, instead of
 * the shape being asserted from memory — which is precisely the mistake
 * `tests/watchHistoryConcurrency.test.ts` was making.
 *
 * Run:
 *   npx tsx scripts/migrate-watch-history-episodes.ts                # dry run
 *   npx tsx scripts/migrate-watch-history-episodes.ts --apply        # local/staging
 *   npx tsx scripts/migrate-watch-history-episodes.ts --rollback     # print rollback
 *   npx tsx scripts/migrate-watch-history-episodes.ts --rollback --apply
 */
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { COMPLETION_RATIO } from '../lib/progressionGuard';

/** A statement, labelled so a failure names itself in the console. */
export interface Statement {
  label: string;
  sql: string;
}

/**
 * The six progression columns the deployed code addresses and production lacks.
 *
 * The identifiers are QUOTED, and for `current_time` that is load-bearing rather
 * than cosmetic: `CURRENT_TIME` is a reserved word (category R) in PostgreSQL, so
 * the unquoted form is `42601` as a column definition — and, worse, in a SELECT
 * list it SILENTLY evaluates to the server's time of day instead of erroring.
 * Quoting is the only form that means the column in both positions.
 *
 * Types mirror what the client sends: `FLOAT` for seconds and duration, because
 * `progressionColumns` produces JS numbers and video positions are fractional
 * (`32:14.4` is a real observation), and `INTEGER` for season and episode, with
 * season 0 reserved for TMDB's SPECIALS.
 */
export const ADD_PROGRESSION_COLUMNS: Statement[] = [
  { label: 'watch_history.title', sql: `ALTER TABLE watch_history ADD COLUMN IF NOT EXISTS "title" VARCHAR(500)` },
  { label: 'watch_history.poster_path', sql: `ALTER TABLE watch_history ADD COLUMN IF NOT EXISTS "poster_path" VARCHAR(500)` },
  { label: 'watch_history.current_time', sql: `ALTER TABLE watch_history ADD COLUMN IF NOT EXISTS "current_time" FLOAT` },
  { label: 'watch_history.total_duration', sql: `ALTER TABLE watch_history ADD COLUMN IF NOT EXISTS "total_duration" FLOAT` },
  { label: 'watch_history.season', sql: `ALTER TABLE watch_history ADD COLUMN IF NOT EXISTS "season" INTEGER` },
  { label: 'watch_history.episode', sql: `ALTER TABLE watch_history ADD COLUMN IF NOT EXISTS "episode" INTEGER` },
];

/**
 * The per-slot child table.
 *
 * Identity is `(user_id, media_type, media_id, season, episode)` — one row per
 * episode a viewer has been on, which is the thing the parent's single unique
 * key cannot express (§3).
 *
 * `REFERENCES users(id) ON DELETE CASCADE` mirrors the parent's own foreign key
 * verbatim, including the cascade. That is deliberate: a child table whose
 * lifetime rule differs from its parent's is a source of orphans, and the
 * cascade is already the behaviour production has chosen for watch history.
 * `user_id` is NOT NULL here even though the parent permits NULL, because the
 * anonymous path writes to `anonymous_watch_history` and never to this table —
 * so an episode row with no owner is unrepresentable rather than merely unused.
 *
 * `first_seen_at` and `last_updated` are both present because the merge rule
 * needs to tell "when this slot was first reached" from "when it was last
 * observed", and a single timestamp forces one of the two questions to be
 * answered wrongly.
 */
export const CREATE_EPISODES_TABLE: Statement[] = [
  {
    label: 'watch_history_episodes',
    sql: `
      CREATE TABLE IF NOT EXISTS watch_history_episodes (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        media_type    VARCHAR(50) NOT NULL,
        media_id      INTEGER NOT NULL,
        season        INTEGER NOT NULL,
        episode       INTEGER NOT NULL,
        "current_time" FLOAT,
        total_duration FLOAT,
        completed     BOOLEAN NOT NULL DEFAULT FALSE,
        first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_updated  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, media_type, media_id, season, episode)
      )`,
  },
  {
    label: 'idx_wh_episodes_slot',
    sql: `CREATE INDEX IF NOT EXISTS idx_wh_episodes_slot
            ON watch_history_episodes (user_id, media_type, media_id, season, episode)`,
  },
  {
    label: 'idx_wh_episodes_recent',
    sql: `CREATE INDEX IF NOT EXISTS idx_wh_episodes_recent
            ON watch_history_episodes (user_id, last_updated DESC)`,
  },
];

/**
 * The backfill, parent rows -> child rows.
 *
 * It is written to be run against the database as it is TODAY, which means it
 * will move ZERO rows: the six columns it reads do not exist yet, so after Part
 * A they are all NULL, and no row names a slot. That is the honest outcome and it
 * is reported as such — an untruthful "migrated 108 rows" would be the more
 * alarming result, because it would mean the columns had been populated by
 * something nobody has identified.
 *
 * It remains in the migration because it is not a one-off: Part A is applied
 * on one deploy and the columns fill up over the following days, so any
 * subsequent run is the statement that folds those newly-measured parent slots
 * into the child table. `DO NOTHING` keeps that idempotent.
 *
 * `completed` uses `COMPLETION_RATIO` imported from the guard rather than a
 * literal, so the ratio that decides a rewatch in the browser and the ratio
 * recorded here cannot drift apart.
 */
export const BACKFILL_EPISODES: Statement[] = [
  {
    label: 'backfill parent -> child',
    sql: `
      INSERT INTO watch_history_episodes
        (user_id, media_type, media_id, season, episode,
         "current_time", total_duration, completed, first_seen_at, last_updated)
      SELECT
        user_id, media_type, media_id, season, episode,
        "current_time", total_duration,
        ("current_time" IS NOT NULL
          AND total_duration IS NOT NULL
          AND total_duration > 0
          AND "current_time" / total_duration >= ${COMPLETION_RATIO}),
        last_updated, last_updated
      FROM watch_history
      WHERE user_id IS NOT NULL
        AND media_type = 'tv'
        AND season IS NOT NULL
        AND episode IS NOT NULL
      ON CONFLICT (user_id, media_type, media_id, season, episode) DO NOTHING`,
  },
];

/** Everything this migration does, in order. */
export const MIGRATION: Statement[] = [
  ...ADD_PROGRESSION_COLUMNS,
  ...CREATE_EPISODES_TABLE,
  ...BACKFILL_EPISODES,
];

/**
 * §15: what must be counted before and after.
 *
 * Both are SELECTs. `OLD` is the state to record, `NEW` is the state to prove
 * unchanged except by addition — every figure in `NEW` must be >= its `OLD`
 * counterpart, and the row totals of the existing tables must be EQUAL, because
 * this migration adds columns and a table and touches no existing row.
 */
export const OLD_ROWS_QUERY = `
  SELECT
    (SELECT count(*) FROM watch_history)                                     AS watch_history_rows,
    (SELECT count(DISTINCT user_id) FROM watch_history)                       AS watch_history_users,
    (SELECT count(*) FROM watch_history WHERE media_type = 'tv')              AS tv_rows,
    (SELECT count(*) FROM watch_history WHERE media_type = 'movie')           AS movie_rows,
    (SELECT coalesce(sum(minutes_watched), 0) FROM watch_history)             AS total_minutes,
    (SELECT count(*) FROM anonymous_watch_history)                            AS anon_rows`;

export const NEW_ROWS_QUERY = `
  SELECT
    (SELECT count(*) FROM watch_history)                                             AS watch_history_rows,
    (SELECT count(DISTINCT user_id) FROM watch_history)                              AS watch_history_users,
    (SELECT count(*) FROM watch_history WHERE media_type = 'tv')                     AS tv_rows,
    (SELECT count(*) FROM watch_history WHERE media_type = 'movie')                  AS movie_rows,
    (SELECT coalesce(sum(minutes_watched), 0) FROM watch_history)                    AS total_minutes,
    (SELECT count(*) FROM anonymous_watch_history)                                   AS anon_rows,
    (SELECT count(*) FROM watch_history_episodes)                                    AS episode_rows,
    (SELECT count(*) FROM watch_history
       WHERE media_type = 'tv' AND season IS NOT NULL AND episode IS NOT NULL)       AS parent_rows_with_slot`;

/**
 * The columns this migration adds to `watch_history`, by name, for the rollback
 * guard and for the shape assertion in the test.
 */
export const ADDED_COLUMN_NAMES = [
  'title',
  'poster_path',
  'current_time',
  'total_duration',
  'season',
  'episode',
] as const;

/**
 * Rollback plan (§14.6), and it is deliberately not a single DROP.
 *
 * The child table is removed unconditionally: nothing else in the application
 * reads it until the write path ships alongside it, so dropping it restores the
 * prior state exactly.
 *
 * The six columns are NOT dropped unconditionally. Once the write path is live
 * they hold the only copy of every stored position, and dropping them would
 * destroy exactly the data this whole brief exists to protect. So each column is
 * dropped only when it is entirely NULL — meaning it has never held a value, so
 * there is nothing to lose — and the script reports which ones it refused and
 * why. A rollback that cannot be run safely is not a rollback plan.
 */
export function rollbackStatements(nullColumns: readonly string[]): Statement[] {
  return [
    { label: 'drop watch_history_episodes', sql: `DROP TABLE IF EXISTS watch_history_episodes` },
    ...nullColumns.map((name) => ({
      label: `drop watch_history.${name} (entirely NULL)`,
      sql: `ALTER TABLE watch_history DROP COLUMN IF EXISTS "${name}"`,
    })),
  ];
}

/**
 * Whether this target needs TLS.
 *
 * A managed host (Neon, and every other remote deployment) requires it and
 * rejects a plaintext connection; a locally booted cluster does not speak TLS at
 * all and rejects the handshake with "The server does not support SSL
 * connections". Demanding TLS unconditionally therefore makes §14's first step —
 * "sur une copie, pas sur la production" — impossible to carry out, because the
 * copy cannot be reached. The rule is chosen by where the connection is going,
 * which is the only thing that decides it, and it defaults to requiring TLS for
 * anything that is not explicitly a local address.
 */
function isLoopback(connectionString: string): boolean {
  try {
    const host = new URL(connectionString).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

/** Which added columns are entirely NULL right now. */
export const NULL_COLUMNS_QUERY = `
  SELECT ${ADDED_COLUMN_NAMES.map(
    (n) => `count(*) FILTER (WHERE "${n}" IS NOT NULL) AS "${n}"`,
  ).join(',\n         ')}
  FROM watch_history`;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const PRODUCTION_HOST_MARKER = 'neon.tech';
const CONFIRM_FLAG = '--i-know-this-is-production';

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

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const rollback = argv.includes('--rollback');

  // Loaded here rather than at module scope so that IMPORTING this file — which
  // tests/watchHistoryEpisodes.test.ts does, to apply the statements as data —
  // has no side effect on the importer's environment.
  dotenv.config({ path: '.env.local' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL is not set (looked in the environment and .env.local).');
    process.exit(1);
  }

  console.log(`target: ${describeTarget(dbUrl)}`);
  console.log(`mode:   ${rollback ? 'ROLLBACK' : apply ? 'APPLY' : 'DRY RUN'}`);

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
    if (rollback) {
      const probe = await pool.query<Record<string, string>>(NULL_COLUMNS_QUERY);
      const populated = ADDED_COLUMN_NAMES.filter((n) => Number(probe.rows[0]?.[n] ?? 0) > 0);
      const entirelyNull = ADDED_COLUMN_NAMES.filter((n) => !populated.includes(n));

      if (populated.length > 0) {
        console.log(`\ncolumns holding data, NOT dropped: ${populated.join(', ')}`);
      }
      const plan = rollbackStatements(entirelyNull);
      for (const s of plan) console.log(`  ${apply ? '>' : '?'} ${s.label}`);
      if (!apply) {
        console.log('\n(dry run — pass --apply to execute the rollback)');
        return;
      }
      for (const s of plan) await pool.query(s.sql);
      console.log('\nrollback complete.');
      return;
    }

    const before = await pool.query(OLD_ROWS_QUERY);
    console.log('\n--- BEFORE (§15 OLD ROWS) ---');
    console.table(before.rows[0]);

    for (const s of MIGRATION) {
      if (!apply) {
        console.log(`  ? ${s.label}`);
        continue;
      }
      await pool.query(s.sql);
      console.log(`  > ${s.label}`);
    }

    if (!apply) {
      console.log('\n(dry run — nothing was executed; pass --apply to run)');
      return;
    }

    const after = await pool.query(NEW_ROWS_QUERY);
    console.log('\n--- AFTER (§15 NEW ROWS) ---');
    console.table(after.rows[0]);

    const beforeRow = before.rows[0] as Record<string, unknown>;
    const afterRow = after.rows[0] as Record<string, unknown>;
    const mustBeEqual = ['watch_history_rows', 'watch_history_users', 'tv_rows', 'movie_rows', 'total_minutes', 'anon_rows'];
    const violations = mustBeEqual.filter(
      (k) => Number(afterRow[k]) !== Number(beforeRow[k]),
    );
    if (violations.length > 0) {
      console.error(
        `\nMIGRATION VIOLATED ITS OWN CONTRACT — these must not change: ${violations.join(', ')}`,
      );
      process.exit(3);
    }
    console.log('\nno pre-existing row, user, or minute was changed.');
    console.log(`episode rows now present: ${afterRow.episode_rows}`);
  } finally {
    await pool.end();
  }
}

// Only run the CLI when invoked directly, so importing the statements as data
// (the test does) has no side effects.
if (process.argv[1] && /migrate-watch-history-episodes/.test(process.argv[1])) {
  main().catch((error) => {
    console.error('migration failed:', error);
    process.exit(1);
  });
}
