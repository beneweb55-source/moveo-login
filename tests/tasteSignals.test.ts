/**
 * THE TASTE PROFILE'S ARITHMETIC, pinned by EXECUTION.
 *
 * `lib/tasteSignals.ts` is pure on purpose, and this file is why: every rule in
 * it fails SILENTLY in production. A completion threshold set too high, a recency
 * decay with no floor, a rewatch multiplier that grows without bound — none of
 * them throws, none of them logs, and all of them produce a page of
 * recommendations that looks exactly as plausible as a correct one. The only
 * place a wrong weight is visible is here, where the expected number is written
 * down next to the input that produces it.
 *
 * THE THREE THINGS A READER SHOULD CHECK FIRST:
 *
 *   1. THE HONEST ABSENCES. `affinityScore` returns `null` — not 0 — when the
 *      number would not be a measurement, and §3 of the brief makes that the
 *      difference between a real figure and an invented one. A test that only
 *      proved "it computes percentages" would pass just as well against a version
 *      that returned 0 for "we could not read this title", which is the defect
 *      this whole module was written to avoid.
 *   2. THE ORDER OF THE RULES. An explicitly favourited title is not abandoned
 *      however little of it was watched; a row at position 0 is not abandoned at
 *      all. Both are cases where two defensible rules disagree, and the code has
 *      to pick one — so the pick is pinned rather than left to whoever edits next.
 *   3. THE FIXTURES SAY WHAT THE VIEWER DID. This file's first run failed on
 *      exactly this: a title described with no position, no duration and no list
 *      is UNMEASURED, and the whole point of the module is that it weighs such a
 *      title at zero rather than guessing. `finished` and `abandoned` below are
 *      how a test states behaviour; the bare `observed` form is reserved for the
 *      tests that are about that absence.
 */

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  affinityScore,
  buildTasteProfile,
  engagementOf,
  hasEnoughSignal,
  observationWeight,
  recencyWeight,
  rewatchMultiplier,
  seenTitleKeys,
  titleKey,
} from '../lib/tasteSignals';
import {COMPLETION_RATIO} from '../lib/progressionGuard';

import type {TasteObservation, TasteProfile, TitleFeatures} from '../lib/tasteSignals';

/** A fixed clock, so nothing below depends on when the suite runs. */
const NOW = 1_754_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A title with nothing stated about it: no position, no list, no metadata. */
const observed = (overrides: Partial<TasteObservation> = {}): TasteObservation => ({
  mediaType: 'movie',
  mediaId: 1,
  ...overrides,
});

/**
 * A title watched to the end, just now.
 *
 * The timestamp is not incidental: without one, recency falls to its floor and
 * every weight below would be multiplied by 0.2 — which normalisation hides, but
 * which would make the expected numbers in this file the product of two rules
 * instead of one. Each rule is pinned by its own test instead.
 */
const finished = (mediaId: number, overrides: Partial<TasteObservation> = {}): TasteObservation =>
  observed({mediaId, positionSeconds: 100, durationSeconds: 100, lastSeenMs: NOW, ...overrides});

/** A title opened and left after four seconds of a long film. */
const abandoned = (mediaId: number, overrides: Partial<TasteObservation> = {}): TasteObservation =>
  observed({mediaId, positionSeconds: 4, durationSeconds: 200, lastSeenMs: NOW, ...overrides});

const featured = (overrides: Partial<TitleFeatures> = {}): TitleFeatures => ({
  mediaType: 'movie',
  mediaId: 1,
  genreIds: [],
  ...overrides,
});

/** The term weights of a profile, by `type:id`, for assertions that name one. */
const weightsOf = (profile: TasteProfile): Map<string, number> =>
  new Map(profile.terms.map((term) => [`${term.termType}:${term.termId}`, term.weight]));

describe('engagementOf weighs what the viewer actually did', () => {
  it('counts a finished title as one, and a half-watched one as a half', () => {
    // The completion boundary is the SAME 0.95 the player and the progression
    // guard use, imported rather than restated. A second copy would drift and
    // then disagree with the player about what "finished" means.
    assert.equal(engagementOf(observed({positionSeconds: 100, durationSeconds: 100})), 1);
    assert.equal(engagementOf(observed({positionSeconds: 95, durationSeconds: 100})), 1);
    assert.equal(engagementOf(observed({positionSeconds: 50, durationSeconds: 100})), 0.5);
    assert.equal(engagementOf(observed({positionSeconds: 20, durationSeconds: 100})), 0.2);
  });

  it('does not reward a position past the end beyond one', () => {
    // A row whose position overshot its duration is a real row — the history
    // screen renders one — and an engagement above 1 would let it outrank a
    // genuinely finished title.
    assert.equal(engagementOf(observed({positionSeconds: 500, durationSeconds: 100})), 1);
    assert.equal(engagementOf(observed({positionSeconds: -10, durationSeconds: 100})), 0);
  });

  it('treats an abandon as a negative, which is the signal it was asked for', () => {
    // "contenus abandonnés très vite" is in the brief, and a penalty clamped to
    // zero would make an abandoned title weigh the same as one never opened.
    assert.equal(engagementOf(observed({positionSeconds: 5, durationSeconds: 100})), -0.5);
    assert.equal(engagementOf(observed({positionSeconds: 9, durationSeconds: 100})), -0.5);
  });

  it('does not read a row at zero seconds as a rejection', () => {
    // The player writes its row when playback STARTS, so position 0 is the normal
    // state of a title opened a moment ago. Scoring it as an abandon would let the
    // viewer's freshest click argue against the genres they are watching right
    // now. Zero is the honest weight: nothing learned, nothing punished.
    assert.equal(engagementOf(observed({positionSeconds: 0, durationSeconds: 100})), 0);
    // And the rule must not leak: one second past zero IS evidence.
    assert.equal(engagementOf(observed({positionSeconds: 1, durationSeconds: 100})), -0.5);
  });

  it('reads an unmeasured title from its list, and an unlisted one as nothing', () => {
    // With no position and no duration there is no measurement, so the explicit
    // list is all the evidence there is. A title with neither is not evidence of
    // anything and weighs zero — never a guessed middling value.
    assert.equal(engagementOf(observed({listed: 'favorites'})), 1);
    assert.equal(engagementOf(observed({listed: 'watched'})), 0.7);
    assert.equal(engagementOf(observed({listed: 'watchlist'})), 0.25);
    assert.equal(engagementOf(observed()), 0);
  });

  it('never lets a short measurement overrule an explicit favourite', () => {
    // Two rules disagree here and the code has to pick: the viewer opened it and
    // left, OR the viewer favourited it. "I have not got to it yet" is the
    // reading that does not accuse the viewer of disliking their own favourite.
    assert.equal(engagementOf(observed({positionSeconds: 3, durationSeconds: 100, listed: 'favorites'})), 1);
    assert.equal(engagementOf(observed({positionSeconds: 3, durationSeconds: 100, listed: 'watched'})), 0.7);
    assert.equal(engagementOf(observed({positionSeconds: 0, durationSeconds: 100, listed: 'watchlist'})), 0.25);
  });

  it('falls back to the list when the position cannot be used at all', () => {
    // A duration of zero, or a missing one, is not a duration: every ratio
    // derived from it would be a division by nothing, so the measurement is
    // discarded rather than computed as Infinity or NaN.
    for (const durationSeconds of [0, -1, null, undefined, Number.NaN]) {
      assert.equal(
        engagementOf(observed({positionSeconds: 30, durationSeconds, listed: 'favorites'})),
        1,
        `duration ${String(durationSeconds)} must not produce a measured engagement`,
      );
      assert.equal(
        engagementOf(observed({positionSeconds: 30, durationSeconds})),
        0,
        `duration ${String(durationSeconds)} must not produce a measured engagement`,
      );
    }
  });

  it('uses the shared completion threshold rather than one of its own', () => {
    // Pinned as a NUMBER, so that a change to progressionGuard's threshold shows
    // up here as a failing test rather than as a recommender that quietly
    // disagrees with the player about what was finished.
    assert.equal(COMPLETION_RATIO, 0.95);
    assert.equal(engagementOf(observed({positionSeconds: 0.95, durationSeconds: 1})), 1);
    assert.equal(engagementOf(observed({positionSeconds: 0.9499, durationSeconds: 1})), 0.9499);
  });
});

describe('recencyWeight decays taste without erasing it', () => {
  it('is one for now and one half per half-life', () => {
    assert.equal(recencyWeight(NOW, NOW), 1);
    assert.equal(recencyWeight(NOW - 90 * DAY_MS, NOW), 0.5);
    assert.equal(recencyWeight(NOW - 180 * DAY_MS, NOW), 0.25);
  });

  it('stops decaying at the floor instead of reaching zero', () => {
    // WITHOUT THE FLOOR a viewer who has not watched anything for a year gets an
    // empty profile, and the feature silently switches itself off for exactly the
    // users who most need something to watch. "We have not seen them lately" is
    // not the same statement as "we know nothing about them".
    assert.equal(recencyWeight(NOW - 730 * DAY_MS, NOW), 0.2);
    assert.equal(recencyWeight(NOW - 100_000 * DAY_MS, NOW), 0.2);
    assert.ok(recencyWeight(NOW - 730 * DAY_MS, NOW) > 0, 'an old signal must still count');
  });

  it('gives an unknown age the floor and not the maximum', () => {
    // The timestamp is how we would know it is fresh. Without one, treating the
    // title as fresh would inflate the newest-looking signal in the profile, and
    // treating it as zero would throw a real observation away. The floor is the
    // only reading that neither invents nor discards.
    assert.equal(recencyWeight(null, NOW), 0.2);
    assert.equal(recencyWeight(undefined, NOW), 0.2);
    assert.equal(recencyWeight(Number.NaN, NOW), 0.2);
  });

  it('treats a timestamp in the future as now', () => {
    // Clock skew between the database and the app is not a reason to hand a
    // title a weight above one.
    assert.equal(recencyWeight(NOW + 10 * DAY_MS, NOW), 1);
  });
});

describe('rewatchMultiplier rewards repetition, up to a point', () => {
  it('counts the first view as the baseline and each repeat as a step', () => {
    assert.equal(rewatchMultiplier(1), 1);
    assert.equal(rewatchMultiplier(2), 1.5);
    assert.equal(rewatchMultiplier(3), 2);
    assert.equal(rewatchMultiplier(4), 2.5);
    assert.equal(rewatchMultiplier(5), 3);
  });

  it('caps, so one obsession cannot drown out the rest of the profile', () => {
    // A 60-episode series produces 60 observations. Uncapped, one series would
    // become the entire profile and the recommendations would be that series.
    assert.equal(rewatchMultiplier(60), 3);
    assert.equal(rewatchMultiplier(1000), 3);
  });

  it('reads an unknown or impossible count as a single view', () => {
    // Never as zero: a multiplier of zero would delete an observation we hold.
    for (const count of [0, null, undefined, Number.NaN, -5]) {
      assert.equal(rewatchMultiplier(count), 1, `count ${String(count)} must read as one view`);
    }
    assert.equal(rewatchMultiplier(2.7), 1.5, 'a fractional count is not a view count');
  });
});

describe('buildTasteProfile turns signals into weighted terms', () => {
  it('normalises so the strongest term is exactly one', () => {
    // Normalising by the MAXIMUM and not by the sum: a profile with a negative in
    // it can sum to near zero, and dividing by that would produce weights in the
    // hundreds with the sign of whichever side was slightly larger.
    const profile = buildTasteProfile(
      [finished(1), finished(2)],
      [featured({mediaId: 1, genreIds: [28]}), featured({mediaId: 2, genreIds: [28, 35]})],
      NOW,
    );

    const weights = weightsOf(profile);
    // Genre 28 carries both titles, so it is the heaviest and becomes 1.
    assert.equal(weights.get('genre:28'), 1);
    // Genre 35 carries one, so it is half of the heaviest.
    assert.equal(weights.get('genre:35'), 0.5);
  });

  it('weights a language at half a genre', () => {
    // "French" spans a comedy, a thriller and a documentary: a much coarser
    // statement about taste than a shared genre, and weighted as such instead of
    // letting a viewer's locale outvote what they watch.
    const profile = buildTasteProfile(
      [finished(1)],
      [featured({mediaId: 1, genreIds: [28], originalLanguage: 'en'})],
      NOW,
    );

    const weights = weightsOf(profile);
    assert.equal(weights.get('genre:28'), 1);
    assert.equal(weights.get('language:en'), 0.5);
  });

  it('carries an abandoned title through as a NEGATIVE term', () => {
    // The penalty has to survive into the profile, or "contenus abandonnés très
    // vite" was collected and then thrown away.
    const profile = buildTasteProfile(
      [finished(1), abandoned(2)],
      [featured({mediaId: 1, genreIds: [28]}), featured({mediaId: 2, genreIds: [27]})],
      NOW,
    );

    const weights = weightsOf(profile);
    assert.equal(weights.get('genre:28'), 1);
    assert.equal(weights.get('genre:27'), -0.5);
    assert.ok((weights.get('genre:27') ?? 0) < 0, 'the abandon must stay negative, not be clamped');
  });

  it('folds a rewatch and the recency into the same title weight', () => {
    // The three factors multiply, so a title watched twice this week outweighs one
    // watched once a year ago — and the profile says which of the two rules did it
    // only by this test. Genre 35 here has one recent second viewing; genre 28 has
    // one old single viewing.
    const profile = buildTasteProfile(
      [
        observed({mediaId: 1, positionSeconds: 100, durationSeconds: 100, lastSeenMs: NOW - 365 * DAY_MS}),
        observed({mediaId: 2, positionSeconds: 100, durationSeconds: 100, lastSeenMs: NOW, observationCount: 2}),
      ],
      [featured({mediaId: 1, genreIds: [28]}), featured({mediaId: 2, genreIds: [35]})],
      NOW,
    );

    const weights = weightsOf(profile);
    // Title 2: engagement 1 × recency 1 × rewatch 1.5 = 1.5, the largest.
    // Title 1: engagement 1 × floor 0.2 × rewatch 1 = 0.2.
    assert.equal(weights.get('genre:35'), 1);
    assert.equal(weights.get('genre:28'), 0.2 / 1.5);
  });

  it('counts a title it cannot read instead of guessing its genres', () => {
    // An absent genre list is "we do not know", NOT "this title has no genres".
    // The counts are what let the caller say how much of the history it could
    // actually read, instead of presenting a two-title profile as a complete one.
    const profile = buildTasteProfile(
      [finished(1), finished(2), finished(3)],
      [featured({mediaId: 1, genreIds: [28]})],
      NOW,
    );

    assert.equal(profile.titleCount, 1);
    assert.equal(profile.unknownTitleCount, 2);
    assert.deepEqual(profile.terms, [{termType: 'genre', termId: '28', weight: 1}]);
  });

  it('does not count a title it could read but that said nothing', () => {
    // A row at position 0 was READ and carried no signal. Counting it as unknown
    // would overstate what is missing; counting it as known would overstate what
    // is known. It is neither.
    const profile = buildTasteProfile(
      [observed({mediaId: 1, positionSeconds: 0, durationSeconds: 100, lastSeenMs: NOW})],
      [featured({mediaId: 1, genreIds: [28]})],
      NOW,
    );

    assert.equal(profile.titleCount, 0);
    assert.equal(profile.unknownTitleCount, 0);
    assert.deepEqual(profile.terms, []);
  });

  it('returns an empty profile when every title is unreadable', () => {
    // The honest answer for a history we cannot interpret is no profile — never a
    // profile of zeros that would then render as "0% match" against every title.
    const profile = buildTasteProfile([finished(1), finished(2)], [], NOW);

    assert.deepEqual(profile.terms, []);
    assert.equal(profile.signalWeight, 0);
    assert.equal(profile.titleCount, 0);
    assert.equal(profile.unknownTitleCount, 2);
  });

  it('is deterministic: the same signals produce the same profile', () => {
    // The terms are sorted rather than left in insertion order, so two runs over
    // the same history cannot produce two different profiles.
    const observations = [finished(2), finished(1)];
    const features = [
      featured({mediaId: 1, genreIds: [28, 35]}),
      featured({mediaId: 2, genreIds: [16]}),
    ];

    const first = buildTasteProfile(observations, features, NOW);
    const second = buildTasteProfile([...observations].reverse(), [...features].reverse(), NOW);

    assert.ok(first.terms.length > 0, 'the fixture must build a profile, or this proves nothing');
    assert.deepEqual(first.terms, second.terms);
  });

  it('adds a genre to a title that has no language without inventing one', () => {
    const profile = buildTasteProfile(
      [finished(1)],
      [featured({mediaId: 1, genreIds: [28], originalLanguage: ''})],
      NOW,
    );

    assert.deepEqual(
      profile.terms.map((term) => term.termType),
      ['genre'],
      'an empty language string is not a language',
    );
  });

  it('keeps a film and a series that share an id apart', () => {
    // TMDB ids are namespaced per type: film 550 and series 550 are different
    // works. Matching them by id alone would read one's genres off the other.
    const profile = buildTasteProfile(
      [
        observed({mediaType: 'movie', mediaId: 550, positionSeconds: 100, durationSeconds: 100, lastSeenMs: NOW}),
        abandoned(550, {mediaType: 'tv'}),
      ],
      [
        {mediaType: 'movie', mediaId: 550, genreIds: [28]},
        {mediaType: 'tv', mediaId: 550, genreIds: [27]},
      ],
      NOW,
    );

    const weights = weightsOf(profile);
    assert.equal(weights.get('genre:28'), 1);
    assert.equal(weights.get('genre:27'), -0.5);
  });
});

describe('affinityScore measures, and says when it cannot', () => {
  /** A viewer who finished one film: genre 28, language en. */
  const singleTitleProfile = (): TasteProfile =>
    buildTasteProfile(
      [finished(1)],
      [featured({mediaId: 1, genreIds: [28], originalLanguage: 'en'})],
      NOW,
    );

  it('computes the share of the profile a candidate carries', () => {
    // THE WORKED EXAMPLE, so the formula on screen is arithmetic and not a
    // mystery: the profile holds genre 28 at 1 and language en at 0.5, so its
    // positive mass is 1.5. A candidate with both carries all of it.
    const profile = singleTitleProfile();

    assert.equal(affinityScore(featured({genreIds: [28], originalLanguage: 'en'}), profile), 100);
    assert.equal(affinityScore(featured({genreIds: [28]}), profile), 67);
    assert.equal(affinityScore(featured({genreIds: [], originalLanguage: 'en'}), profile), 33);
    assert.equal(affinityScore(featured({genreIds: [35]}), profile), 0);
  });

  it('returns zero when nothing matched, because that IS the measurement', () => {
    // The comparison happened and found nothing shared. Reporting `null` here
    // would hide a real answer behind an absence.
    assert.equal(affinityScore(featured({genreIds: [16, 99]}), singleTitleProfile()), 0);
  });

  it('returns null, never zero, when the candidate cannot be read', () => {
    // A candidate with no genres is a candidate we could not fetch metadata for.
    // Ranking it 0 would state "you will not like this", which is a claim we
    // cannot support; `null` says "we could not score this", which is true.
    const profile = singleTitleProfile();

    assert.equal(affinityScore(featured({genreIds: []}), profile), null);
    assert.equal(affinityScore(featured({genreIds: [], originalLanguage: null}), profile), null);
    assert.equal(affinityScore(featured({genreIds: [], originalLanguage: ''}), profile), null);
  });

  it('returns null when the profile has nothing positive to compare against', () => {
    // A viewer whose only signal is an abandoned title has no positive taste to
    // match. A percentage here would be invented, and §3 forbids it.
    const abandonedOnly = buildTasteProfile(
      [abandoned(1)],
      [featured({mediaId: 1, genreIds: [27]})],
      NOW,
    );

    assert.equal(abandonedOnly.terms.length, 1, 'the fixture must carry the negative term');
    assert.equal(affinityScore(featured({genreIds: [27]}), abandonedOnly), null);
    assert.equal(affinityScore(featured({genreIds: [28]}), abandonedOnly), null);
  });

  it('does not subtract, for a candidate sharing an abandoned genre', () => {
    // The penalty's work is already done: it lowered genre 27's weight in the
    // profile. Subtracting again would let one abandoned title veto a candidate
    // that also shares four genres the viewer finished.
    const profile = buildTasteProfile(
      [finished(1), abandoned(2)],
      [featured({mediaId: 1, genreIds: [28]}), featured({mediaId: 2, genreIds: [27]})],
      NOW,
    );

    assert.equal(affinityScore(featured({genreIds: [28, 27]}), profile), 100);
    assert.equal(affinityScore(featured({genreIds: [27]}), profile), 0);
  });

  it('never leaves the range a percentage can be displayed in', () => {
    const profile = buildTasteProfile(
      [finished(1), finished(2)],
      [
        featured({mediaId: 1, genreIds: [28, 35, 16]}),
        featured({mediaId: 2, genreIds: [28, 35]}),
      ],
      NOW,
    );

    for (const genreIds of [[28], [28, 35], [28, 35, 16, 99], [99], []]) {
      const score = affinityScore(featured({genreIds}), profile);
      if (score === null) continue;
      assert.ok(score >= 0 && score <= 100, `${genreIds.join(',')} produced ${score}`);
      assert.equal(score, Math.round(score), 'a displayed percentage must be a whole number');
    }
  });
});

describe('a title is named by its type AND its id, everywhere', () => {
  it('builds the key from both parts, so a film cannot answer for a series', () => {
    // TMDB ids are namespaced per type, and `titleKey` is the single place that
    // says so. Two callers spelling this differently is how a series ends up
    // matched against a film's genres.
    assert.equal(titleKey('movie', 1399), 'movie:1399');
    assert.equal(titleKey('tv', 1399), 'tv:1399');
    assert.notEqual(titleKey('movie', 1399), titleKey('tv', 1399));
  });

  it('lists what the viewer has already seen, for the caller to exclude', () => {
    // The filter "do not recommend what they have already watched" belongs to the
    // caller, which holds both its own history and the candidates — but the KEYS
    // it filters on come from here, so the two sides cannot disagree about what
    // counts as the same title.
    assert.deepEqual(seenTitleKeys([finished(1), abandoned(2, {mediaType: 'tv'})]), [
      'movie:1',
      'tv:2',
    ]);
    assert.deepEqual(seenTitleKeys([]), []);
  });
});

describe('observationWeight multiplies the three rules into one number', () => {
  it('is one for a finished title watched once, just now', () => {
    // The baseline every other case is read against: no rule has anything to add.
    assert.equal(observationWeight(finished(1), NOW), 1);
  });

  it('raises it for a repeat and lowers it for an old viewing', () => {
    assert.equal(observationWeight(finished(1, {observationCount: 3}), NOW), 2);
    assert.equal(observationWeight(finished(1, {lastSeenMs: NOW - 90 * DAY_MS}), NOW), 0.5);
  });

  it('compounds them rather than choosing between them', () => {
    // A title watched twice, six months ago, to the end: 1 × 0.25 × 1.5. A rule
    // that took the largest of the three instead of the product would let one
    // recent-but-abandoned title outrank a finished one, which is the whole
    // ordering this module exists to get right.
    assert.equal(
      observationWeight(
        finished(1, {lastSeenMs: NOW - 180 * DAY_MS, observationCount: 2}),
        NOW,
      ),
      0.375,
    );
  });

  it('carries the abandon through as a negative, not as an absent signal', () => {
    assert.equal(observationWeight(abandoned(1), NOW), -0.5);
    // And a title with no evidence at all weighs exactly nothing — the value a
    // caller must treat as "not measured" rather than as "measured as zero".
    assert.equal(observationWeight(observed(), NOW), 0);
  });
});

describe('hasEnoughSignal refuses to call one evening a taste', () => {
  it('needs three readable titles, the same floor the endpoint already uses', () => {
    const two = buildTasteProfile(
      [finished(1), finished(2)],
      [featured({mediaId: 1, genreIds: [28]}), featured({mediaId: 2, genreIds: [28]})],
      NOW,
    );
    assert.equal(two.titleCount, 2, 'the fixture must be readable, or this proves the wrong thing');
    assert.equal(hasEnoughSignal(two), false);

    const three = buildTasteProfile(
      [finished(1), finished(2), finished(3)],
      [
        featured({mediaId: 1, genreIds: [28]}),
        featured({mediaId: 2, genreIds: [28]}),
        featured({mediaId: 3, genreIds: [35]}),
      ],
      NOW,
    );
    assert.equal(three.titleCount, 3, 'the fixture must be readable, or this proves the wrong thing');
    assert.equal(hasEnoughSignal(three), true);
  });

  it('counts only what it could READ, not what it was given', () => {
    // Ten titles whose metadata we could not fetch is not a taste, and counting
    // them as signal is how a profile built from nothing starts recommending.
    const unreadable = buildTasteProfile(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((mediaId) => finished(mediaId)),
      [],
      NOW,
    );

    assert.equal(unreadable.unknownTitleCount, 10);
    assert.equal(hasEnoughSignal(unreadable), false);
  });
});
