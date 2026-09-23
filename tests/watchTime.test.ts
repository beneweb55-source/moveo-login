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

describe('POST /api/watch-time — media_type is an allowlist, not a label', () => {
  const ACCEPTED = ['movie', 'tv'];

  it('refuses the row type the admin adjustment reserves', async () => {
    // ROW IDENTITY, which is what makes this a security bound and not a
    // formatting preference. `watch_history` is UNIQUE(user_id, media_type,
    // media_id), so `media_type` selects WHICH row is written — and one value in
    // that space is reserved: `admin_adjustment`, which
    // /api/admin/watch-time writes at (user_id, 'admin_adjustment', 0) to carry
    // an admin's manual correction to someone's total.
    //
    // Because POST accepted any string, the corrected viewer could write that
    // row themselves: the route's ON CONFLICT adds `+ $4`, and 5000 minutes in a
    // single request is well inside the payload guard. The number is then summed
    // with no exclusion on this row type by auth/me and profile/stats (the
    // viewer's own total), by admin/users and admin/online (the figure an admin
    // reads while moderating), and by admin/stats (the dashboard's global watch
    // time). The viewer would not see their own doing, either: the GET excludes
    // `admin_adjustment` by name, so the row never appears in the history they
    // look at. The admin's numbers move and nothing on the viewer's screen says
    // so.
    //
    // `media_id: '0'` — the STRING — and this is the detail that makes the case
    // real rather than theoretical. The numeric `0` never gets this far:
    // `!media_id` is `!0` is `true`, so the presence guard answers 400
    // "Missing required fields" and the reserved row looks unreachable. `'0'` is
    // a non-empty string, so it clears that guard, and PostgreSQL casts it to the
    // same `0` in the `media_id INTEGER` column. Asserted below so the two paths
    // are visibly different and the exploit shape is the one that is tested.
    const viaString = await post({
      media_type: 'admin_adjustment',
      media_id: '0',
      minutes: 5000,
    });
    assert.equal(viaString.status, 400, 'the reserved row type must not be writable');
    assert.equal(
      viaString.body.error,
      'Invalid media_type',
      'the allowlist is what refuses it — the presence guard does not',
    );

    // The same request with the NUMERIC zero, kept as the contrast: it is
    // refused one guard earlier, for a different reason, which is exactly why
    // the allowlist cannot be reasoned about from this case alone.
    const viaNumber = await post({
      media_type: 'admin_adjustment',
      media_id: 0,
      minutes: 5000,
    });
    assert.equal(viaNumber.status, 400);
    assert.equal(viaNumber.body.error, 'Missing required fields');
  });

  it('accepts exactly the two values the client can send, and nothing else', async () => {
    // The accept side first, so a guard that rejected everything would fail here
    // rather than pass by refusing all of the cases below.
    for (const media_type of ACCEPTED) {
      const {status} = await post({media_type, media_id: 550, minutes: 0});
      assert.equal(status, 401, `${media_type} must still clear the guard`);
    }

    // Near misses are the point: a guard written with a normalising step — trim,
    // toLowerCase, startsWith — would pass several of these, and every one of
    // them is a distinct string to PostgreSQL and therefore a distinct row.
    for (const media_type of [
      'admin_adjustment',
      'ADMIN_ADJUSTMENT',
      'Admin_Adjustment',
      'admin_adjustment ',
      ' admin_adjustment',
      'admin_adjustment\t',
      'admin_adjustment\n',
      'admin_adjustments',
      'adminadjustment',
      'Movie',
      'MOVIE',
      'movie ',
      ' movie',
      'movies',
      'TV',
      'Tv',
      'tv ',
      'series',
      'episode',
      'anime',
      ' ',
      'movie,tv',
      'movie|tv',
      '__proto__',
      'constructor',
    ]) {
      const {status} = await post({media_type, media_id: 550, minutes: 0});
      assert.equal(
        status,
        400,
        `media_type ${JSON.stringify(media_type)} must be refused, not stored as its own row`,
      );
    }
  });

  it('refuses a media_type that is not a string at all', async () => {
    // `!==` and not `!=`, and this case is why. A single-element array coerces to
    // its element under loose comparison — `['movie'] != 'movie'` is FALSE — so a
    // guard written with `!=` would have accepted `{"media_type":["movie"]}` and
    // handed an array to the driver as a text parameter. Strict comparison is
    // load-bearing here rather than stylistic.
    //
    // The operands are typed `unknown` because that is what the guard actually
    // receives from `JSON.parse`, and because the comparison is the subject: left
    // as literals, TypeScript rejects `string[] != string` as a comparison between
    // types with no overlap — a fair complaint about exactly the mistake being
    // demonstrated, which is why the values have to arrive as unknowns.
    const arrayValue: unknown = ['movie'];
    const stringValue: unknown = 'movie';
    assert.equal(arrayValue != stringValue, false, 'the loose comparison this avoids');
    assert.equal(arrayValue !== stringValue, true, 'the strict comparison in use');

    for (const body of [
      '{"media_type":["movie"],"media_id":550,"minutes":0}',
      '{"media_type":["admin_adjustment"],"media_id":0,"minutes":5000}',
      '{"media_type":{"x":"movie"},"media_id":550,"minutes":0}',
      '{"media_type":true,"media_id":550,"minutes":0}',
      '{"media_type":550,"media_id":550,"minutes":0}',
      '{"media_type":null,"media_id":550,"minutes":0}',
    ]) {
      const {status} = await post(body);
      assert.equal(status, 400, `must be refused: ${body}`);
    }
  });

  /**
   * The two halves of this route validate the same set, and that is asserted at
   * source because neither can see the other. DELETE has checked exactly
   * `movie`/`tv` since it was written; POST trusted the caller. A future edit
   * that relaxes one of them — or that adds a third accepted type to one side
   * only — reopens the asymmetry from the direction that matters, and no runtime
   * case in this file would notice, because each handler is tested on its own.
   */
  describe('the write path and the delete path agree on that set', () => {
    const ALLOWLIST = "media_type !== 'movie' && media_type !== 'tv'";

    /** One handler's body, from its declaration to the next one. */
    const bodyOf = (text: string, name: string): string => {
      const start = text.indexOf(`export async function ${name}(`);
      assert.notEqual(start, -1, `${name} not found — this scan needs updating`);
      const next = text.indexOf('export async function', start + 1);
      return text.slice(start, next === -1 ? undefined : next);
    };

    it('checks the identical condition in POST and in DELETE', () => {
      const route = source('app/api/watch-time/route.ts');
      for (const handler of ['POST', 'DELETE']) {
        assert.match(
          bodyOf(route, handler),
          /media_type !== 'movie' && media_type !== 'tv'/,
          `${handler} must accept exactly the two types the client can send`,
        );
      }
    });

    it('checks it BEFORE the write, not after it', () => {
      // Order is the whole point: a validation that runs after the statement has
      // already decided whether the reserved row is writable. This is the
      // "the endpoint protects the action" rule applied inside the handler.
      const post = bodyOf(source('app/api/watch-time/route.ts'), 'POST');
      const guard = post.indexOf(ALLOWLIST);
      const write = post.indexOf('writeSignedInProgress(');
      const anonWrite = post.indexOf('INSERT INTO anonymous_watch_history');

      assert.notEqual(guard, -1, 'the allowlist is missing from POST');
      assert.notEqual(write, -1, 'the signed-in write is missing from POST — update this scan');
      assert.ok(guard < write, 'the allowlist must precede the signed-in write');
      assert.ok(
        anonWrite === -1 || guard < anonWrite,
        'the allowlist must precede the anonymous write too — it is the same column, and ' +
          'admin/stats sums anonymous_watch_history with no exclusion either',
      );
    });

    it('the scan would catch the mistake it is there for', () => {
      // The counter-example, so this cannot pass for the wrong reason: the fixed
      // form must be recognised, and the form it replaces — presence only — must
      // not satisfy the same scan.
      const fixed = "if (media_type !== 'movie' && media_type !== 'tv') {";
      assert.notEqual(
        fixed.match(/media_type !== 'movie' && media_type !== 'tv'/),
        null,
        'the scan must recognise the fixed form',
      );
      assert.equal(
        "if (!media_type || !media_id) {".match(
          /media_type !== 'movie' && media_type !== 'tv'/,
        ),
        null,
        'the scan must not pass a handler that only checks for presence',
      );
    });
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

// ---------------------------------------------------------------------------
// The read path's half: a row the viewer owns must not be dropped for being
// unnamed. See the note at the GET in app/api/watch-time/route.ts.
// ---------------------------------------------------------------------------

/**
 * The regression these pin, measured by introspection on the live database on
 * 2026-09-23:
 *
 *     watch_history   108 rows
 *                     count(*) FILTER (WHERE title IS NOT NULL) -> 1
 *                     count(*) FILTER (WHERE title IS NULL)     -> 107
 *                     count("current_time")                     -> 0
 *
 * The GET carried `AND title IS NOT NULL`, so it could return 1 row of 108 and
 * the other 107 — 6715 minutes of the viewers' own viewing, summed into every
 * total the dashboard shows — were unreachable from every surface. That is §8's
 * failure shape from the read side: a displayed absence, read as an absence of
 * the thing. The rows are title-less because the writer that always carries a
 * `session_id` (components/WatchTimer.tsx, the only one this route can attribute
 * for an unverifiable session) was mounted without a title, not because they are
 * junk and not because they belong to anyone else.
 *
 * WHY A SOURCE SCAN AND NOT A HANDLER CALL. `GET` cannot be invoked without a
 * verified `auth_token` cookie, so the only two outcomes reachable from a test
 * are "no session -> 200 {progress: []}" and "no database -> 500". Neither one
 * exercises the WHERE clause, and a test that could not fail for the right
 * reason would pass here whatever the SQL said. The rule is therefore pinned at
 * the source, the way the `current_time` quoting rule above is pinned — and, as
 * there, with the counter-example that proves the scan is not vacuous.
 */
describe('GET /api/watch-time — it returns the rows the viewer owns', () => {
  const route = source('app/api/watch-time/route.ts');

  /** The GET handler's body, from its declaration to the next export. */
  const getHandler = (): string => {
    const start = route.indexOf('export async function GET(');
    assert.notEqual(start, -1, 'GET not found — this scan needs updating');
    const next = route.indexOf('export async function', start + 1);
    return route.slice(start, next === -1 ? undefined : next);
  };

  /** Statements from the GET body that look like SQL. */
  const getStatements = (): string[] => sqlStatements(getHandler());

  const TITLE_FILTER = /title\s+IS\s+NOT\s+NULL/i;

  it('does not require a title, which 107 of the 108 live rows do not have', () => {
    const statements = getStatements();
    // If this fails the scan is broken, not the file.
    assert.ok(statements.length > 0, 'no SQL statements found in GET');

    const offenders = statements.filter((statement) => TITLE_FILTER.test(statement));
    assert.deepEqual(
      offenders,
      [],
      'GET requires a non-null title again, so every row written by a mount ' +
        'site that passed no title becomes invisible — measured at 107 of 108 ' +
        `rows on the live database:\n${offenders.join('\n')}`,
    );
  });

  it('still scopes the read to the caller and still excludes the reserved row type', () => {
    // The other half, asserted so "the filter was removed" cannot be read as
    // "the WHERE clause was removed". This is the §23 bound and the
    // admin_adjustment exclusion, and neither is negotiable.
    const select = getStatements().find((statement) =>
      /FROM\s+watch_history/i.test(statement),
    );
    assert.ok(select, 'the history SELECT is missing from GET — update this scan');

    assert.match(
      select,
      /user_id\s*=\s*\$1/,
      'the read must be scoped by the parameter the verified token fills, or one ' +
        'account could read another account history (§23)',
    );
    assert.match(
      select,
      /media_type\s+NOT\s+IN\s*\(\s*'admin_adjustment'\s*\)/,
      'the GET must keep excluding the row type /api/admin/watch-time writes',
    );
  });

  it('the scan would catch the filter it is there for', () => {
    // The counter-example, so this cannot pass for the wrong reason: the exact
    // statement as it was shipped before the fix must be flagged, and the fixed
    // form must not be.
    assert.ok(
      TITLE_FILTER.test(
        `SELECT media_type, media_id FROM watch_history
          WHERE user_id = $1
            AND media_type NOT IN ('admin_adjustment')
            AND title IS NOT NULL
          ORDER BY last_updated DESC
          LIMIT 20`,
      ),
      'the scan must flag the pre-fix statement',
    );
    for (const fixed of [
      `SELECT title FROM watch_history WHERE user_id = $1 AND media_type NOT IN ('admin_adjustment')`,
      'SELECT title FROM watch_history WHERE user_id = $1',
    ]) {
      assert.ok(!TITLE_FILTER.test(fixed), `the scan must not flag: ${fixed}`);
    }
  });
});
