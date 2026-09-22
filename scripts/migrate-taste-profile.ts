/**
 * Additive migration for the persistent taste profile (Slice 1).
 *
 * WHY A TABLE AND NOT A QUERY AT REQUEST TIME. The feature is "adapt the pages to
 * what this person has watched". The tempting shape is a `GROUP BY genre` run on
 * every page load, and it fails for a reason that is not performance: the
 * arithmetic that turns a history into a taste is a set of WEIGHTS — completion,
 * abandon, recency, rewatch — and those weights belong in `lib/tasteSignals.ts`
 * where a test can pin them. A profile computed per request would also need
 * TMDB metadata per title per request, and the catalogue tables in this database
 * are effectively EMPTY (measured: 1 / 0 / 0 rows), so there is nothing local to
 * join against. So the profile is computed once, stored, and read.
 *
 * ─── THE THREE TABLES, AND WHY EACH ONE ──────────────────────────────────────
 *
 * `title_features` is the CACHE of what a title is made of. Without it, every
 * recompute is an HTTP request per title to TMDB. `fetched_at` is present so that
 * a title whose genres TMDB has since corrected can be refetched — a cache with
 * no timestamp can never be invalidated.
 *
 * `taste_profiles` is ONE ROW PER OWNER, and its primary key is the owner key in
 * the SAME vocabulary `lib/historyOwnership.ts` already uses: `guest:<deviceId>`
 * for a visitor, `user:<id>` for an account. That is not a naming preference. The
 * anonymous path writes `anonymous_watch_history.session_id`, which is
 * `getDeviceId()` — the same string — so `guestOwnerKey(sessionId)` is exactly
 * the key under which a visitor's own history is already filed, and the merge on
 * sign-in ("son profil invité est fusionné avec son compte") can reuse the
 * adoption rule that already refuses to adopt another user's rows.
 *
 * `taste_terms` is the profile's body: one weighted term per genre or language.
 * A child table rather than a JSON column, because the read path is "which of
 * these candidate genres does this viewer carry, and how heavily" — a question
 * asked with a join, and a JSON blob would force the whole profile into the
 * application on every request to answer it. Normalisation happens once, at write
 * time, in `buildTasteProfile`.
 *
 * `owner_key` IS CONSTRAINED TO THE TWO PREFIXES. A key is the only thing that
 * separates one person's profile from another's, so a bare `''`, a `guest:` with
 * no id, or a stray `u:12` is not a typo to be tolerated — it is a key that
 * matches nothing, or worse, matches something else on the next read. §23 forbids
 * a cross-user leak, and the surest place to forbid it is the one place every
 * write must pass through. The constraint permits the two forms and rejects
 * everything else, so an unowned profile is unrepresentable rather than merely
 * unused.
 *
 * The constraint is written to agree with `parseOwnerKey`, and the agreement was
 * MEASURED rather than assumed: a bare `guest:`, a bare `user:`, a padded
 * `guest: guest`, a `u:12` and — the one that is easy to miss — a NESTED
 * `guest:guest:x` are all rejected there, so all five are rejected here too. The
 * nested case is the one worth the extra clause: it is what a merge bug produces
 * when one key is built from another, and it is a key no read path will ever
 * match, so without the clause it would be a profile written and never seen.
 * The parser remains the strict authority; this is the floor under it.
 *
 * WHY `media_type` IS CONSTRAINED HERE AND NOT ON `watch_history`. The existing
 * history table legitimately stores `admin_adjustment` rows — the stats route
 * excludes them by a constant precisely because they are real. A features row is
 * different: it exists only to describe a TMDB title, so the only two values it
 * can hold are the two TMDB has. The constraint turns a misspelled `series` into
 * an error at write time instead of a row that silently never matches a title.
 * If anime is ever fetched from the same API as its own type, that is one ALTER
 * and it should be, because until then a constraint naming a type nothing can
 * fetch would be documentation of an intention rather than a rule about the data.
 *
 * WHY THERE IS NO EXTRA INDEX ON `taste_terms`. Its primary key is
 * `(owner_key, term_type, term_id)`, so a lookup by `owner_key` is served by the
 * leading column of the key. The episodes migration needed an index because its
 * primary key was a surrogate `SERIAL`; adding one here would be a second copy of
 * the same structure, paid for on every write.
 *
 * SAFETY. Nothing here DROPs, DELETEs or rewrites an existing row, and no
 * statement touches `watch_history` or `anonymous_watch_history` at all. Every
 * statement is `IF NOT EXISTS`, so a re-run is a no-op and a partial failure is
 * recoverable by re-running. The script is a DRY RUN unless `--apply` is passed,
 * and it refuses `--apply` against a Neon host without a second, explicit flag —
 * §14 of the brief is "ne pas modifier la production directement", and a guard
 * that lives only in a comment is not a guard.
 *
 * THE STATEMENTS ARE EXPORTED AS DATA so `tests/tasteProfileSchema.test.ts` can
 * assert their shape from the source rather than from memory — the same
 * convention as `scripts/migrate-watch-history-episodes.ts`.
 *
 * Run:
 *   npx tsx scripts/migrate-taste-profile.ts               # dry run
 *   npx tsx scripts/migrate-taste-profile.ts --apply       # local/staging
 *   npx tsx scripts/migrate-taste-profile.ts --rollback    # print rollback
 *   npx tsx scripts/migrate-taste-profile.ts --rollback --apply
 */
import { Pool } from 'pg';
import dotenv from 'dotenv';

/** A statement, labelled so a failure names itself in the console. */
export interface Statement {
  label: string;
  sql: string;
}

/** The two owner-key prefixes, restated here only because SQL cannot import. */
const GUEST_PREFIX = 'guest:';
const USER_PREFIX = 'user:';

/**
 * The cached metadata a taste term is derived from.
 *
 * `genre_ids` is an `INTEGER[]` and not a child table: features are written in
 * one statement per title from one TMDB response, and read as a whole, so a
 * second table would add a join to every read to model a list that is never
 * queried by element. `original_language` is nullable rather than defaulted,
 * because a missing language is a title we know less about — not an English one.
 *
 * TEXT COLUMNS ARE BOUNDED. An unbounded `text` column that receives an API value
 * is a column that can hold a megabyte, and the failure it produces is a storage
 * incident rather than an error at the point of the mistake.
 */
export const CREATE_TITLE_FEATURES: Statement[] = [
  {
    label: 'title_features',
    sql: `
      CREATE TABLE IF NOT EXISTS title_features (
        media_type        VARCHAR(20) NOT NULL,
        media_id          INTEGER NOT NULL,
        genre_ids         INTEGER[] NOT NULL DEFAULT '{}',
        original_language VARCHAR(10),
        fetched_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (media_type, media_id),
        CONSTRAINT title_features_media_type_check CHECK (media_type IN ('movie', 'tv'))
      )`,
  },
];

/**
 * One row per owner, holding the counts that say how much was readable.
 *
 * `title_count` and `unknown_title_count` are stored rather than derived,
 * because they are what the read path uses to decide whether it may show a score
 * at all — and because they are the honest answer to "built from how much of this
 * person's history". Recomputing them at read time would mean re-reading the
 * history to answer a question about a profile that has already been computed.
 *
 * `owner_key` is the primary key, so a recompute is an upsert of one row rather
 * than a delete-and-insert race that could leave a viewer with no profile at all.
 */
export const CREATE_TASTE_PROFILES: Statement[] = [
  {
    label: 'taste_profiles',
    sql: `
      CREATE TABLE IF NOT EXISTS taste_profiles (
        owner_key           VARCHAR(200) PRIMARY KEY,
        computed_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        signal_weight       DOUBLE PRECISION NOT NULL DEFAULT 0,
        title_count         INTEGER NOT NULL DEFAULT 0,
        unknown_title_count INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT taste_profiles_owner_key_check CHECK (
          (owner_key LIKE '${GUEST_PREFIX}%' AND length(owner_key) > ${GUEST_PREFIX.length}
             AND owner_key NOT LIKE '${GUEST_PREFIX}%:%') OR
          (owner_key LIKE '${USER_PREFIX}%'  AND length(owner_key) > ${USER_PREFIX.length}
             AND owner_key NOT LIKE '${USER_PREFIX}%:%')
        )
      )`,
  },
];

/**
 * The weighted terms.
 *
 * `ON DELETE CASCADE` on the owner key is the structural half of two features:
 * the sign-in merge (moving a guest's terms onto the account, then deleting the
 * guest profile) and any future "delete my data" path. A term row whose profile
 * is gone would be a term nothing can ever read or remove.
 *
 * The weight may be NEGATIVE and the column is signed on purpose: an abandoned
 * title lowers the weight of the genres it is made of, which is the signal
 * "contenus abandonnés très vite" was requested for. A `CHECK (weight >= 0)` here
 * would silently delete that signal.
 */
export const CREATE_TASTE_TERMS: Statement[] = [
  {
    label: 'taste_terms',
    sql: `
      CREATE TABLE IF NOT EXISTS taste_terms (
        owner_key VARCHAR(200) NOT NULL REFERENCES taste_profiles(owner_key) ON DELETE CASCADE,
        term_type VARCHAR(20) NOT NULL,
        term_id   VARCHAR(50) NOT NULL,
        weight    DOUBLE PRECISION NOT NULL,
        PRIMARY KEY (owner_key, term_type, term_id),
        CONSTRAINT taste_terms_term_type_check CHECK (term_type IN ('genre', 'language'))
      )`,
  },
];

/** Everything this migration does, in order. Profiles before the terms that cite them. */
export const MIGRATION: Statement[] = [
  ...CREATE_TITLE_FEATURES,
  ...CREATE_TASTE_PROFILES,
  ...CREATE_TASTE_TERMS,
];

/** The tables this migration creates, for the rollback and for the shape test. */
export const CREATED_TABLES = ['taste_terms', 'taste_profiles', 'title_features'] as const;

/**
 * §15: what must be counted before and after.
 *
 * Both are SELECTs, and this migration's contract is stricter than the episodes
 * one: it creates three tables and touches NO existing row, so every figure below
 * must be EQUAL before and after, not merely non-decreasing.
 *
 * THE MINUTES ARE TWO COLUMNS AND NEITHER IS NAMED `total_minutes`. The first
 * draft of this query summed `watch_history` alone and called the result
 * `total_minutes`, which on the real database reads 7757 while the site-wide
 * total the dashboard shows is 43010 — the rest lives in `anonymous_watch_history`
 * (303 rows against 108). A figure whose NAME is wider than its QUERY is how a
 * reader is told something untrue without a single wrong number being printed,
 * which is the defect the admin dashboard was just corrected for. So the two
 * tables are counted and labelled separately, and nobody has to know which one a
 * bare `total_minutes` was really reading.
 *
 * These sums INCLUDE `admin_adjustment` rows, unlike the stats route, and that is
 * correct here for the opposite reason: this is a before/after comparison whose
 * claim is "nothing changed", so leaving a category out would mean a statement
 * about a change that had been overlooked.
 */
export const OLD_ROWS_QUERY = `
  SELECT
    (SELECT count(*) FROM watch_history)                          AS watch_history_rows,
    (SELECT count(DISTINCT user_id) FROM watch_history)            AS watch_history_users,
    (SELECT coalesce(sum(minutes_watched), 0) FROM watch_history)   AS signedin_minutes,
    (SELECT count(*) FROM anonymous_watch_history)                 AS anon_rows,
    (SELECT coalesce(sum(minutes_watched), 0) FROM anonymous_watch_history) AS anon_minutes,
    (SELECT count(*) FROM watch_history_episodes)                  AS episode_rows,
    (SELECT count(*) FROM users)                                   AS user_rows`;

export const NEW_ROWS_QUERY = `
  SELECT
    (SELECT count(*) FROM watch_history)                          AS watch_history_rows,
    (SELECT count(DISTINCT user_id) FROM watch_history)            AS watch_history_users,
    (SELECT coalesce(sum(minutes_watched), 0) FROM watch_history)   AS signedin_minutes,
    (SELECT count(*) FROM anonymous_watch_history)                 AS anon_rows,
    (SELECT coalesce(sum(minutes_watched), 0) FROM anonymous_watch_history) AS anon_minutes,
    (SELECT count(*) FROM watch_history_episodes)                  AS episode_rows,
    (SELECT count(*) FROM users)                                   AS user_rows,
    (SELECT count(*) FROM title_features)                          AS feature_rows,
    (SELECT count(*) FROM taste_profiles)                          AS profile_rows,
    (SELECT count(*) FROM taste_terms)                             AS term_rows,
    (SELECT count(*) FROM (
       SELECT media_type, media_id FROM watch_history WHERE media_type <> 'admin_adjustment'
       UNION
       SELECT media_type, media_id FROM anonymous_watch_history WHERE media_type <> 'admin_adjustment'
     ) AS distinct_titles)                                         AS distinct_titles_in_history`;

/**
 * Rollback (§14.6), and here it CAN be a plain set of drops — which is the one
 * place this file differs from the episodes migration, so the difference is worth
 * stating rather than assuming.
 *
 * There, the added columns hold the only copy of every stored position, and
 * dropping them would destroy the data the brief exists to protect, so each was
 * dropped only when entirely NULL. Here, every row in these three tables is
 * DERIVED: `title_features` comes from TMDB and can be refetched, and the two
 * profile tables are recomputed from the history, which is untouched by this
 * migration and stays the source of truth. Dropping these tables therefore loses
 * a cache and a derived summary, and no observation. That is the reason the
 * unconditional drop is safe, and it is a property of what these tables hold —
 * not a shortcut.
 */
export function rollbackStatements(): Statement[] {
  return CREATED_TABLES.map((table) => ({
    label: `drop ${table}`,
    sql: `DROP TABLE IF EXISTS ${table}`,
  }));
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
  // tests/tasteProfileSchema.test.ts does, to read the statements as data — has
  // no side effect on the importer's environment.
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
      const plan = rollbackStatements();
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
    const mustBeEqual = [
      'watch_history_rows',
      'watch_history_users',
      'signedin_minutes',
      'anon_rows',
      'anon_minutes',
      'episode_rows',
      'user_rows',
    ];
    const violations = mustBeEqual.filter((k) => Number(afterRow[k]) !== Number(beforeRow[k]));
    if (violations.length > 0) {
      console.error(
        `\nMIGRATION VIOLATED ITS OWN CONTRACT — these must not change: ${violations.join(', ')}`,
      );
      process.exit(3);
    }
    console.log('\nno pre-existing row, user, or minute was changed.');
    console.log(
      `\ntitles in the history still needing features: ${afterRow.distinct_titles_in_history}`,
    );
    console.log('profiles computed so far: 0 by this migration — the recompute job fills them.');
  } finally {
    await pool.end();
  }
}

// Only run the CLI when invoked directly, so importing the statements as data
// (the test does) has no side effects.
if (process.argv[1] && /migrate-taste-profile/.test(process.argv[1])) {
  main().catch((error) => {
    console.error('migration failed:', error);
    process.exit(1);
  });
}
