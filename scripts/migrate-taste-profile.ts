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
 * THE CONSTRAINT IS A FLOOR UNDER `parseOwnerKey`, NOT A TRANSLATION OF IT, and
 * that distinction is the correction of a real defect rather than a preference.
 * The first version tried to mirror the parser clause for clause, passed every
 * text assertion in the test, and was then found by execution to accept
 * `'guest: guest'` — see `OWNER_ID_PATTERN` above, which carries the whole
 * account. The lesson is recorded rather than tidied away: the parser is the
 * strict authority, the schema only has to never be more permissive, and a
 * narrower allow-list gets that property by construction where a deny-list has to
 * enumerate the infinite set of forms it is denying.
 *
 * The nested `guest:guest:x` is still refused — the allow-list has no colon — and
 * it is worth keeping in mind as the form a merge bug produces when one key is
 * built from another, because it is a key no read path will ever match.
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
 *
 * ─── WHY `title` AND `poster_path` ARE HERE, WHICH IS NOT WHERE THEY STARTED ──
 *
 * The first version of this table cached only what a RECOMMENDER needs: the genres
 * and the original language. The display half of the problem was left to
 * `watch_history.title`, which looked reasonable until the column was counted: of
 * the 101 real rows in the signed-in history, 100 carry a NULL title, because the
 * rows written before the title column existed can never gain one — the values
 * were never stored, so there is nothing to read back. `GET /api/watch-time`
 * filters on `title IS NOT NULL`, which is why a viewer with a hundred real
 * observations sees an almost empty history: the rows are there and are hidden.
 *
 * The remedy is ONE fetch per title, and it is the same fetch the recommender
 * needs. Keeping the title in `title_features` rather than fetching it inline into
 * `watch_history` is what makes that true: the features cache is keyed by
 * `(media_type, media_id)`, exactly the pair the history repeats, so the 279
 * distinct titles in the two history tables cost 279 requests ONCE and every later
 * reader — the history backfill, the recompute, the next backfill — reads a row
 * that is already there.
 *
 * `title` is the DISPLAY title in the language the fetch asked for (see
 * `TITLE_FEATURE_LANGUAGE` in lib/titleFeatures.ts), and `original_language` on
 * the same row is the language-independent field TMDB returns regardless of
 * `language`. Storing both is deliberate: a French title does not mean the work is
 * French, and a recommender that confused the two would weigh every translated
 * release as an original-language signal.
 *
 * `poster_path` is stored EXACTLY as TMDB returns it — a bare path like
 * `/abc123.jpg`, with the leading slash and no host. That is the form the client
 * already expects (`components/HistoryCard.tsx:28` prepends
 * `https://image.tmdb.org/t/p/w500` unless the value already starts with `http`),
 * and the form the write path stores today. Storing a full URL here would be
 * double-prefixed at render time and the image would 404 — so this is a
 * compatibility constraint with an existing reader, not a formatting choice.
 *
 * BOTH ARE NULLABLE. A TMDB title with no poster is a real title, and a fetch that
 * returns no display title is a fact to report rather than a row to invent (§3).
 * NULL means "not known", which is different from `''` meaning "known to be
 * empty" — the client already treats a missing poster as `''` for its own render
 * path, so the distinction is preserved in the database and flattened at the edge.
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
        title             VARCHAR(500),
        poster_path       VARCHAR(500),
        fetched_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (media_type, media_id),
        CONSTRAINT title_features_media_type_check CHECK (media_type IN ('movie', 'tv'))
      )`,
  },
];

/**
 * The additive repair, for the database where the FIRST version of the table ran.
 *
 * The same reason `REPAIR_OWNER_KEY_CONSTRAINT` exists below: `CREATE TABLE IF NOT
 * EXISTS` is a no-op on a table that already exists, so adding these two columns to
 * the CREATE above fixes every FUTURE database and no existing one — and the
 * existing one is production, which is the only database that has the table at all.
 * A correction that silently does nothing where it is needed is not a correction.
 *
 * `ADD COLUMN IF NOT EXISTS` is idempotent on its own: running it twice leaves the
 * same state, and a database created from the CREATE above (which already has both
 * columns) is left exactly as it was. Neither statement rewrites a row, drops
 * anything, or moves data: adding a NULLable column with no default is a catalogue
 * change in PostgreSQL, not a table rewrite.
 *
 * NO `NOT NULL`, NO DEFAULT. A default would be a value invented for the rows that
 * exist, and the whole point of the two columns is that "we do not know this
 * title's name yet" must stay representable — that is the state the backfill job
 * reads to decide what to fetch. A `DEFAULT ''` would make those rows
 * indistinguishable from a title TMDB says has no name.
 */
export const ADD_TITLE_FEATURES_METADATA: Statement[] = [
  {
    label: 'title_features: add the display title, if the table predates it',
    sql: `ALTER TABLE title_features ADD COLUMN IF NOT EXISTS title VARCHAR(500)`,
  },
  {
    label: 'title_features: add the poster path, if the table predates it',
    sql: `ALTER TABLE title_features ADD COLUMN IF NOT EXISTS poster_path VARCHAR(500)`,
  },
];

/**
 * The alphabet an owner id may use, and the fix for a defect found by EXECUTION.
 *
 * WHAT WENT WRONG. The first version of the constraint below refused a nested
 * `guest:guest:x` and a bare `guest:` — the two forms that were easy to think of
 * — by writing `owner_key NOT LIKE '<prefix>%:%'` and a length check. Every text
 * assertion in `tests/tasteProfileSchema.test.ts` passed. Then the constraint was
 * exercised against the real server, and `'guest: guest'` was ACCEPTED: a space is
 * neither a colon nor an absent id, so neither clause saw it, while
 * `parseOwnerKey` refuses it on `/[\s:]/` (lib/historyOwnership.ts:119). A profile
 * written under that key is a profile no read path will ever match — silently,
 * with no error and no log, which is §23's failure mode exactly.
 *
 * WHY AN ALLOW-LIST AND NOT A DENY-LIST. The parser's rule is "any suffix with no
 * whitespace and no colon", an infinite set that SQL would have to re-implement
 * exactly to agree with. It does not have to: the schema is a FLOOR, so it only
 * has to avoid accepting what the parser refuses, and a narrower rule gets that
 * for free. `[A-Za-z0-9_-]` covers every id the code can produce —
 * `getDeviceId()` builds `anon_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`
 * (lib/historyOwnership.ts:455), which is `[a-z0-9_]`, and a `users.id` is an
 * INTEGER, so its string form is `[0-9]` — and refuses the space, the tab, the
 * `%`, the `;` and the second colon all at once.
 *
 * THE `+` IS LOAD-BEARING. `substring('guest:' from 7)` is the empty string, and
 * the empty string does not match `^[…]+$`, so a bare prefix is refused without a
 * separate length check. That is why there is none.
 *
 * The pattern is EXPORTED so the test can run it against real keys in JS — which
 * is what turns "the SQL contains these clauses" into "these keys are refused" —
 * and so the SQL and the test cannot hold two copies of the rule. PostgreSQL ARE
 * and JavaScript agree on this pattern: it uses no shorthand class, only a
 * bracket expression and two anchors. `scripts/verify-taste-schema.ts` is the
 * executed proof on the PostgreSQL side.
 */
export const OWNER_ID_PATTERN = '^[A-Za-z0-9_-]+$';

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
          (owner_key LIKE '${GUEST_PREFIX}%'
             AND substring(owner_key from ${GUEST_PREFIX.length + 1}) ~ '${OWNER_ID_PATTERN}') OR
          (owner_key LIKE '${USER_PREFIX}%'
             AND substring(owner_key from ${USER_PREFIX.length + 1}) ~ '${OWNER_ID_PATTERN}')
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

/**
 * The repair, for a database where the FIRST version of the constraint ran.
 *
 * WHY THIS EXISTS AND WHY IT IS NOT A HOOK. `CREATE TABLE IF NOT EXISTS` is a
 * no-op on a table that already exists, so correcting the CHECK in the CREATE
 * above fixes every FUTURE database and no existing one — and the existing one is
 * production, which is the only place the weak constraint was ever applied. A
 * correction that silently does nothing on the one database that needs it is not
 * a correction.
 *
 * `DROP CONSTRAINT IF EXISTS` then `ADD` makes the pair idempotent: running it
 * twice ends in the same state, and a database that never had the old constraint
 * is left exactly as it was. Nothing is dropped but a RULE — no row, no column,
 * no table — and the data is untouched on both statements.
 *
 * THE ONE ORDERING NOTE, stated because it is a real failure mode rather than a
 * theoretical one. If a future run finds rows that the STRICTER constraint
 * refuses, the `ADD` fails and the table is left with no owner-key constraint at
 * all until the offending rows are cleaned and this is re-run. That is the
 * correct outcome — refusing to install a rule it cannot enforce, loudly, with a
 * non-zero exit — but it is worth knowing before reading the failure. Here it
 * cannot arise: the table was created minutes ago and holds zero rows, which the
 * probe confirmed.
 */
export const REPAIR_OWNER_KEY_CONSTRAINT: Statement[] = [
  {
    label: 'taste_profiles: drop the first version of the owner-key check',
    sql: `ALTER TABLE taste_profiles DROP CONSTRAINT IF EXISTS taste_profiles_owner_key_check`,
  },
  {
    label: 'taste_profiles: install the allow-list owner-key check',
    sql: `
      ALTER TABLE taste_profiles ADD CONSTRAINT taste_profiles_owner_key_check CHECK (
        (owner_key LIKE '${GUEST_PREFIX}%'
           AND substring(owner_key from ${GUEST_PREFIX.length + 1}) ~ '${OWNER_ID_PATTERN}') OR
        (owner_key LIKE '${USER_PREFIX}%'
           AND substring(owner_key from ${USER_PREFIX.length + 1}) ~ '${OWNER_ID_PATTERN}')
      )`,
  },
];

/** Everything this migration does, in order. Profiles before the terms that cite them. */
export const MIGRATION: Statement[] = [
  ...CREATE_TITLE_FEATURES,
  ...ADD_TITLE_FEATURES_METADATA,
  ...CREATE_TASTE_PROFILES,
  ...CREATE_TASTE_TERMS,
  ...REPAIR_OWNER_KEY_CONSTRAINT,
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
    (SELECT count(*) FROM users)                                   AS user_rows,
    (SELECT count(*) FROM watch_history
      WHERE media_type <> 'admin_adjustment' AND title IS NULL)     AS hidden_history_rows`;

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
    (SELECT count(*) FROM title_features WHERE title IS NOT NULL)   AS feature_rows_with_title,
    (SELECT count(*) FROM watch_history
      WHERE media_type <> 'admin_adjustment' AND title IS NULL)     AS hidden_history_rows,
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
      // Counted in BOTH queries on purpose. This migration adds columns and
      // creates tables; it resolves no title and fills no history row, so the
      // number of hidden observations must come out the other side unchanged.
      // A backfill that ran inside a migration would move this figure and the
      // contract would say so — which is exactly the separation §16 asks for
      // between "one logical operation" and everything bundled with it.
      'hidden_history_rows',
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
