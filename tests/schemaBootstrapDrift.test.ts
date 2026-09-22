/**
 * A TABLE DECLARED TWICE IS A TABLE DECLARED BY WHICHEVER RAN FIRST.
 *
 * Several admin routes create their table lazily, on first request, with
 * `CREATE TABLE IF NOT EXISTS`. That is deliberate — it means a fresh database
 * works without an operator having run a migration. The trap is that PostgreSQL
 * treats the second definition as a silent no-op: no warning, no error, no log
 * line. So a runtime bootstrap that has drifted from the migration does not
 * merely disagree with it; on a database the route reached first, the route's
 * version IS the schema, and the migration's version is the one that never
 * applied.
 *
 * That happened four times in this codebase, and the four outcomes were not
 * equally loud:
 *
 *   - `content_settings` declared `setting_value TEXT` where the scripts declare
 *     JSONB. node-postgres parses a jsonb column and does not parse a text one,
 *     so the SAME request returned a string or an object depending on which
 *     definition won. Both consumers had a `typeof … === 'string' ? JSON.parse`
 *     branch, which is how it survived: absorbed twice instead of fixed once.
 *   - `reports` declared `content_type` / `content_id` / `reason VARCHAR(255)`
 *     where the scripts declare `reported_item_type` / `reported_item_id` /
 *     `reason TEXT`. A column that does not exist is a 500 on every read of the
 *     moderation queue.
 *   - `anonymous_watch_history` declared `media_type` and `media_id` NULLABLE,
 *     `TIMESTAMP` without a time zone, and — the one that breaks rather than
 *     merely misreports — NO `UNIQUE(session_id, media_type, media_id)`.
 *     `app/api/watch-time/route.ts` upserts guest viewing with
 *     `ON CONFLICT (session_id, media_type, media_id)`, and Postgres resolves
 *     that only against a real unique index. Without one it raises 42P10,
 *     "there is no unique or exclusion constraint matching the ON CONFLICT
 *     specification", so EVERY guest watch-time write failed — and only on the
 *     databases where an admin had opened the user list before a signed-out
 *     visitor first saved progress. Guest history did not lose a row; it could
 *     not write one, and nothing in the UI could say why.
 *
 * A column list is exactly the kind of thing a reviewer's eye slides over when
 * two of them are forty lines apart in different files. So it is compared
 * mechanically, and the comparison is structural: every runtime bootstrap is
 * discovered by scanning `app/`, and every one of them must be accounted for
 * here — either against the script that is the canonical definition, or in
 * ROUTE_ONLY with a reason. A new lazy `CREATE TABLE` fails this test until
 * someone decides which it is. That is the point: the decision is cheap here and
 * expensive in production.
 */

import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';

const readSource = (relative: string): string =>
  readFileSync(path.join(process.cwd(), ...relative.split('/')), 'utf8');

/**
 * The source with JavaScript comments stripped, for assertions about CODE.
 *
 * Needed because the fix for the leak below is documented in the file that had
 * it, and the documentation names the thing being ruled out — "the caller put
 * raw database text into a response, `error.message` and all" is precisely the
 * sentence a naive pin matches. A test that fails when someone explains the
 * defect is a test that gets deleted.
 *
 * SQL comments are `--`, so this does not touch the DDL template literals. The
 * `//` rule is anchored to the start of a line, so a URL inside a string is left
 * alone — only a line that OPENS with a comment marker is removed.
 */
const readCode = (relative: string): string =>
  readSource(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

/**
 * Every `CREATE TABLE IF NOT EXISTS <name>` reachable from a directory, as
 * `{table, file}`, walked recursively. This is how a NEW bootstrap enters the
 * test without anyone remembering to add it.
 */
const findBootstraps = (directory: string): Array<{table: string; file: string}> => {
  const found: Array<{table: string; file: string}> = [];
  for (const entry of readdirSync(path.join(process.cwd(), ...directory.split('/')), {withFileTypes: true})) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...findBootstraps(relative));
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    const source = readSource(relative);
    // A NUMBERED group, not a named one: `(?<name>…)` is an ES2018 syntax
    // feature and this project targets ES2017 — the same ceiling that rules out
    // regex lookbehind and the `/s` dotAll flag here. `lib` is `esnext`, so the
    // API surface is modern; the SYNTAX the compiler has to downlevel is not.
    for (const match of source.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)/g)) {
      found.push({table: match[1], file: relative});
    }
  }
  return found;
};

/** The text between a table's opening `(` and its matching `)`. */
const tableBody = (source: string, table: string): string => {
  const marker = new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\s*\\(`).exec(source);
  assert.ok(marker, `no CREATE TABLE IF NOT EXISTS for ${table}`);
  const open = source.indexOf('(', marker.index);
  let depth = 0;
  for (let index = open; index < source.length; index++) {
    if (source[index] === '(') depth++;
    else if (source[index] === ')') {
      depth--;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  throw new Error(`unterminated CREATE TABLE for ${table}`);
};

/** Split on the commas that separate columns, not the ones inside `f(a, b)`. */
const splitTopLevel = (body: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of body) {
    if (character === '(') depth++;
    if (character === ')') depth--;
    if (character === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  parts.push(current);
  return parts;
};

/**
 * The table's definition as comparable strings — one per column, constraint or
 * index — whitespace collapsed, comments dropped, ordered so that a pure
 * reordering is not reported as drift while a changed type, a changed
 * nullability, a changed default or a MISSING CONSTRAINT is.
 */
const definition = (source: string, table: string): string[] =>
  splitTopLevel(tableBody(source, table))
    .map((part) =>
      part
        .split('\n')
        .map((line) => line.replace(/--.*$/, '').trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean)
    .sort();

/** The migration a runtime bootstrap must agree with. */
const CANONICAL: Record<string, string[]> = {
  content_settings: [
    'scripts/init-new-db.ts',
    'scripts/run-migration.ts',
    'scripts/migrate-progression.ts',
  ],
  reports: ['scripts/init-new-db.ts', 'scripts/run-migration.ts'],
  anonymous_watch_history: ['scripts/migrate-progression.ts'],
};

/**
 * Bootstrapped at runtime with no script counterpart, on purpose. An entry here
 * is a statement that the route IS the only definition — so it cannot drift, and
 * no `CREATE TABLE IF NOT EXISTS` can silently win against it.
 */
const ROUTE_ONLY: Record<string, string> = {
  pinned_sections:
    'no migration declares it; the route seeds the default rows, and deleting the ' +
    'bootstrap would leave a fresh database with no table at all.',
};

/** Where each route's bootstrap lives, so the comparison can name the file. */
const ROUTE_SOURCE: Record<string, string> = {
  content_settings: 'app/api/admin/content/route.ts',
  reports: 'app/api/admin/reports/route.ts',
  anonymous_watch_history: 'app/api/admin/users/route.ts',
  pinned_sections: 'app/api/admin/sections/route.ts',
};

describe('every lazily-created table agrees with the migration that owns it', () => {
  const bootstraps = findBootstraps('app');

  it('finds the bootstraps it is meant to check', () => {
    // A guard on the guard: if the scan silently returned nothing — a changed
    // directory name, a regex that no longer matches — every assertion below
    // would pass vacuously and the test would look green while checking nothing.
    assert.ok(
      bootstraps.length >= 4,
      `expected at least 4 runtime bootstraps in app/, found ${bootstraps.length}`,
    );
    for (const {table} of bootstraps) {
      assert.ok(
        table in CANONICAL || table in ROUTE_ONLY,
        `${table} is created lazily at runtime but is in neither CANONICAL nor ROUTE_ONLY. ` +
          'Decide whether a script should own its definition, then put it in the right list.',
      );
    }
  });

  it('takes the route-only exemptions one at a time, with a written reason', () => {
    for (const [table, reason] of Object.entries(ROUTE_ONLY)) {
      assert.ok(reason.length > 40, `${table} needs a real reason, not a placeholder`);
      assert.ok(
        bootstraps.some((bootstrap) => bootstrap.table === table),
        `${table} is exempted but is no longer created anywhere — drop the exemption`,
      );
      assert.ok(!(table in CANONICAL), `${table} cannot be both script-owned and route-only`);
    }
  });

  for (const [table, scripts] of Object.entries(CANONICAL)) {
    it(`declares ${table} exactly as the scripts declare it`, () => {
      const route = ROUTE_SOURCE[table];
      assert.ok(route, `${table} needs a ROUTE_SOURCE entry`);
      const fromRoute = definition(readSource(route), table);
      assert.ok(
        fromRoute.length > 1,
        `${table} parsed as ${fromRoute.length} part(s) — suspect the parser, not the schema`,
      );

      for (const script of scripts) {
        assert.deepEqual(
          fromRoute,
          definition(readSource(script), table),
          `${route} and ${script} disagree about ${table}. The first definition to run ` +
            'wins and the other is a silent no-op, so this is not a cosmetic mismatch — ' +
            'it is a schema that depends on request ordering.',
        );
      }
    });
  }

  it('keeps the unique key the guest upsert resolves ON CONFLICT against', () => {
    // The causal link, spelled out, because this is the failure that stays
    // invisible until someone signs out: 42P10 on every guest watch-time write.
    // `ON CONFLICT (a, b, c)` needs a matching unique index or constraint — it
    // cannot infer one, and it does not fall back to a plain insert.
    const writer = readSource('app/api/watch-time/route.ts');
    const conflict = /ON CONFLICT \(([^)]+)\)/.exec(writer);
    assert.ok(conflict, 'the guest upsert must state its conflict target');
    const target = conflict[1]
      .split(',')
      .map((column) => column.trim().toLowerCase())
      .join(', ');

    const routeDefinition = definition(
      readSource(ROUTE_SOURCE.anonymous_watch_history),
      'anonymous_watch_history',
    );
    const unique = routeDefinition.find((part) => part.startsWith('unique('));
    assert.ok(unique, 'the anonymous_watch_history bootstrap must declare its UNIQUE constraint');
    assert.equal(
      unique
        .replace('unique(', '')
        .replace(')', '')
        .split(',')
        .map((column) => column.trim())
        .join(', '),
      target,
      'the UNIQUE constraint and the ON CONFLICT target must name the same columns',
    );
  });
});

describe('no admin route hands the database message back to the caller', () => {
  // A Postgres error names tables, columns and constraints, and it is not the
  // UI's to display. Every one of these routes answered `{ error: error.message }`
  // with a 500, so a missing column was reported to an admin as a sentence about
  // the schema — and that sentence was also the whole of the client's error
  // handling. The message now goes to the server log, where it is useful, and the
  // response is generic.
  it('logs the failure and returns a generic 500', () => {
    const adminDirectory = path.join(process.cwd(), 'app', 'api', 'admin');
    const routes = [
      ...findBootstraps('app/api/admin').map((bootstrap) => bootstrap.file),
      ...readdirSync(adminDirectory, {withFileTypes: true})
        .filter((entry) => entry.isDirectory())
        .map((entry) => `app/api/admin/${entry.name}/route.ts`),
    ];

    for (const route of new Set(routes)) {
      const source = readCode(route);
      assert.doesNotMatch(
        source,
        /error\.message/,
        `${route} returns or reads the database's own message`,
      );
      assert.match(
        source,
        /return NextResponse\.json\(\{ error: 'Internal Server Error' \}, \{ status: 500 \}\)/,
        `${route} must answer a 500 with a message that is not the database's`,
      );
      if (/catch \(error/.test(source)) {
        assert.match(
          source,
          /console\.error\('\[admin\//,
          `${route} swallows an error without logging it`,
        );
      }
    }
  });
});
