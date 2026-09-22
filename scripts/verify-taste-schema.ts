/**
 * The EXECUTED half of the taste-schema contract, run against a real server.
 *
 * WHY THIS IS A SCRIPT AND NOT A TEST. `tests/tasteProfileSchema.test.ts` pins the
 * owner-key constraint as source text and says so in its header, because
 * `TEST_DATABASE_URL` is unset: a test that needed a server would report SKIPPED,
 * and §8 is explicit that a skipped test is not evidence. This script is the
 * answer to that gap, and the gap was not hypothetical — the first version of the
 * constraint passed every text assertion in that test and was then found, HERE,
 * to accept `'guest: guest'`, a key `parseOwnerKey` refuses. That is the whole
 * argument for this file's existence: the test checked that the SQL CONTAINED the
 * clauses; only execution checks that the clauses BITE.
 *
 * WHAT IT PROVES, precisely:
 *   1. The constraint name is present on `taste_profiles` (introspected from
 *      `pg_constraint`, not assumed from the migration having exited 0).
 *   2. For a fixture list of owner keys, the verdict PostgreSQL returns and the
 *      verdict `parseOwnerKey` returns agree in the direction that matters: the
 *      schema must NEVER accept a key the parser refuses. That is §23's
 *      requirement — a profile under a key no read path matches is a profile
 *      written and never seen, silently.
 *   3. A key the parser accepts but the schema refuses is reported as NARROWER,
 *      and that is allowed: the schema is a floor, not a translation.
 *   4. A negative term weight is STORED, not clamped — the "contenus abandonnés
 *      très vite" signal arrives as a negative number, and a `CHECK (weight >= 0)`
 *      would delete it without an error.
 *   5. A term does not outlive its profile (`ON DELETE CASCADE`), which is the
 *      structural half of the sign-in merge.
 *
 * NOTHING PERSISTS. Every statement runs inside one transaction, rolled back at
 * the end, and the script re-counts `taste_profiles` afterwards to say so with a
 * number rather than a promise.
 *
 * Run:
 *   npx tsx scripts/verify-taste-schema.ts
 *
 * Exit codes: 0 = all checks executed and passed. 1 = a check FAILED. 2 = no
 * database configured, reported as SKIPPED — which is NOT a pass.
 */
import { Pool, type PoolClient } from 'pg';
import dotenv from 'dotenv';

import { parseOwnerKey } from '../lib/historyOwnership';

/** A device id of the shape `getDeviceId` produces. */
const GUEST_ACCEPT_ID = 'anon_1734567890_abcdef';

/**
 * The fixture list. Every entry is a key we might one day hand the database, or
 * one a bug might produce. The whitespace forms are FIRST-CLASS here: they are the
 * exact shapes the first constraint missed.
 */
const KEYS: ReadonlyArray<{ key: string; why: string }> = [
  { key: `guest:${GUEST_ACCEPT_ID}`, why: 'what getDeviceId produces' },
  { key: 'guest:anon_1', why: 'a short device id' },
  { key: 'user:42', why: 'a numeric users.id' },
  { key: 'guest:', why: 'a prefix with no owner' },
  { key: 'user:', why: 'a prefix with no owner' },
  { key: 'guest: guest', why: 'A SPACE — the form the first constraint accepted' },
  { key: 'guest:ano n', why: 'an interior space' },
  { key: 'user:12 ', why: 'a trailing space' },
  { key: 'guest:\t7', why: 'a tab' },
  { key: 'guest:guest:x', why: 'a nested key, which is what a merge bug produces' },
  { key: 'user:1:2', why: 'a second colon on the user side' },
  { key: 'u:12', why: 'a prefix this module never writes' },
  { key: 'GUEST:1', why: 'the wrong case' },
  { key: 'guest', why: 'no separator at all' },
  { key: 'guest:1%', why: 'a LIKE metacharacter' },
  { key: '', why: 'the empty key' },
];

interface Verdict {
  key: string;
  parser: 'accepts' | 'refuses';
  database: 'accepts' | 'refuses';
  verdict: 'AGREE' | 'NARROWER (allowed)' | 'TOO PERMISSIVE (FAIL)';
  note: string;
  why: string;
}

async function insertOwnerKey(
  client: PoolClient,
  key: string,
): Promise<{ ok: boolean; note: string }> {
  try {
    await client.query('SAVEPOINT probe');
    await client.query('INSERT INTO taste_profiles (owner_key) VALUES ($1)', [key]);
    await client.query('RELEASE SAVEPOINT probe');
    return { ok: true, note: 'accepted' };
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT probe');
    const code = (error as { code?: string }).code ?? '?';
    // 23514 = check_violation. Anything else is a different problem wearing the
    // same word "rejected", and the operator should see which.
    return { ok: false, note: code === '23514' ? 'refused by the CHECK' : `refused ${code}` };
  }
}

async function main() {
  // Loaded inside main so that importing this file has no side effect.
  dotenv.config({ path: '.env.local' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    // §8: say SKIPPED, and say what it means. Silence here would read as a pass.
    console.log('SKIPPED: DATABASE_URL is not set, so nothing was executed.');
    console.log('A skipped check is not evidence — re-run where a database is configured.');
    process.exit(2);
  }

  const u = new URL(dbUrl);
  console.log(`target: ${u.hostname}${u.pathname}`);

  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  let failed = false;

  try {
    // 1. The constraint exists, by introspection rather than by trust.
    const constraint = await client.query<{ conname: string; definition: string }>(`
      SELECT conname, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'taste_profiles'::regclass
        AND contype = 'c'
        AND conname = 'taste_profiles_owner_key_check'
    `);
    if (constraint.rowCount === 0) {
      console.error('\nFAIL: taste_profiles carries no taste_profiles_owner_key_check constraint.');
      console.error('An unowned profile would be representable — §23 has no floor at all.');
      process.exit(1);
    }
    console.log(`constraint installed: ${constraint.rows[0].conname}`);
    console.log(`  ${constraint.rows[0].definition.replace(/\s+/g, ' ')}`);

    await client.query('BEGIN');

    // 2 & 3. The correspondence, both halves executed.
    const verdicts: Verdict[] = [];
    for (const { key, why } of KEYS) {
      const parserAccepts = parseOwnerKey(key) !== null;
      const dbResult = await insertOwnerKey(client, key);
      const parser: 'accepts' | 'refuses' = parserAccepts ? 'accepts' : 'refuses';
      const database: 'accepts' | 'refuses' = dbResult.ok ? 'accepts' : 'refuses';
      let verdict: Verdict['verdict'];
      if (parser === database) {
        verdict = 'AGREE';
      } else if (parser === 'accepts' && database === 'refuses') {
        verdict = 'NARROWER (allowed)';
      } else {
        verdict = 'TOO PERMISSIVE (FAIL)';
        failed = true;
      }
      verdicts.push({ key, parser, database, verdict, note: dbResult.note, why });
    }

    console.log('\n--- owner key: parseOwnerKey vs PostgreSQL, by EXECUTION ---');
    console.table(
      verdicts.map((v) => ({
        key: JSON.stringify(v.key),
        parser: v.parser,
        database: v.database,
        verdict: v.verdict,
      })),
    );
    for (const v of verdicts.filter((x) => x.verdict !== 'AGREE')) {
      console.log(`  ${v.verdict}: ${JSON.stringify(v.key)} — ${v.why} (${v.note})`);
    }

    // 4. A negative weight survives storage.
    await client.query('SAVEPOINT weight');
    await client.query(`INSERT INTO taste_profiles (owner_key) VALUES ('user:9999')`);
    await client.query(
      `INSERT INTO taste_terms (owner_key, term_type, term_id, weight)
       VALUES ('user:9999', 'genre', '35', -0.5)`,
    );
    const stored = await client.query<{ weight: number }>(
      `SELECT weight FROM taste_terms WHERE owner_key = 'user:9999' AND term_id = '35'`,
    );
    const weight = Number(stored.rows[0]?.weight);
    if (weight !== -0.5) {
      console.error(`\nFAIL: a negative weight came back as ${weight}.`);
      console.error('An abandoned title must weigh less than silence, not the same.');
      failed = true;
    } else {
      console.log(`\nnegative weight stored verbatim: ${weight}`);
    }

    // 5. A term does not outlive its profile.
    await client.query(`DELETE FROM taste_profiles WHERE owner_key = 'user:9999'`);
    const orphans = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM taste_terms WHERE owner_key = 'user:9999'`,
    );
    const left = Number(orphans.rows[0]?.n);
    if (left !== 0) {
      console.error(`\nFAIL: ${left} term(s) outlived their profile.`);
      console.error('The sign-in merge would leave the guest terms behind.');
      failed = true;
    } else {
      console.log('terms left behind after the profile was deleted: 0');
    }
    await client.query('ROLLBACK TO SAVEPOINT weight');
  } finally {
    // Nothing this script did survives it, and the count below is the receipt.
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();

    const after = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM taste_profiles`);
    console.log(`\nrows in taste_profiles after rollback: ${Number(after.rows[0]?.n)}`);
    await pool.end();
  }

  if (failed) {
    console.error('\nEXECUTED — FAILED. See the checks above.');
    process.exit(1);
  }
  console.log('\nEXECUTED — all checks passed against the real database.');
}

main().catch((error) => {
  console.error('verification failed:', error);
  process.exit(1);
});
