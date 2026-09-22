/**
 * The write contract of POST /api/watch-time: what the guard accepts and rejects,
 * plus the identifier rule its SQL has to obey.
 *
 * Regression pinned here, measured against production on 2026-09-21:
 *
 *   POST https://www.moveo.blog/api/watch-time
 *   {"media_type":"movie","media_id":550,"minutes":0}
 *     -> 400 {"error":"Missing required fields"}
 *
 * `minutes: 0` is not a malformed request. It is exactly what historyManager
 * sends for a progression-only update — `minutes: 0, // Progression update only,
 * no time increment` — and `!minutes` is `!0` is `true`, so the guard rejected
 * every one of those calls. current_time, total_duration, season and episode were
 * therefore never persisted for logged-in users, and cross-device resume could
 * not exist. The same request with `minutes: 5` answered 401 instead, which is
 * what proved the guard (not the auth branch) was the thing rejecting it.
 *
 * The guard is asserted through the real handler rather than against a copy of
 * its logic. Every case in the first two suites returns BEFORE the auth check and
 * before any database access, so they need neither a cookie nor a database:
 *
 *   guard fails           -> 400
 *   guard passes, no auth -> 401   <- the "accepted" signal used below
 *
 * THE THIRD SUITE IS DIFFERENT, and it is here because the second regression on
 * this route needed a check that runs without a database. `current_time` is a
 * RESERVED word in PostgreSQL, so an unquoted mention of it is not an identifier
 * at all: in an INSERT column list it is a syntax error (`42601`), and in a
 * SELECT list it silently reads the SQL value function `CURRENT_TIME` — the
 * server's time of day — instead of the stored position. Both were measured on
 * PostgreSQL 18.4; `tests/watchHistoryConcurrency.test.ts` reproduces both
 * against a real server, and that suite is skipped when no database is
 * configured, which is exactly why the rule is ALSO pinned here as a source-level
 * assertion that runs everywhere.
 *
 * Run: node --import tsx --test tests/watchTime.test.ts
 */

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';

import {POST} from '../app/api/watch-time/route';

const ENDPOINT = 'http://localhost/api/watch-time';

/** POST a JSON body to the real handler and read back status + parsed body. */
const post = async (body: unknown): Promise<{status: number; body: any}> => {
  const res = await POST(
    new Request(ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
  return {status: res.status, body: await res.json()};
};

describe('POST /api/watch-time — a progression-only update is accepted', () => {
  it('accepts minutes: 0, the value the progress sync actually sends', async () => {
    // The regression. 400 here means progression is silently never saved — the
    // client would show a saved position on this device and lose it on the next,
    // with nothing in any log saying why.
    const {status, body} = await post({media_type: 'movie', media_id: 550, minutes: 0});

    assert.notEqual(status, 400, 'minutes: 0 was rejected as a malformed payload');
    assert.equal(status, 401, 'expected the guard to pass and the auth check to answer');
    assert.equal(body.error, 'Unauthorized');
  });

  it('accepts minutes: 0 together with the progression fields it accompanies', async () => {
    // The exact shape historyManager sends, including season 0 (TMDB specials)
    // and a position of 0 (the start of the video).
    const {status} = await post({
      media_type: 'tv',
      media_id: 1396,
      minutes: 0,
      title: 'Breaking Bad',
      poster_path: '/x.jpg',
      current_time: 0,
      total_duration: 2820,
      season: 0,
      episode: 1,
    });

    assert.equal(status, 401, 'a full progression update must clear the guard');
  });

  it('still accepts a real watch-time increment', async () => {
    // WatchTimer's path: it early-returns on `minutes <= 0`, so it always sends a
    // positive number. The fix must not have broken it.
    for (const minutes of [5, 1, 0.5, 90]) {
      const {status} = await post({media_type: 'movie', media_id: 550, minutes});
      assert.equal(status, 401, `minutes: ${minutes} should pass the guard`);
    }
  });

  it('still accepts a numeric string, because it did before', async () => {
    // "0" was accepted by the old truthiness guard and must remain accepted: this
    // fix removes the zero-rejection, not the tolerance for a numeric string.
    for (const minutes of ['0', '5', '12']) {
      const {status} = await post({media_type: 'movie', media_id: 550, minutes});
      assert.equal(status, 401, `minutes: "${minutes}" should pass the guard`);
    }
  });
});

describe('POST /api/watch-time — the guard still rejects malformed input', () => {
  it('rejects a body with no minutes at all', async () => {
    // The whole point of the guard has to survive the fix: absent is still a
    // missing field, it is just no longer indistinguishable from zero.
    const absent = await post({media_type: 'movie', media_id: 550});
    assert.equal(absent.status, 400);

    const explicitNull = await post('{"media_type":"movie","media_id":550,"minutes":null}');
    assert.equal(explicitNull.status, 400);
  });

  it('rejects values that are not a number of minutes', async () => {
    // NaN and Infinity cannot be expressed in JSON, so they are exercised through
    // the raw-body form below, which reaches the same check.
    const nonNumeric = await post('{"media_type":"movie","media_id":550,"minutes":"abc"}');
    assert.equal(nonNumeric.status, 400);

    for (const body of [
      '{"media_type":"movie","media_id":550,"minutes":""}',
      '{"media_type":"movie","media_id":550,"minutes":"   "}',
      '{"media_type":"movie","media_id":550,"minutes":{}}',
      '{"media_type":"movie","media_id":550,"minutes":[]}',
      '{"media_type":"movie","media_id":550,"minutes":true}',
    ]) {
      const {status} = await post(body);
      assert.equal(status, 400, `must be rejected: ${body}`);
    }
  });

  it('rejects a negative number of minutes', async () => {
    for (const minutes of [-1, -0.5, -90]) {
      const {status} = await post({media_type: 'movie', media_id: 550, minutes});
      assert.equal(status, 400, `minutes: ${minutes} must be rejected`);
    }
  });

  it('rejects a missing media_type or media_id', async () => {
    const noType = await post({media_id: 550, minutes: 0});
    assert.equal(noType.status, 400);

    const noId = await post({media_type: 'movie', minutes: 0});
    assert.equal(noId.status, 400);

    const emptyId = await post({media_type: 'movie', media_id: '', minutes: 0});
    assert.equal(emptyId.status, 400);
  });
});

// ---------------------------------------------------------------------------
// The identifier rule. See the file header for why this is a test at all.
// ---------------------------------------------------------------------------

/** Reads a repo file as text. `npm test` runs from the repository root. */
const source = (relative: string): string =>
  readFileSync(path.join(process.cwd(), relative), 'utf8');

/** Statements, extracted from template literals that look like SQL. */
const SQL_ISH = /\b(SELECT|INSERT\s+INTO|UPDATE|ALTER\s+TABLE)\b/;
const sqlStatements = (text: string): string[] =>
  (text.match(/`[^`]*`/g) ?? []).filter((literal) => SQL_ISH.test(literal));

/**
 * The defect this catches. Leading character must not be a quote (so it is
 * unquoted) and the identifier must not be followed by an identifier character
 * (so the SQL value function `CURRENT_TIMESTAMP`, which merely starts with these
 * letters, is not a false positive).
 */
const UNQUOTED_CURRENT_TIME = /(^|[^"\w])current_time(?![A-Za-z0-9_])/;

describe('the SQL names `current_time` as a quoted identifier', () => {
  for (const relative of ['lib/watchHistoryWrite.ts', 'app/api/watch-time/route.ts']) {
    it(`quotes it in every statement in ${relative}`, () => {
      const statements = sqlStatements(source(relative));
      // If this fails the scan is broken, not the file — and a scan that silently
      // found nothing would let the rule pass while proving nothing.
      assert.ok(statements.length > 0, `no SQL statements found in ${relative}`);

      const offenders = statements.filter((statement) =>
        UNQUOTED_CURRENT_TIME.test(statement),
      );
      assert.deepEqual(
        offenders,
        [],
        `${relative} names current_time unquoted, which PostgreSQL reads as the ` +
          `CURRENT_TIME function rather than as the column:\n${offenders.join('\n')}`,
      );
    });
  }

  it('quotes the identifier the migration script interpolates', () => {
    // This one cannot be caught by the scan above: the column name is DATA in
    // this script, interpolated into the statement, so the SQL literal contains
    // `${col.name}` and never the word itself. Both halves are asserted instead —
    // that the interpolation is quoted, and that `current_time` is one of the
    // names interpolated through it.
    const migration = source('scripts/migrate-progression.ts');
    assert.match(
      migration,
      /ADD COLUMN IF NOT EXISTS "\$\{col\.name\}"/,
      'the migration must quote the column name it interpolates',
    );
    assert.match(migration, /name: 'current_time'/, 'current_time must be one of the columns');
  });

  it('the scan would catch the mistake it is there for', () => {
    // The counter-example, so this test cannot pass for the wrong reason: the
    // exact statements as they were shipped before the fix must be flagged.
    const before = [
      'SELECT current_time, total_duration FROM watch_history WHERE user_id = $1',
      'INSERT INTO watch_history (media_type, current_time) VALUES ($1, $2)',
      'DO UPDATE SET current_time = COALESCE($7, watch_history.current_time)',
    ];
    for (const statement of before) {
      assert.ok(
        UNQUOTED_CURRENT_TIME.test(statement),
        `the scan must flag: ${statement}`,
      );
    }
    // And must NOT flag the fixed form, nor the SQL value function.
    for (const statement of [
      'SELECT "current_time" FROM watch_history',
      'DO UPDATE SET "current_time" = COALESCE($7, watch_history."current_time")',
      'VALUES ($1, CURRENT_TIMESTAMP)',
    ]) {
      assert.ok(
        !UNQUOTED_CURRENT_TIME.test(statement),
        `the scan must not flag: ${statement}`,
      );
    }
  });
});
