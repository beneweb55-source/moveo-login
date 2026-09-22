/**
 * THE TASTE-PROFILE SCHEMA, pinned as source text and as vocabulary.
 *
 * WHY SOURCE TEXT AND NOT EXECUTED SQL. `TEST_DATABASE_URL` is unset in this
 * environment, so a test that applied these statements would report SKIPPED, and
 * a skipped test is not evidence. The statements are exported as DATA precisely
 * so that what can be checked without a server is checked — that the migration
 * cannot destroy a row, that it is safe to run twice, and that the constraints on
 * the two things that carry identity say what they are supposed to say.
 *
 * WHAT THIS FILE CANNOT PROVE, stated rather than glossed: it does not prove
 * PostgreSQL ACCEPTS these statements. A syntax error, or a constraint PostgreSQL
 * evaluates differently from the way it reads, would pass every test below. The
 * dry run against the real database is what would catch that, and it has not been
 * run — the tables are not applied, because nothing reads them until the
 * recompute path exists.
 *
 * THE ONE PROPERTY WORTH THE WHOLE FILE is the owner-key suite: the key is the
 * only thing standing between two people's profiles, and it exists in two places
 * — as a type in `lib/historyOwnership.ts` and as a CHECK constraint in the
 * migration. If those two drift, nothing fails, nothing logs, and a profile is
 * written under a key that no read path will ever match. So the two are tested
 * against each other, here, from the constants rather than from the literals.
 */

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';

import {
  CREATED_TABLES,
  CREATE_TASTE_PROFILES,
  CREATE_TASTE_TERMS,
  CREATE_TITLE_FEATURES,
  MIGRATION,
  NEW_ROWS_QUERY,
  OLD_ROWS_QUERY,
  rollbackStatements,
} from '../scripts/migrate-taste-profile';
import {
  GUEST_PREFIX,
  USER_PREFIX,
  guestOwnerKey,
  parseOwnerKey,
  userOwnerKey,
} from '../lib/historyOwnership';

const migrationSource = readFileSync(
  path.join(process.cwd(), 'scripts', 'migrate-taste-profile.ts'),
  'utf8',
);

const sqlOf = (statements: ReadonlyArray<{sql: string}>): string =>
  statements.map((statement) => statement.sql).join('\n');

describe('the migration is additive, and cannot destroy a row', () => {
  it('contains no statement that destroys or rewrites anything', () => {
    // The only statements this migration makes are CREATE TABLEs. A DROP,
    // TRUNCATE, `DELETE FROM` or `UPDATE … SET` would be a change to existing
    // rows, and the contract here is "creates three tables and touches none".
    //
    // `ON DELETE CASCADE` is excluded, and it is not an oversight: it is a
    // REFERENTIAL ACTION on a foreign key — it says what happens to a term row
    // when its PROFILE row is deleted, at some future point and by someone else's
    // statement. It deletes nothing here, and it is what makes the sign-in merge
    // and any future "delete my data" path correct.
    for (const statement of MIGRATION) {
      const body = statement.sql.replace(/ON DELETE CASCADE/gi, '').toUpperCase();
      assert.doesNotMatch(
        body,
        /\b(DROP|TRUNCATE)\b|\bDELETE\s+FROM\b|\bUPDATE\s+\w+\s+SET\b/,
        `${statement.label} must not destroy or rewrite a row`,
      );
    }
  });

  it('does not touch the history tables at all, not even to read them', () => {
    // A migration that SELECTed from the history could not corrupt it, so this is
    // stricter than safety requires — and it is the honest reading of the
    // contract: the profile is derived from the history by the recompute job, and
    // a migration that also read it would be a second, hidden place where the
    // history is interpreted.
    for (const statement of MIGRATION) {
      assert.doesNotMatch(
        statement.sql,
        /watch_history|anonymous_watch_history|user_list/,
        `${statement.label} must not reach into the history tables`,
      );
    }
  });

  it('is idempotent: every statement can be run twice', () => {
    for (const statement of MIGRATION) {
      assert.match(
        statement.sql,
        /IF NOT EXISTS/,
        `${statement.label} must be safe to run on a database that already has it`,
      );
    }
  });

  it('declares the count contract for both sides of the run', () => {
    // §15. This migration's contract is EQUALITY, not non-decrease: it creates
    // tables and changes nothing, so a minute or a row that moved is a defect and
    // not a rounding difference.
    assert.match(migrationSource, /const mustBeEqual = \[/);
    assert.match(migrationSource, /Number\(afterRow\[k\]\) !== Number\(beforeRow\[k\]\)/);

    // THE LABEL, pinned because the first draft got it wrong and the dry run is
    // what caught it: the query summed `watch_history` alone while calling the
    // result `total_minutes`, which reads 7757 on the real database against a
    // site-wide 43010 — the remainder is in `anonymous_watch_history`. §3 forbids
    // a displayed figure that is not the real one, and a name wider than its query
    // tells the reader something untrue without printing a wrong number at all.
    //
    // Asserted on the QUERIES and not on the file: the comment above them names
    // the old label deliberately, to explain the defect, and a pin that fires on
    // the documentation of a fix is a pin that gets deleted.
    assert.match(OLD_ROWS_QUERY, /AS signedin_minutes/);
    assert.match(OLD_ROWS_QUERY, /AS anon_minutes/);
    assert.match(NEW_ROWS_QUERY, /AS signedin_minutes/);
    assert.match(NEW_ROWS_QUERY, /AS anon_minutes/);
    assert.doesNotMatch(OLD_ROWS_QUERY, /total_minutes/);
    assert.doesNotMatch(NEW_ROWS_QUERY, /total_minutes/);
    // And the equality list has to name the columns the queries actually return,
    // or the contract check would compare two undefineds and pass forever.
    for (const column of ['signedin_minutes', 'anon_minutes']) {
      assert.match(migrationSource, new RegExp(`'${column}'`));
    }
    for (const query of [OLD_ROWS_QUERY, NEW_ROWS_QUERY]) {
      assert.match(query, /watch_history/);
      assert.match(query, /anonymous_watch_history/);
    }
    // The figures the plan is meant to show the operator, and the size of the
    // metadata job that follows it.
    assert.match(NEW_ROWS_QUERY, /distinct_titles_in_history/);
    assert.match(NEW_ROWS_QUERY, /title_features/);
  });

  it('keeps the production guard and the import-safe CLI', () => {
    // The flag and the host marker are the difference between a dry run and a
    // write to the live database. Asserted because a guard that is silently
    // dropped is worse than no guard: it is a guard a reader would assume.
    assert.match(migrationSource, /--i-know-this-is-production/);
    assert.match(migrationSource, /neon\.tech/);
    assert.match(migrationSource, /if \(apply && requiresProductionConfirmation\(dbUrl\)/);
    // Importing the file must not read the environment or open a connection:
    // the test above imports it for its statements.
    assert.match(migrationSource, /dotenv\.config\(\{ path: '\.env\.local' \}\)/);
    assert.match(
      migrationSource,
      /if \(process\.argv\[1\] && \/migrate-taste-profile\/\.test\(process\.argv\[1\]\)\)/,
    );
  });
});

describe('the terms table is shaped by how it is read', () => {
  const termsSql = sqlOf(CREATE_TASTE_TERMS);

  it('keys a term by owner, type and id, so a recompute is an upsert', () => {
    assert.match(termsSql, /PRIMARY KEY \(owner_key, term_type, term_id\)/);
  });

  it('deletes a profile\'s terms with the profile, and only with it', () => {
    assert.match(termsSql, /REFERENCES taste_profiles\(owner_key\) ON DELETE CASCADE/);
  });

  it('permits a NEGATIVE weight, because an abandon is a real signal', () => {
    // A `CHECK (weight >= 0)` here would look defensive and would silently delete
    // the "contenus abandonnés très vite" signal: the penalty reaches the profile
    // as a negative weight, and clamping it at the storage layer would make an
    // abandoned title weigh the same as one never opened.
    const withoutCascade = termsSql.replace(/ON DELETE CASCADE/gi, '');
    assert.doesNotMatch(withoutCascade, /weight\s*>=\s*0/);
    assert.doesNotMatch(withoutCascade, /CHECK[^)]*weight/i);
  });

  it('restricts a term type to the two kinds that exist', () => {
    assert.match(termsSql, /term_type IN \('genre', 'language'\)/);
  });

  it('adds no index, because the primary key already serves the read', () => {
    // The episodes migration needed an index: its primary key was a surrogate
    // SERIAL and its lookups were by user. Here the primary key LEADS with
    // owner_key, so a lookup by owner is served by the key itself, and a second
    // index would be the same structure written twice and paid for on every
    // insert.
    assert.doesNotMatch(migrationSource, /CREATE INDEX/);
  });
});

describe('the features cache describes a TMDB title and nothing else', () => {
  it('keys on the title, and stores its genres as a list', () => {
    const featuresSql = sqlOf(CREATE_TITLE_FEATURES);
    assert.match(featuresSql, /PRIMARY KEY \(media_type, media_id\)/);
    assert.match(featuresSql, /genre_ids\s+INTEGER\[\]/);
    assert.match(featuresSql, /fetched_at/);
  });

  it('allows only the two media types TMDB can return', () => {
    // NOT a copy of the history's rule. `watch_history` legitimately holds
    // `admin_adjustment` rows and the stats route excludes them by a constant; a
    // features row describes a title, so a third value is a mistake and must fail
    // at the write rather than produce a row that silently matches nothing.
    const featuresSql = sqlOf(CREATE_TITLE_FEATURES);
    assert.match(featuresSql, /CHECK \(media_type IN \('movie', 'tv'\)\)/);
    assert.doesNotMatch(featuresSql, /admin_adjustment/);
  });

  it('leaves the language nullable rather than defaulting it', () => {
    // A missing original language is a title we know less about. Defaulting it to
    // 'en' would attribute a whole catalogue of metadata-poor titles to English,
    // which is an invented signal.
    assert.match(sqlOf(CREATE_TITLE_FEATURES), /original_language\s+VARCHAR\(10\)(?!\s+NOT NULL)/);
  });
});

describe('the owner key means THE SAME THING in the schema as in the code', () => {
  const profilesSql = sqlOf(CREATE_TASTE_PROFILES);

  it('builds its constraint from the shared prefix constants, not from literals', () => {
    // THE DRIFT TEST. If someone edits `GUEST_PREFIX` in lib/historyOwnership.ts
    // and does not edit this migration, the schema starts accepting a key
    // vocabulary the application no longer produces — and every profile written
    // afterwards is invisible to the read path, silently, with no error anywhere.
    // Comparing against the imported constant is what makes that a failing test.
    assert.equal(GUEST_PREFIX, 'guest:');
    assert.equal(USER_PREFIX, 'user:');
    assert.ok(
      profilesSql.includes(`LIKE '${GUEST_PREFIX}%'`),
      'the guest prefix in the schema must be the constant the code uses',
    );
    assert.ok(
      profilesSql.includes(`LIKE '${USER_PREFIX}%'`),
      'the user prefix in the schema must be the constant the code uses',
    );
  });

  it('rejects every key form the parser rejects', () => {
    // THE CORRESPONDENCE, and it was measured rather than assumed. These five are
    // the forms `parseOwnerKey` returns null for; each has a clause in the
    // constraint that rejects it too. The parser is checked by EXECUTION and the
    // schema by TEXT, which is the strongest pairing available without a server —
    // and it is honest about which half is which.
    const rejected = ['guest:', 'user:', 'guest: guest', 'u:12', 'guest:guest:x'];
    for (const key of rejected) {
      assert.equal(parseOwnerKey(key), null, `${JSON.stringify(key)} must be rejected by the parser`);
    }

    // A bare prefix has no owner id: `length(...) > prefix.length`.
    assert.ok(profilesSql.includes(`length(owner_key) > ${GUEST_PREFIX.length}`));
    assert.ok(profilesSql.includes(`length(owner_key) > ${USER_PREFIX.length}`));
    // A nested prefix is what a merge bug produces when one key is built from
    // another, and it is a key no read path will ever match.
    assert.ok(profilesSql.includes(`owner_key NOT LIKE '${GUEST_PREFIX}%:%'`));
    assert.ok(profilesSql.includes(`owner_key NOT LIKE '${USER_PREFIX}%:%'`));
  });

  it('accepts every key the shared vocabulary produces', () => {
    // The other direction, so the constraint is not so strict that it refuses a
    // legitimate viewer. Both forms are built by the shared helpers — the same
    // ones the history already files a guest's rows under — and both parse back
    // to the owner they name, which is the round-trip invariant the whole
    // ownership module is built on.
    const guestKey = guestOwnerKey('anon_1734567890_abcdef');
    const userKey = userOwnerKey(42);

    assert.equal(parseOwnerKey(guestKey)?.kind, 'guest');
    assert.equal(parseOwnerKey(userKey)?.kind, 'user');
    assert.ok(guestKey.startsWith(GUEST_PREFIX) && guestKey.length > GUEST_PREFIX.length);
    assert.ok(userKey.startsWith(USER_PREFIX) && userKey.length > USER_PREFIX.length);
    assert.ok(!guestKey.slice(GUEST_PREFIX.length).includes(':'), 'a device id carries no colon');
    assert.ok(!userKey.slice(USER_PREFIX.length).includes(':'), 'a user id carries no colon');
  });

  it('keeps the profile countable, so a read can say how much it read', () => {
    // `title_count` and `unknown_title_count` are stored, and they are what the
    // read path uses to decide whether it may show a score at all. Without them
    // the caller would have to re-read the history to know whether the profile it
    // is holding was built from forty titles or from two.
    assert.match(profilesSql, /title_count\s+INTEGER NOT NULL DEFAULT 0/);
    assert.match(profilesSql, /unknown_title_count\s+INTEGER NOT NULL DEFAULT 0/);
    assert.match(profilesSql, /signal_weight\s+DOUBLE PRECISION NOT NULL DEFAULT 0/);
    assert.match(profilesSql, /computed_at/);
  });
});

describe('the rollback restores the prior state exactly', () => {
  it('drops exactly the three tables it created, child first', () => {
    const plan = rollbackStatements();
    assert.deepEqual(
      plan.map((statement) => statement.label),
      CREATED_TABLES.map((table) => `drop ${table}`),
    );
    // `taste_terms` first, because it holds the foreign key: dropping the parent
    // first would leave the child pointing at a table that is gone.
    assert.equal(CREATED_TABLES[0], 'taste_terms');
    assert.ok(plan.every((statement) => /DROP TABLE IF EXISTS/.test(statement.sql)));
  });

  it('drops unconditionally, because everything it drops is derived', () => {
    // This is where the file deliberately differs from the episodes migration,
    // and the difference is a property of what the tables hold rather than a
    // shortcut: `title_features` is a cache of TMDB metadata and the two profile
    // tables are recomputed from the history, which this migration never touches.
    // Nothing here is the only copy of an observation, so nothing here needs the
    // NULL-column guard the episodes rollback carries.
    const plan = rollbackStatements();
    assert.equal(plan.length, CREATED_TABLES.length);
    assert.doesNotMatch(sqlOf(plan), /\bNULL\b/i, 'no column-emptiness guard is needed here');
  });
});
