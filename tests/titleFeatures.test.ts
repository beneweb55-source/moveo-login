/**
 * WHAT A TMDB PAYLOAD BECOMES IN THE CACHE, AND WHEN IT MUST BE FETCHED AGAIN.
 *
 * WHY THIS FILE MATTERS MORE THAN ITS SIZE SUGGESTS. Every rule below fails
 * SILENTLY in production. A genre list read from the wrong field is an empty
 * `INTEGER[]`; a title read from the wrong field is a NULL in a NULLable column;
 * a stale row trusted past its age is a cache that can never be corrected. None of
 * those raises, logs, or shows up on a screen — the first two make the recommender
 * and the history quietly do less, and the third makes a wrong answer permanent.
 *
 * It is also the ONLY half of this work that can be checked here. `TMDB_API_KEY` is
 * absent in this environment, so the backfill's fetches cannot be executed at all;
 * what can be checked is that a payload of a known shape becomes the row it should.
 * The script's own properties — that it cannot write without `--apply`, that it
 * never touches `anonymous_watch_history` — are checked as SOURCE TEXT below, and
 * that is stated as the limitation it is (§8: a check that cannot run is not a
 * check). The header of tests/tasteProfileSchema.test.ts makes the same admission
 * about executed SQL.
 *
 * THE TWO CONFUSIONS THIS FILE EXISTS FOR, both real TMDB shapes:
 *
 *   `genres: [{id, name}]`   on the DETAIL endpoints
 *   `genre_ids: [number]`    on the LIST and SEARCH endpoints
 *   `title`                  for a MOVIE
 *   `name`                   for a SERIES
 *
 * Reading one and not the other is not a crash. It is a row that stores less than
 * it should, which is why the tests below pin both shapes and pin the CROSS cases
 * — a series payload must not be read for `title`, and a movie payload must not be
 * read for `name`.
 */

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';

import {
  TITLE_FEATURE_LANGUAGE,
  TITLE_FEATURE_LANGUAGE_MAX,
  TITLE_FEATURE_MAX_AGE_DAYS,
  TITLE_FEATURE_POSTER_MAX,
  TITLE_FEATURE_TITLE_MAX,
  describeTitle,
  fetchDecision,
  isMediaType,
  satisfiesAllReaders,
  titleFeatureEndpoint,
  titleFeatureFromPayload,
} from '../lib/titleFeatures';

const scriptSource = readFileSync(
  path.join(process.cwd(), 'scripts', 'backfill-title-features.ts'),
  'utf8',
);

const migrationSource = readFileSync(
  path.join(process.cwd(), 'scripts', 'migrate-taste-profile.ts'),
  'utf8',
);

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-23T10:00:00.000Z');
const RECENT = new Date(NOW - 1000);

/** A `/movie/{id}` response, trimmed to the fields the mapper reads. */
const MOVIE = {
  id: 550,
  title: 'Fight Club',
  genres: [
    {id: 18, name: 'Drame'},
    {id: 53, name: 'Thriller'},
  ],
  original_language: 'en',
  poster_path: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
};

/** A `/tv/{id}` response. `name`, not `title` — and no `title` key at all. */
const SERIES = {
  id: 1396,
  name: 'Breaking Bad',
  genres: [{id: 18, name: 'Drame'}],
  original_language: 'en',
  poster_path: '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
};

describe('a TMDB detail payload becomes one row of the cache', () => {
  it('reads the genre objects the detail endpoints return', () => {
    const feature = titleFeatureFromPayload('movie', 550, MOVIE);
    assert.deepEqual(feature?.genreIds, [18, 53]);
  });

  it('reads the flat genre list the list and search endpoints return', () => {
    // The same concept, a different key. A mapper that only knew `genres` would
    // store `{}` here — an empty list, which reads exactly like "this title has no
    // genres" and is what makes the recommender stop working without failing.
    const feature = titleFeatureFromPayload('movie', 550, {
      ...MOVIE,
      genres: undefined,
      genre_ids: [53, 18],
    });
    assert.deepEqual(feature?.genreIds, [18, 53], 'and sorted, so the order is ours and not TMDB’s');
  });

  it('merges the two shapes when a payload carries both', () => {
    // On a real detail response `genres` is authoritative and `genre_ids` is usually
    // absent; on a search result it is the reverse. Merging is what makes "they
    // agree when both are present" an observation rather than an assumption.
    const feature = titleFeatureFromPayload('movie', 550, {...MOVIE, genre_ids: [28, 18]});
    assert.deepEqual(feature?.genreIds, [18, 28, 53], 'union, deduplicated, ascending');
  });

  it('names the title field per media type, with no fallback to the other', () => {
    // THE CROSS CASES. Both of these are payloads TMDB really produces, and reading
    // the wrong key yields `undefined` — which lands in a NULLable column as NULL,
    // a row indistinguishable from one TMDB could not name. So the wrong field is
    // refused rather than accepted as a lucky guess.
    assert.equal(titleFeatureFromPayload('movie', 550, MOVIE)?.title, 'Fight Club');
    assert.equal(titleFeatureFromPayload('tv', 1396, SERIES)?.title, 'Breaking Bad');

    const seriesWithoutName = {...SERIES, name: undefined, title: 'Breaking Bad'};
    assert.equal(
      titleFeatureFromPayload('tv', 1396, seriesWithoutName)?.title,
      null,
      'a series must not be read from `title`',
    );

    const movieWithoutTitle = {...MOVIE, title: undefined, name: 'Fight Club'};
    assert.equal(
      titleFeatureFromPayload('movie', 550, movieWithoutTitle)?.title,
      null,
      'a film must not be read from `name`',
    );
  });

  it('keeps the poster path exactly as TMDB returns it', () => {
    // Not a formatting preference. `components/HistoryCard.tsx:28` prepends
    // `https://image.tmdb.org/t/p/w500` unless the value already starts with `http`,
    // so storing a full URL here would produce a double-prefixed path and a 404 —
    // and the write path already stores the bare form, so a different form here
    // would make two rows of the same table disagree about the same column.
    const feature = titleFeatureFromPayload('movie', 550, MOVIE);
    assert.equal(feature?.posterPath, '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg');
    assert.ok(feature?.posterPath?.startsWith('/'));
    assert.ok(!feature?.posterPath?.includes('image.tmdb.org'));
  });

  it('turns an absent or blank string into null, never the empty string', () => {
    // NULL means "not known". `''` means "known to be empty". The database keeps
    // the distinction and the edge flattens it; collapsing them here would make a
    // title we could not resolve look like a title TMDB says has no name, and the
    // backfill reads this exact state to decide whether to try again.
    const feature = titleFeatureFromPayload('movie', 550, {
      ...MOVIE,
      title: '   ',
      poster_path: null,
      original_language: '',
    });
    assert.equal(feature?.title, null);
    assert.equal(feature?.posterPath, null);
    assert.equal(feature?.originalLanguage, null);

    const missing = titleFeatureFromPayload('movie', 550, {
      id: 550,
      genres: [],
      original_language: undefined,
    });
    assert.equal(missing?.title, null);
    assert.equal(missing?.posterPath, null);
    assert.equal(missing?.originalLanguage, null);
    assert.deepEqual(missing?.genreIds, [], 'no genres is stored as an empty list, not as null');
  });

  it('drops a genre id that is not a whole positive number', () => {
    // `genre_ids` is `INTEGER[]`, so ONE bad value fails the whole INSERT — losing
    // the genres that were fine. Dropping keeps the good ones, and the shorter list
    // is visible in the row rather than inferred.
    //
    // `Number()` would not do: `Number('')` is 0 and `Number(' 12 ')` is 12, so it
    // accepts values that are not ids. A numeric string that IS an integer is
    // accepted, because TMDB has returned those.
    const feature = titleFeatureFromPayload('movie', 550, {
      ...MOVIE,
      genres: [{id: 28}, {id: 'x'}, {id: 0}, {id: -3}, {id: 12.5}, {id: null}, {id: '12'}],
    });
    assert.deepEqual(feature?.genreIds, [12, 28]);
  });

  it('bounds every string to the width the schema declares', () => {
    // The columns are `VARCHAR(500)` and `VARCHAR(10)`. Truncating here means a long
    // value is shortened rather than making PostgreSQL reject the row — and the test
    // below checks these two constants against the SQL, so the numbers cannot drift
    // apart in two files.
    const feature = titleFeatureFromPayload('movie', 550, {
      ...MOVIE,
      title: 'x'.repeat(600),
      poster_path: 'y'.repeat(600),
      original_language: 'z'.repeat(30),
    });
    assert.equal(feature?.title?.length, TITLE_FEATURE_TITLE_MAX);
    assert.equal(feature?.posterPath?.length, TITLE_FEATURE_POSTER_MAX);
    assert.equal(feature?.originalLanguage?.length, TITLE_FEATURE_LANGUAGE_MAX);
  });

  it('keeps the display language and the original language apart', () => {
    // A French title does not mean a French film. `original_language` is about the
    // WORK and TMDB returns it unchanged whatever `language` was asked for; reading
    // the two as one signal would weigh every translated release as if it had been
    // produced in the language it was translated into.
    const feature = titleFeatureFromPayload('movie', 550, {
      ...MOVIE,
      title: 'Le Club de combat',
      original_language: 'en',
    });
    assert.equal(feature?.title, 'Le Club de combat');
    assert.equal(feature?.originalLanguage, 'en');
    assert.equal(TITLE_FEATURE_LANGUAGE, 'fr-FR');
  });

  it('refuses the payload TMDB returns for a title that does not exist', () => {
    // `{success:false, status_code:34, …}` arrives with HTTP 200 on some paths. It
    // must be a refusal, not a row whose fields merely happen to be missing: a row
    // written from it would sit in the cache as "known to have no genres AND no
    // name", and every later reader would trust it.
    assert.equal(
      titleFeatureFromPayload('movie', 550, {
        success: false,
        status_code: 34,
        status_message: 'The resource you requested could not be found.',
      }),
      null,
    );
  });

  it('refuses a payload that identifies a different title than the one asked for', () => {
    // THE POISONING GUARD. Writing a payload under the key we requested rather than
    // the key it names would attribute one title's genres to another — and every
    // later read of that pair, including the profile built from it, would be built
    // on the substitution with no error and no way to notice. A refusal here costs
    // one cache entry; the alternative costs a wrong profile.
    assert.equal(titleFeatureFromPayload('movie', 550, {...MOVIE, id: 551}), null);
    assert.equal(
      titleFeatureFromPayload('movie', 550, {...MOVIE, id: '550'}),
      null,
      'a string id is not an identity',
    );
    assert.equal(titleFeatureFromPayload('movie', 550, {...MOVIE, id: undefined}), null);
    assert.equal(titleFeatureFromPayload('movie', 550, {...MOVIE, id: 0}), null);
  });

  it('refuses anything that is not an object at all', () => {
    for (const payload of [null, undefined, 'Fight Club', 550, [MOVIE], true]) {
      assert.equal(
        titleFeatureFromPayload('movie', 550, payload),
        null,
        `${JSON.stringify(payload)} must not become a cache row`,
      );
    }
  });
});

describe('the endpoint names the media type, and the cache key is that pair', () => {
  it('builds the detail path per type', () => {
    assert.equal(titleFeatureEndpoint('movie', 550), '/movie/550');
    assert.equal(titleFeatureEndpoint('tv', 1396), '/tv/1396');
    // A template that forgot to branch produces this, and TMDB answers 404 — a
    // failure that looks like "this title does not exist" rather than like a bug.
    assert.ok(!titleFeatureEndpoint('tv', 1396).includes('movie'));
    assert.ok(!titleFeatureEndpoint('movie', 550).includes('tv'));
  });

  it('narrows a stored media_type to the two values that can be fetched', () => {
    assert.ok(isMediaType('movie'));
    assert.ok(isMediaType('tv'));
    for (const value of ['admin_adjustment', 'series', 'Movie', 'anime', '', null, 7]) {
      assert.equal(isMediaType(value), false, `${JSON.stringify(value)} is not fetchable`);
    }
  });

  it('names a pair the same way the cache key is built', () => {
    // The Map key in the script and the label in its report come from one function,
    // so a report line can never describe a different pair than the one it fetched.
    assert.equal(describeTitle('movie', 550), 'movie/550');
    assert.equal(describeTitle('tv', 1396), 'tv/1396');
  });
});

describe('a cached row is refetched when it cannot serve the reader asking', () => {
  it('reports a pair with no row at all as absent', () => {
    assert.equal(fetchDecision(undefined, NOW, 'display'), 'absent');
    assert.equal(fetchDecision(null, NOW, 'display'), 'absent');
  });

  it('reports a complete, recent row as fresh for both readers', () => {
    const row = {fetchedAt: RECENT, genreIds: [18], title: 'Fight Club'};
    assert.equal(fetchDecision(row, NOW, 'recommendation'), 'fresh');
    assert.equal(fetchDecision(row, NOW, 'display'), 'fresh');
  });

  it('keeps a title-less row for the recommender but refetches it for the display', () => {
    // THE ASYMMETRY THIS EXISTS FOR. The recommender scores with genres and can
    // score a title whose display name we never resolved; refetching it would spend
    // a request to learn nothing. The history cannot show it. One notion of
    // "fresh" would have to pick one reader and be wrong about the other.
    const row = {fetchedAt: RECENT, genreIds: [18, 53], title: null};
    assert.equal(fetchDecision(row, NOW, 'recommendation'), 'fresh');
    assert.equal(fetchDecision(row, NOW, 'display'), 'incomplete');
  });

  it('refetches a titled row with no genres, which is the mirror image', () => {
    // The failure this pins is the quiet one: a backfill asking only the display
    // question would accept this row, report a completed run, and leave every taste
    // profile with nothing to weigh.
    const row = {fetchedAt: RECENT, genreIds: [], title: 'Fight Club'};
    assert.equal(fetchDecision(row, NOW, 'display'), 'fresh');
    assert.equal(fetchDecision(row, NOW, 'recommendation'), 'incomplete');
  });

  it('treats a whitespace-only title as no title', () => {
    const row = {fetchedAt: RECENT, genreIds: [18], title: '   '};
    assert.equal(fetchDecision(row, NOW, 'display'), 'incomplete');
  });

  it('expires a row at the boundary and past it', () => {
    const justInside = {
      fetchedAt: new Date(NOW - (TITLE_FEATURE_MAX_AGE_DAYS * DAY_MS - 1)),
      genreIds: [18],
      title: 'X',
    };
    const exactly = {
      fetchedAt: new Date(NOW - TITLE_FEATURE_MAX_AGE_DAYS * DAY_MS),
      genreIds: [18],
      title: 'X',
    };
    assert.equal(fetchDecision(justInside, NOW, 'display'), 'fresh');
    // `>=` and not `>`: a boundary that reads as fresh is a boundary that keeps
    // moving as the rows age into it.
    assert.equal(fetchDecision(exactly, NOW, 'display'), 'stale');
    assert.equal(fetchDecision({...exactly, fetchedAt: new Date(0)}, NOW, 'display'), 'stale');
  });

  it('treats an unreadable timestamp as stale rather than as fresh', () => {
    // The direction matters. A row whose `fetched_at` cannot be parsed is a row
    // whose age is UNKNOWN, and the safe reading of unknown is "fetch again" — the
    // opposite default would make a corrupt timestamp the one state that never
    // expires.
    for (const fetchedAt of [null, '', 'not a date']) {
      assert.equal(
        fetchDecision({fetchedAt, genreIds: [18], title: 'X'}, NOW, 'display'),
        'stale',
        `${JSON.stringify(fetchedAt)} must not read as fresh`,
      );
    }
  });

  it('accepts a Date and the ISO string the driver returns for the same instant', () => {
    // `pg` hands `timestamptz` back as a `Date` in this environment, while the script
    // passes the raw row through; both forms have to mean the same age or the
    // decision would depend on which shape the driver happened to return.
    const asDate = {fetchedAt: RECENT, genreIds: [18], title: 'X'};
    const asString = {fetchedAt: RECENT.toISOString(), genreIds: [18], title: 'X'};
    for (const need of ['recommendation', 'display'] as const) {
      assert.equal(fetchDecision(asDate, NOW, need), fetchDecision(asString, NOW, need));
    }
  });

  it('is satisfied for all readers only when BOTH needs are met', () => {
    // The backfill serves two readers with one run, so it cannot ask one question
    // and ignore the other. `satisfiesAllReaders` is that conjunction, and the two
    // false cases below are the two ways a one-sided check would have reported a
    // finished job over an unfinished cache.
    assert.equal(satisfiesAllReaders({fetchedAt: RECENT, genreIds: [18], title: 'X'}, NOW), true);
    assert.equal(satisfiesAllReaders({fetchedAt: RECENT, genreIds: [18], title: null}, NOW), false);
    assert.equal(satisfiesAllReaders({fetchedAt: RECENT, genreIds: [], title: 'X'}, NOW), false);
    assert.equal(satisfiesAllReaders({fetchedAt: RECENT, genreIds: [], title: null}, NOW), false);
    assert.equal(satisfiesAllReaders(undefined, NOW), false);
    assert.equal(
      satisfiesAllReaders({fetchedAt: new Date(0), genreIds: [18], title: 'X'}, NOW),
      false,
      'a stale row is not sufficient however complete it looks',
    );
  });
});

describe('the module, the schema and the script hold one copy of the rules', () => {
  it('takes its column widths from the migration rather than restating them', () => {
    // The SQL is the authority for what a column can hold. Parsing the widths out of
    // the migration and comparing them to the constants means a width changed in one
    // place and not the other fails here — instead of producing a value PostgreSQL
    // silently truncates or refuses.
    const widths = [...migrationSource.matchAll(/(?:title|poster_path)\s+VARCHAR\((\d+)\)/g)].map(
      (match) => Number(match[1]),
    );
    assert.ok(
      widths.length >= 4,
      `expected the create and the repair to each declare both columns, found ${widths.length}`,
    );
    assert.ok(
      widths.every((width) => width === TITLE_FEATURE_TITLE_MAX),
      `every declared width must equal TITLE_FEATURE_TITLE_MAX (${TITLE_FEATURE_TITLE_MAX}), got ${widths.join(', ')}`,
    );
    assert.equal(
      TITLE_FEATURE_TITLE_MAX,
      TITLE_FEATURE_POSTER_MAX,
      'both columns are the same width today, so one constant covers both',
    );
    assert.match(migrationSource, /original_language\s+VARCHAR\(10\)/);
    assert.equal(TITLE_FEATURE_LANGUAGE_MAX, 10);
  });

  it('takes the fetch language from the module, not from a second literal', () => {
    // A second `'fr-FR'` in the script is a second thing to change, and the copy that
    // gets missed is the one that decides which language the titles are stored in —
    // a mismatch the cache cannot detect, because both values are valid.
    assert.doesNotMatch(scriptSource, /['"]fr-FR['"]/);
    assert.match(scriptSource, /TITLE_FEATURE_LANGUAGE/);
    assert.equal(TITLE_FEATURE_LANGUAGE, 'fr-FR');
  });

  it('asks the module to decide, rather than re-implementing the decision', () => {
    // The expiry rule and the "is this row good enough" rule are the two things that
    // must not exist twice: a script with its own copy would keep fetching rows the
    // module considers fresh, or trust rows the module considers stale, and the tests
    // above would go on passing against a decision nothing uses.
    assert.match(scriptSource, /satisfiesAllReaders\(/);
    assert.match(scriptSource, /titleFeatureFromPayload\(/);
    assert.match(scriptSource, /titleFeatureEndpoint\(/);
    assert.doesNotMatch(scriptSource, /maxAgeDays/, 'the age rule must not be restated in the script');
    assert.doesNotMatch(
      scriptSource,
      /TITLE_FEATURE_MAX_AGE_DAYS/,
      'nor the constant that carries it',
    );
  });
});

describe('the backfill cannot write what it did not fetch, and cannot touch the guest table', () => {
  it('writes the history with COALESCE, so a stored title is never replaced', () => {
    // §15: do not lose existing data. The only rows this job may change are the ones
    // that are currently invisible, and `COALESCE(stored, fetched)` is that rule
    // written as SQL rather than as an intention in a comment.
    assert.match(scriptSource, /COALESCE\(wh\.title, tf\.title\)/);
    assert.match(scriptSource, /COALESCE\(wh\.poster_path, tf\.poster_path\)/);
    assert.match(scriptSource, /AND wh\.media_type IN \('movie', 'tv'\)/);
  });

  it('never writes to anonymous_watch_history', () => {
    // It has no title column, and nothing reads it for display — a guest's visible
    // history comes from localStorage, which already carries titles. Adding a column
    // there would create a second definition to keep in step with the bootstrap in
    // `app/api/admin/users/route.ts`, which `tests/schemaBootstrapDrift.test.ts`
    // pins, in order to serve no reader. Its pairs are FETCHED; its rows are not
    // written.
    assert.doesNotMatch(
      scriptSource,
      /(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+anonymous_watch_history/i,
    );
    // …but it IS read, because a guest's taste profile needs those genres.
    assert.match(scriptSource, /FROM anonymous_watch_history/);
  });

  it('cannot reach its write statements without --apply', () => {
    // SOURCE-LEVEL, and stated as such: `main()` needs a live database, so this is a
    // positional check rather than an execution. It proves the guard PRECEDES the
    // writes in the file as written, which is the property a reviewer would check by
    // eye — the equivalent of `tests/tasteProfileSchema.test.ts` reading the
    // migration as text.
    const guard = scriptSource.indexOf('if (apply) {');
    const upsert = scriptSource.indexOf('await pool.query(UPSERT_FEATURE');
    const dryRun = scriptSource.indexOf('if (!apply) {');
    const unHide = scriptSource.indexOf('await pool.query(BACKFILL_HISTORY');

    assert.ok(guard !== -1, 'the per-fetch write must sit inside an `if (apply)` branch');
    assert.ok(upsert !== -1 && guard < upsert, 'the upsert must be guarded by --apply');
    assert.ok(
      dryRun !== -1 && unHide !== -1 && dryRun < unHide,
      'the un-hiding must come after the dry-run exit',
    );
    assert.match(scriptSource, /pass --apply to fetch and store/);
  });

  it('fails closed when it cannot run, and says so instead of reporting success', () => {
    // §8. A run with no key or no database must not look like a run that found
    // nothing to do: exit 2, the word SKIPPED, and an explicit statement that this is
    // not a pass.
    assert.match(scriptSource, /SKIPPED: no TMDB key/);
    assert.match(scriptSource, /SKIPPED: DATABASE_URL is not set/);
    assert.match(scriptSource, /this is NOT a pass/);
    const skipExits = [...scriptSource.matchAll(/SKIPPED:[\s\S]{0,600}?process\.exit\(2\)/g)];
    assert.equal(skipExits.length, 2, 'both skip paths must exit 2');
  });

  it('reads both TMDB key names, as the proxy route does', () => {
    // A deployment that sets only the `NEXT_PUBLIC_` name still has a working
    // catalogue, so refusing here on the server-only name would refuse a working
    // installation — the same asymmetry `app/api/tmdb-proxy/route.ts:72` fixed in
    // the other direction.
    assert.match(
      scriptSource,
      /process\.env\.TMDB_API_KEY \|\| process\.env\.NEXT_PUBLIC_TMDB_API_KEY/,
    );
  });

  it('orders the pairs, so --limit always resolves the same ones', () => {
    // The observe-first control is only repeatable if the workload is ordered: on an
    // unordered query, "resolve the first five" picks a different five each run, and
    // two runs cannot be compared with each other.
    assert.match(scriptSource, /ORDER BY media_type, media_id/);
    assert.match(scriptSource, /--limit must be a positive whole number/);
  });

  it('leaves the CLI to a direct invocation, so reading it as text runs nothing', () => {
    assert.match(
      scriptSource,
      /if \(process\.argv\[1\] && \/backfill-title-features\/\.test\(process\.argv\[1\]\)\)/,
    );
  });
});
