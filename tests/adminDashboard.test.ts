/**
 * THE ADMIN DASHBOARD'S NUMBERS, pinned where they can be pinned.
 *
 * §3 of the brief is a list of things the dashboard may not do — no invented
 * figures, no hardcoded totals, no metric that exists to fill a card — and the
 * reason those are worth a test rather than a review is that every one of them
 * FAILS SILENTLY. A number inflated by a hand-written credit, a label that names
 * films while counting series, a `0h` beside a user who watched 59 minutes: none
 * of these throws. They render, and they are read as fact.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE. `TEST_DATABASE_URL` is unset here, so no
 * test in this suite can run a query and see a result — a database-backed test
 * would report SKIPPED, and a skipped test is not evidence. So the SQL is pinned
 * as SOURCE TEXT: that the viewing queries on `/api/admin/stats` all draw the
 * same line between observed viewing and admin credit, and that the one query
 * allowed to cross it is the one whose meaning requires crossing it. That is
 * weaker than executing the queries and it is stated as such; what it does prove
 * is the property a reviewer cannot check by reading 170 lines of SQL, and it is
 * the property that regresses the moment someone adds a query.
 *
 * The formatter is pinned by EXECUTION, because it is pure: `formatWatchTime` is
 * called with real values and the exact strings are compared.
 */

import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';

import {formatWatchTime} from '../utils/formatDuration';
import {translations} from '../lib/translations';

const readSource = (relative: string): string =>
  readFileSync(path.join(process.cwd(), ...relative.split('/')), 'utf8');

/** The source with comments stripped, for assertions about CODE. */
const readCode = (relative: string): string =>
  readSource(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

describe('formatWatchTime renders the minutes it is given', () => {
  it('never shows zero hours for a duration under an hour', () => {
    // THE REGRESSION. `Math.floor(59 / 60)}h` is `0h`, and that is what two of
    // the three call sites rendered: a user who watched 59 minutes was shown as
    // having watched nothing, in a column an admin reads to decide a rank.
    assert.equal(formatWatchTime(59), '59min');
    assert.notEqual(formatWatchTime(59), '0h');
    assert.equal(formatWatchTime(1), '1min');
    assert.equal(formatWatchTime(30), '30min');
  });

  it('drops the remainder only when there is none', () => {
    assert.equal(formatWatchTime(60), '1h');
    assert.equal(formatWatchTime(61), '1h 1min');
    assert.equal(formatWatchTime(210), '3h 30min');
    assert.equal(formatWatchTime(600), '10h');
    assert.equal(formatWatchTime(3599), '59h 59min');
  });

  it('treats no minutes, a negative, and a non-number as no minutes', () => {
    // An adjustment that has not been applied, or a SUM over no rows, is an
    // absence of minutes. `-1h` and the literal text `NaN` are both values that
    // are not values, and `NaN` is what `parseInt(undefined)` produces.
    for (const value of [0, -1, -60, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      assert.equal(formatWatchTime(value), '0min', `${value} must render as no minutes`);
    }
  });
});

describe('the stats route draws one line, and says where it is', () => {
  // COMMENTS STRIPPED, because these are assertions about CODE and the file's own
  // comments name the identifiers being ruled out — "the field is named
  // `totalTitlesWatched` and not `totalMoviesWatched`" is exactly the sentence
  // that makes the absence-pin fire on the documentation of the fix. A test that
  // fails when someone explains the defect is a test that gets deleted.
  const source = readCode('app/api/admin/stats/route.ts');

  it('names the non-viewing media type exactly once, as a constant', () => {
    // The literal used to be written inline in some queries and omitted from
    // others, which is precisely how the page came to disagree with itself.
    assert.match(source, /const ADMIN_ADJUSTMENT = 'admin_adjustment';/);
    assert.doesNotMatch(
      source,
      /NOT IN \('admin_adjustment'\)/,
      'the exclusion must go through the constant, or the next query will forget it',
    );
  });

  it('filters every query that aggregates viewing, and exactly one that does not', () => {
    // Each `pool.query(` template that mentions watch_history is one query. Every
    // one of them aggregates minutes, so every one of them has to decide what
    // counts — except the rank query, which sums a user's CREDITED total on
    // purpose, because crediting an adjustment is the whole point of writing one.
    const queries = source
      .split('pool.query(')
      .slice(1)
      .filter((chunk) => chunk.includes('watch_history'));

    assert.ok(queries.length >= 4, `expected at least 4 watch_history queries, found ${queries.length}`);

    const unfiltered = queries.filter((query) => !query.includes('media_type'));
    assert.equal(
      unfiltered.length,
      1,
      'a query that sums watch_history without deciding what counts is how the total drifted',
    );
    assert.match(unfiltered[0], /LEFT JOIN watch_history wh/, 'the rank query is the exception, and only it');
  });

  it('counts a title as (media_type, media_id) and not as media_id', () => {
    // TMDB ids are namespaced per type: film 1399 and series 1399 are different
    // works, and `COUNT(DISTINCT media_id)` counted them as one.
    assert.doesNotMatch(source, /COUNT\(DISTINCT media_id\)/);
    assert.match(source, /SELECT media_type, media_id FROM watch_history/);
    assert.match(source, /SELECT media_type, media_id FROM anonymous_watch_history/);
  });

  it('reports observed viewing and manual credit as two numbers', () => {
    assert.match(source, /adjustedWatchTime/);
    assert.match(source, /totalWatchTime,/);
    // The renamed field, so the dashboard cannot read the old name and print the
    // number under a label that says "Films".
    assert.doesNotMatch(source, /totalMoviesWatched/);
    assert.match(source, /totalTitlesWatched/);
  });

  it('never parses a count without a radix, so a card cannot render NaN', () => {
    // `Number.parseInt` is the form that carries an explicit radix; a BARE
    // `parseInt(` is the one that can be shadowed and read a count as octal. The
    // lookbehind that would express "not preceded by a dot" needs an ES2018
    // target and this project is on ES2017, so the negative is stated as a match
    // against a preceding non-word, non-dot character — which is exactly what a
    // bare call has and `Number.parseInt` does not.
    const bare = source.match(/(^|[^.\w])parseInt\(/g) ?? [];
    assert.equal(bare.length, 0, `a bare parseInt( survives: ${bare.join(', ')}`);
    assert.match(source, /Number\.parseInt\(String\(value \?\? '0'\), 10\)/, 'and the radix is passed');
    assert.match(source, /const toNumber = /);
  });

  it('keeps the database message in the log and out of the response', () => {
    assert.doesNotMatch(source, /error\.message/);
    assert.match(source, /console\.error\('\[admin\/stats\] GET failed:', error\)/);
  });
});

describe('the dashboard renders what the route sends, and says when it cannot', () => {
  // Comments stripped for the same reason as the suite above: the block comment
  // documenting the payload type names `totalMoviesWatched` as the field it used
  // to be, and the pin below asserts that name is gone.
  const source = readCode('components/admin/Dashboard.tsx');

  it('validates the payload before reading fields off it', () => {
    // Without this, a renamed field renders as the literal text `undefined` in a
    // card, which is a displayed value that is not a value.
    assert.match(source, /const isStatsPayload = \(value: unknown\): value is StatsPayload/);
    assert.match(source, /if \(!isStatsPayload\(data\)\)/);
    assert.doesNotMatch(source, /totalMoviesWatched/);
  });

  it('distinguishes a refusal from a failure, and offers a retry', () => {
    // 401/403 is a permission and repeating it changes nothing; a 5xx is a
    // failure and repeating it is exactly what might work. Both used to be the
    // same generic message.
    assert.match(source, /res\.status === 401 \|\| res\.status === 403/);
    assert.match(source, /error === 'forbidden'/);
    assert.match(source, /t\.admin\.dashboardPermissionDenied/);
    assert.match(source, /t\.admin\.retry/);
    assert.match(source, /setAttempt\(/);
  });

  it('uses the shared formatter rather than its own arithmetic', () => {
    assert.match(source, /formatWatchTime/);
    assert.doesNotMatch(source, /\/ 60/);
  });

  it('names the manual credit only when there is one to name', () => {
    assert.match(source, /stats\.adjustedWatchTime > 0/);
    assert.match(source, /t\.admin\.manualCreditsExcluded/);
  });
});

describe('no admin screen does its own minutes arithmetic any more', () => {
  it('divides no watch-time total by 60 anywhere in components/admin', () => {
    // The bug was two components with their own copy of the same division, one
    // of which dropped the remainder. One formatter, one place to be wrong.
    const directory = path.join(process.cwd(), 'components', 'admin');
    for (const file of readdirSync(directory).filter((name) => name.endsWith('.tsx'))) {
      const source = readCode(`components/admin/${file}`);
      assert.doesNotMatch(
        source,
        /total_watch_time\s*\/\s*60/,
        `${file} must format minutes through formatWatchTime`,
      );
    }
  });

  it('reads no translation key that no longer exists', () => {
    // `moviesWatched` was renamed to `titlesWatched` because the number counts
    // films AND series. A leftover reader would render an empty label, which is
    // the same silent failure as an invented figure.
    const directory = path.join(process.cwd(), 'components', 'admin');
    for (const file of readdirSync(directory).filter((name) => name.endsWith('.tsx'))) {
      const source = readCode(`components/admin/${file}`);
      assert.doesNotMatch(source, /t\.admin\.moviesWatched/, `${file} still reads the old key`);
    }
  });
});

describe('every label exists in both languages', () => {
  const fr = translations.fr as unknown as Record<string, Record<string, unknown>>;
  const en = translations.en as unknown as Record<string, Record<string, unknown>>;

  it('has the same key set in FR and EN, group by group', () => {
    // TYPE-CHECKING DOES NOT COVER THIS. `Translations` is derived from the FR
    // block, so a key added to FR and forgotten in EN compiles perfectly and
    // renders as an empty label for every English-speaking admin. The failure is
    // invisible in the language the developer reads.
    assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort(), 'the two languages must define the same groups');

    for (const group of Object.keys(fr)) {
      assert.deepEqual(
        Object.keys(fr[group] ?? {}).sort(),
        Object.keys(en[group] ?? {}).sort(),
        `the "${group}" group has drifted between languages`,
      );
    }
  });

  it('carries the renamed and the new dashboard labels in both', () => {
    for (const [language, block] of [['fr', fr], ['en', en]] as const) {
      for (const key of ['titlesWatched', 'manualCreditsExcluded', 'dashboardPermissionDenied', 'retry', 'statsUnavailable']) {
        assert.equal(typeof block.admin[key], 'string', `${language}.admin.${key} must exist`);
      }
      assert.ok(!('moviesWatched' in block.admin), `${language}.admin.moviesWatched must be gone`);
    }
  });

  it('leaves a placeholder in the credit note, so it cannot be printed unfilled', () => {
    assert.match(String(fr.admin.manualCreditsExcluded), /\{minutes\}/);
    assert.match(String(en.admin.manualCreditsExcluded), /\{minutes\}/);
  });
});
