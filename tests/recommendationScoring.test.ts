/**
 * THE SEAM BETWEEN THE REQUEST AND THE TASTE ARITHMETIC, pinned by EXECUTION.
 *
 * `lib/recommendationScoring.ts` reads a payload into the shapes
 * `lib/tasteSignals.ts` takes, and the route then asks it for a score. Every
 * mistake available at this seam is silent, because every field below is read
 * from a plain object:
 *
 *   - a field read under the wrong name is `undefined`, so an observation loses
 *     its measurement, weighs zero, and `hasEnoughSignal` reports a viewer with
 *     no taste — a section that is empty for everyone and names no fault;
 *   - a title counted once per ROW lets five episodes of one series outvote five
 *     distinct films, which is not a rounding error but a different viewer;
 *   - a media type guessed rather than read attributes one title's genres to
 *     another that happens to share its id, and nothing errors anywhere.
 *
 * So the tests below are mostly about WHAT IS NOT ASSUMED, and the numbers in the
 * end-to-end block are written down next to the input that produces them. If a
 * weight rule changes in `lib/tasteSignals.ts`, this file fails with the old
 * expectation in hand rather than quietly reporting a new percentage.
 *
 * THE LAST BLOCK IS SOURCE TEXT, AND SAYS SO. `app/api/ai-recommend/route.ts`
 * cannot be executed in this checkout — `.env.local` carries no TMDB key and no
 * Gemini key, and the suite has no server harness — so what is pinned there is
 * the SHAPE of the route rather than its behaviour: that the dead transport is
 * gone, that the model is never asked for a number, and that the account's history
 * is read under its own `user_id`. Those assertions can catch a regression; they
 * cannot prove the endpoint works, and they are not written as though they do.
 */

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';

import {
  featuresFromCache,
  scoreCandidates,
  signalsFromHistory,
} from '../lib/recommendationScoring';
import {
  MIN_TITLES_FOR_RECOMMENDATION,
  buildTasteProfile,
  hasEnoughSignal,
  seenTitleKeys,
  titleKey,
} from '../lib/tasteSignals';

import type {TasteProfile} from '../lib/tasteSignals';

/** A fixed clock, so nothing below depends on when the suite runs. */
const NOW = 1_754_000_000_000;

/** A history row as the CLIENT posts it: camelCase, epoch milliseconds. */
const clientRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  media_type: 'movie',
  media_id: 1,
  positionSeconds: 100,
  durationSeconds: 100,
  lastSeenMs: NOW,
  ...overrides,
});

/** The same row as `watch_history` returns it: column names, a `Date`. */
const accountRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  media_type: 'movie',
  media_id: 1,
  minutes_watched: 42,
  current_time: 100,
  total_duration: 100,
  last_updated: new Date(NOW),
  ...overrides,
});

/** A cache row as `title_features` returns one. */
const cacheRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  media_type: 'movie',
  media_id: 1,
  genre_ids: [18],
  original_language: 'fr',
  ...overrides,
});

describe('signalsFromHistory — one title, however many rows it takes', () => {
  it('accumulates several episodes of one series into ONE observation', () => {
    const {observations, unreadableCount} = signalsFromHistory([
      clientRow({media_type: 'tv', media_id: 1396, positionSeconds: 40, durationSeconds: 100}),
      clientRow({media_type: 'tv', media_id: 1396, positionSeconds: 90, durationSeconds: 100}),
      clientRow({media_type: 'tv', media_id: 1396, positionSeconds: 50, durationSeconds: 100}),
    ]);

    assert.equal(unreadableCount, 0);
    assert.equal(observations.length, 1);

    const [series] = observations;
    assert.equal(series.observationCount, 3);
    // The FURTHEST progress wins, and it brings its own duration with it. Taking
    // the last row instead would report 0.5 here, and taking the position from
    // one row and the duration from another would invent a playback that never
    // happened — 90 over 100 is a real measurement, 90 over 100 assembled from
    // two different rows is not.
    assert.equal(series.positionSeconds, 90);
    assert.equal(series.durationSeconds, 100);
  });

  it('says nothing about list membership rather than guessing it', () => {
    const {observations} = signalsFromHistory([clientRow()]);

    // `explicitWeight` distinguishes "on no list" from "we were not told". A
    // guessed `null` here would let a favourite be read as an unlisted title — and
    // while a title watched to the end weighs 1 either way, a favourite watched
    // for four seconds would be read as an abandonment and would weigh -0.5.
    assert.equal(observations[0].listed, undefined);
  });

  it('reads a row from the database and a row from the client the same way', () => {
    const [fromClient] = signalsFromHistory([clientRow()]).observations;
    const [fromAccount] = signalsFromHistory([accountRow()]).observations;

    // This is the test for the whole two-vocabulary design. `current_time` and
    // `total_duration` are the column names; reading only `positionSeconds` and
    // `durationSeconds` would leave every account row UNMEASURED — a profile
    // built out of nothing but the recency floor, with no error and no log.
    assert.equal(fromClient.positionSeconds, 100);
    assert.equal(fromAccount.positionSeconds, 100);
    assert.equal(fromAccount.durationSeconds, 100);
    assert.equal(fromAccount.lastSeenMs, NOW);
    assert.equal(fromAccount.minutesWatched, 42);
  });

  it('treats an empty string as ABSENT, not as a zero', () => {
    const [observation] = signalsFromHistory([
      clientRow({positionSeconds: '', durationSeconds: '  '}),
    ]).observations;

    // `Number('')` is 0 and `Number('  ')` is 0. Coercion would turn two empty
    // fields into "opened at second zero of a zero-second video" — a measurement
    // that never existed. Absent is what it is.
    assert.equal(observation.positionSeconds, null);
    assert.equal(observation.durationSeconds, null);
  });

  it('accepts a numeric string id, because pg returns BIGINT as a string', () => {
    const {observations, unreadableCount} = signalsFromHistory([
      accountRow({media_id: '8377'}),
      accountRow({media_id: ' 42 '}),
    ]);

    assert.equal(unreadableCount, 0);
    assert.deepEqual(
      observations.map((observation) => observation.mediaId),
      [8377, 42],
    );
  });

  it('keeps a film and a series that share an id as TWO titles', () => {
    const {observations} = signalsFromHistory([
      clientRow({media_type: 'movie', media_id: 550}),
      clientRow({media_type: 'tv', media_id: 550}),
    ]);

    assert.equal(observations.length, 2);
    assert.deepEqual(observations.map((o) => titleKey(o.mediaType, o.mediaId)).sort(), [
      'movie:550',
      'tv:550',
    ]);
  });

  it('counts what it cannot identify instead of inventing a title for it', () => {
    const {observations, unreadableCount} = signalsFromHistory([
      {media_type: 'movie'},
      {media_id: 5},
      {media_type: 'person', media_id: 1},
      {media_type: 'movie', media_id: 0},
      {media_type: 'movie', media_id: 1.5},
      'garbage',
      null,
      [],
    ]);

    assert.deepEqual(observations, []);
    assert.equal(unreadableCount, 8);
  });

  it('answers an unusable payload with silence rather than a throw', () => {
    for (const payload of [undefined, null, 'history', 42, {}]) {
      const signals = signalsFromHistory(payload);
      assert.deepEqual(signals.observations, []);
      assert.deepEqual(signals.features, []);
      assert.equal(signals.unreadableCount, 0);
    }
  });
});

describe('featuresFromCache — what the titles are made of', () => {
  it('reads a cache row into the shape the profile takes', () => {
    const features = featuresFromCache([cacheRow()]);

    assert.deepEqual(features, [
      {mediaType: 'movie', mediaId: 1, genreIds: [18], originalLanguage: 'fr'},
    ]);
  });

  it('applies the same genre validation rule as the cache writer', () => {
    const [feature] = featuresFromCache([cacheRow({genre_ids: [53, '18', 18, 0, -4, 2.5, 'x']})]);

    // Deduplicated, sorted, whole, positive — the rule `genreIdsOf` owns. Two
    // copies of it would be two things to keep in step, and an id that fails it
    // here would silently never match a profile term.
    assert.deepEqual(feature.genreIds, [18, 53]);
  });

  it('skips a row we know nothing about instead of emitting an empty feature', () => {
    const features = featuresFromCache([
      cacheRow({genre_ids: [], original_language: null}),
      cacheRow({genre_ids: [], original_language: ''}),
      cacheRow({media_type: 'person'}),
      cacheRow({media_id: 0}),
      cacheRow({media_type: 'movie', media_id: 2, genre_ids: [], original_language: 'en'}),
    ]);

    // The last row survives on its language alone. The four before it would be
    // counted as KNOWN titles by `buildTasteProfile` while contributing no
    // weight, which is the opposite of the truth: we have no features for them,
    // and `unknownTitleCount` is where a caller can see that.
    assert.deepEqual(features, [
      {mediaType: 'movie', mediaId: 2, genreIds: [], originalLanguage: 'en'},
    ]);
  });
});

describe('the profile the route actually builds', () => {
  /**
   * Three finished films, and no genres anywhere in the history payload — the
   * production shape, where the genres come from the cache and not from the
   * caller.
   */
  const history = [
    accountRow({media_id: 1}),
    accountRow({media_id: 2}),
    accountRow({media_id: 3}),
  ];

  const cache = [
    cacheRow({media_id: 1, genre_ids: [18], original_language: 'fr'}),
    cacheRow({media_id: 2, genre_ids: [18], original_language: 'fr'}),
    cacheRow({media_id: 3, genre_ids: [28], original_language: 'en'}),
  ];

  const profileOf = (rows: unknown[], cacheRows: unknown[]): TasteProfile => {
    const signals = signalsFromHistory(rows);
    return buildTasteProfile(signals.observations, featuresFromCache(cacheRows), NOW);
  };

  it('weighs the history through the real arithmetic, to the number', () => {
    const profile = profileOf(history, cache);

    // Weights, step by step. Each film: finished (engagement 1) × just seen
    // (recency 1) × no repeat (1) = 1. Accumulated: genre 18 = 2, genre 28 = 1,
    // language fr = 2 × LANGUAGE_TERM_SHARE = 1, language en = 0.5. Normalised by
    // the largest absolute weight (2): 18 → 1, 28 → 0.5, fr → 0.5, en → 0.25.
    assert.deepEqual(
      profile.terms.map((term) => [term.termType, term.termId, term.weight]),
      [
        ['genre', '18', 1],
        ['genre', '28', 0.5],
        ['language', 'en', 0.25],
        ['language', 'fr', 0.5],
      ],
    );
    assert.equal(profile.titleCount, 3);
    assert.equal(profile.unknownTitleCount, 0);
    assert.equal(hasEnoughSignal(profile), true);
  });

  it('counts a title it has no features for as UNKNOWN, not as weightless', () => {
    const profile = profileOf([...history, accountRow({media_id: 4})], cache);

    assert.equal(profile.titleCount, 3);
    assert.equal(profile.unknownTitleCount, 1);
  });

  it('does not let five episodes of one series stand in for five films', () => {
    // Five rows, one title. The accumulator counts them as ONE observation, so
    // the profile has one title — below the threshold — rather than five, which
    // would have cleared it. A viewer who finished one series is not a viewer
    // with a taste, and this is where that is decided.
    const rows = [1, 2, 3, 4, 5].map((episode) =>
      clientRow({media_type: 'tv', media_id: 1396, minutesWatched: episode}),
    );
    const profile = profileOf(rows, [cacheRow({media_type: 'tv', media_id: 1396})]);

    assert.equal(profile.titleCount, 1);
    assert.equal(hasEnoughSignal(profile), false);
    assert.equal(MIN_TITLES_FOR_RECOMMENDATION, 3);
  });
});

describe('scoreCandidates — a real score, and no score where there is none', () => {
  const signals = signalsFromHistory([
    accountRow({media_id: 1}),
    accountRow({media_id: 2}),
    accountRow({media_id: 3}),
  ]);
  const profile = buildTasteProfile(
    signals.observations,
    featuresFromCache([
      cacheRow({media_id: 1, genre_ids: [18], original_language: 'fr'}),
      cacheRow({media_id: 2, genre_ids: [18], original_language: 'fr'}),
      cacheRow({media_id: 3, genre_ids: [28], original_language: 'en'}),
    ]),
    NOW,
  );

  it('ranks by hand-computed affinity, deterministically', () => {
    const scored = scoreCandidates(
      [
        {id: 10, genre_ids: [18], original_language: 'fr'},
        {id: 11, genre_ids: [28], original_language: 'en'},
        {id: 12, genre_ids: [18], original_language: 'en'},
      ],
      profile,
      new Set<string>(),
      'movie',
    );

    // Positive weights total 1 + 0.5 + 0.5 + 0.25 = 2.25.
    //   id 10: 18 (1) + fr (0.5)    = 1.5  → 100 × 1.5 / 2.25  = 66.7 → 67
    //   id 12: 18 (1) + en (0.25)   = 1.25 → 100 × 1.25 / 2.25 = 55.6 → 56
    //   id 11: 28 (0.5) + en (0.25) = 0.75 → 100 × 0.75 / 2.25 = 33.3 → 33
    assert.deepEqual(
      scored.map((candidate) => [candidate.id, candidate.score]),
      [
        [10, 67],
        [12, 56],
        [11, 33],
      ],
    );
  });

  it('DROPS a candidate it cannot score rather than ranking it last', () => {
    const scored = scoreCandidates(
      [
        {id: 10, genre_ids: [18], original_language: 'fr'},
        {id: 13, genre_ids: [], original_language: null},
        {id: 14},
        {genre_ids: [18]},
        {id: 15, genre_ids: [7], original_language: 'ja'},
      ],
      profile,
      new Set<string>(),
      'movie',
    );

    // Three of the five cannot be compared at all: one has no features, and two
    // have no id. The last shares nothing with the profile — but it CAN be
    // compared, and 0 is the honest result of that comparison. §21: an unscored
    // candidate must not come back as though it were a recommendation, so the
    // unreadable ones are absent from the list rather than sitting at the bottom
    // of it.
    assert.deepEqual(
      scored.map((candidate) => [candidate.id, candidate.score]),
      [
        [10, 67],
        [15, 0],
      ],
    );
  });

  it('excludes by title, so a film does not suppress a series sharing its id', () => {
    const excluded = new Set(seenTitleKeys(signals.observations));

    const asMovie = scoreCandidates([{id: 1, genre_ids: [18]}], profile, excluded, 'movie');
    const asSeries = scoreCandidates([{id: 1, genre_ids: [18]}], profile, excluded, 'tv');

    // `movie:1` is in the viewer's history; `tv:1` is not. Comparing bare ids —
    // which the previous version of the route did — would have removed both.
    assert.deepEqual(asMovie, []);
    assert.equal(asSeries.length, 1);
    assert.equal(asSeries[0].mediaType, 'tv');
  });

  it('scores nothing when the profile holds no positive weight', () => {
    const empty = buildTasteProfile([], [], NOW);

    assert.deepEqual(empty.terms, []);
    assert.deepEqual(
      scoreCandidates(
        [{id: 10, genre_ids: [18], original_language: 'fr'}],
        empty,
        new Set(),
        'movie',
      ),
      [],
    );
  });

  it('honours the limit, and breaks ties by id', () => {
    const tied = [
      {id: 30, genre_ids: [18], original_language: 'fr'},
      {id: 10, genre_ids: [18], original_language: 'fr'},
      {id: 20, genre_ids: [18], original_language: 'fr'},
    ];

    const top2 = scoreCandidates(tied, profile, new Set(), 'movie', 2);
    assert.deepEqual(top2.map((candidate) => candidate.id), [10, 20]);

    // Same input, same output: the sort is total, so the list cannot reorder
    // between two calls that measured the same thing.
    assert.deepEqual(
      scoreCandidates(tied, profile, new Set(), 'movie').map((c) => c.id),
      scoreCandidates(tied, profile, new Set(), 'movie').map((c) => c.id),
    );
  });

  it('answers an unusable candidate payload with an empty list', () => {
    for (const payload of [undefined, null, 'results', 42, {}]) {
      assert.deepEqual(scoreCandidates(payload, profile, new Set(), 'movie'), []);
    }
  });
});

/**
 * SOURCE TEXT, NOT BEHAVIOUR. Nothing below executes the route: `.env.local`
 * holds no TMDB key and no Gemini key, and this suite runs no server. Each
 * assertion is a shape a regression would have to break, and none of them is
 * evidence that the endpoint returns anything.
 */
describe('app/api/ai-recommend/route.ts — the shape, by source text', () => {
  const route = readFileSync(
    path.join(process.cwd(), 'app', 'api', 'ai-recommend', 'route.ts'),
    'utf8',
  );

  it('does not use the relative-URL transport that could never resolve', () => {
    // `utils/api.ts` resolves `BASE_URL = "/api/tmdb-proxy"`, and axios under Node
    // throws `ERR_INVALID_URL` on a relative url — measured. The route fetches
    // TMDB directly, with an absolute url and a bearer token.
    assert.equal(route.includes('fetchDataFromApi'), false);
    assert.equal(route.includes('utils/api'), false);
    assert.ok(route.includes('https://api.themoviedb.org/3'));
    assert.ok(route.includes('Authorization: `Bearer ${'));
  });

  it('never asks the model for a number', () => {
    // The defect being removed: a prompt with percentage ceilings, and a schema
    // requiring a `score`. The model now writes prose for films that were already
    // ranked by `affinityScore`.
    assert.equal(/score\s*:\s*\{\s*type:\s*Type\./.test(route), false);
    assert.equal(/\d+\s*%/.test(route), false);
    assert.equal(route.includes('max 85'), false);
    assert.equal(route.includes('max 92'), false);
    assert.equal(route.includes('max 97'), false);
    assert.ok(route.includes("required: ['key', 'raison']"));
  });

  it('keeps the score in the module that owns it', () => {
    assert.ok(route.includes('scoreCandidates('));
    // The formula `100 × matched / positiveTotal` lives in `lib/tasteSignals.ts`
    // and must not be re-derived here, where a second copy could drift.
    assert.equal(/100\s*\*/.test(route), false);
    assert.ok(route.includes('seenTitleKeys'));
  });

  it('applies the site content rule on the direct path too', () => {
    assert.ok(route.includes("from '@/utils/contentFilter'"));
    assert.ok(route.includes('filterContent(results)'));
  });

  it('reads the account history under its own user_id, and nothing else', () => {
    assert.ok(route.includes('WHERE user_id = $1'));
    // The reserved word, quoted. Unquoted it parses as the `CURRENT_TIME` value
    // function and the viewer's position comes back as the server's clock.
    assert.ok(route.includes('"current_time"'));
    assert.ok(route.includes("media_type IN ('movie', 'tv')"));
  });

  it('names a reason on every path that shows nothing', () => {
    for (const reason of [
      'insufficient_signal',
      'no_tmdb_key',
      'no_candidates',
      'history_unavailable',
      'features_unavailable',
      'tmdb_unavailable',
      'invalid_body',
      'error',
    ]) {
      assert.ok(
        route.includes(`refuse('${reason}'`),
        `the ${reason} refusal must carry its reason`,
      );
    }
  });
});
