/**
 * WHAT A VIEWER'S HISTORY SAYS ABOUT THEIR TASTE — pure, and the only place that
 * decides it.
 *
 * ─── WHY THIS IS A MODULE AND NOT A QUERY ────────────────────────────────────
 *
 * The product question is "what does this person like", and the tempting answer
 * is a `GROUP BY genre` over the history. That answer is wrong in a way nobody
 * notices, because a `GROUP BY` counts TITLES and a viewer's titles are not a
 * sample of their taste: a 60-episode series left at episode 3 contributes
 * exactly as much as a film watched to the end, and a title opened for forty
 * seconds and abandoned contributes as much as a favourite.
 *
 * So the arithmetic is written down here, as pure functions over plain values,
 * for three reasons:
 *
 *   1. It can be TESTED. Every rule below — the completion threshold, the
 *      abandon penalty, the recency decay, the rewatch multiplier — fails
 *      SILENTLY in production: a wrong weight produces a plausible list of
 *      recommendations that nobody can tell is wrong by looking at it. This is
 *      the same trap as the dashboard's `0min`, and the answer is the same: put
 *      the number where a test can reach it.
 *   2. It can be AUDITED. The user's brief forbids a displayed figure that is not
 *      a measurement (§3). A percentage next to a recommendation is a figure, so
 *      the functions below return `null` — not 0 — whenever the number cannot be
 *      computed, and the caller is required to render nothing rather than a zero.
 *   3. It has ONE definition of "finished". `COMPLETION_RATIO` is imported from
 *      `lib/progressionGuard.ts` rather than restated, because a second copy of
 *      0.95 would drift and then disagree with the player about what "completed"
 *      means.
 *
 * ─── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────
 *
 * No database, no network, no clock of its own: `nowMs` is passed in, so a test
 * can pin the recency decay instead of watching it move. No TMDB: a title whose
 * genres we do not have contributes NOTHING and is COUNTED as unknown, so the
 * caller can say "we could not read this one" instead of treating an absent
 * genre list as "this title has no genres".
 *
 * Pure module: tested in tests/tasteSignals.test.ts.
 */

import { COMPLETION_RATIO } from './progressionGuard';

export type MediaType = 'movie' | 'tv';

/** The explicit lists a title can be on. Preference stated, not inferred. */
export type ListedAs = 'watched' | 'watchlist' | 'favorites';

/**
 * ONE TITLE this owner has interacted with, as read out of the history tables.
 *
 * Every optional field means "not measured". Nothing here defaults to a number,
 * because a default is what turns "we do not know" into "zero" — and a zero
 * weight is indistinguishable from a title nobody watched.
 */
export interface TasteObservation {
  readonly mediaType: MediaType;
  readonly mediaId: number;
  /** Measured playback position, in seconds. */
  readonly positionSeconds?: number | null;
  /** Total duration, in seconds. Present only alongside a measured position. */
  readonly durationSeconds?: number | null;
  /** Total minutes credited to this title, across everything that watched it. */
  readonly minutesWatched?: number | null;
  /**
   * How many separate observations exist for this title — a rewatch, or several
   * episodes of the same series. Unknown is treated as 1, never as 0.
   */
  readonly observationCount?: number | null;
  /** Epoch ms of the most recent observation. */
  readonly lastSeenMs?: number | null;
  /** The explicit list this title is on, when it is on one. */
  readonly listed?: ListedAs | null;
}

/** The metadata a term can be derived from. Fetched from TMDB, cached locally. */
export interface TitleFeatures {
  readonly mediaType: MediaType;
  readonly mediaId: number;
  readonly genreIds: readonly number[];
  readonly originalLanguage?: string | null;
}

/** One weighted term of the profile. Weight may be negative — see ABANDON. */
export interface TasteTerm {
  readonly termType: 'genre' | 'language';
  readonly termId: string;
  readonly weight: number;
}

/**
 * A profile, WITH the counts needed to be honest about it.
 *
 * `unknownTitleCount` is not decoration: it is the number of titles that carry
 * signal but that we could not read genres for. A caller that hides it would be
 * presenting a profile built from 2 of 40 titles as if it were built from all 40.
 */
export interface TasteProfile {
  readonly terms: readonly TasteTerm[];
  /** Titles that contributed: they had features and were counted. */
  readonly titleCount: number;
  /** Titles that could not contribute, because their features are unknown. */
  readonly unknownTitleCount: number;
  /** Σ |weight| over every term: the confidence the caller gates on. */
  readonly signalWeight: number;
}

/**
 * ABANDONED EARLY, AND IT IS A NEGATIVE.
 *
 * The brief asks for "contenus abandonnés très vite" as a signal, and the only
 * honest way to use it is a NEGATIVE weight: the viewer opened it and left, so
 * the genres it is made of are evidence against the profile. Clamping it to zero
 * would make an abandoned title weigh the same as one never opened, which
 * discards the signal the feature was requested for.
 *
 * It is applied ONLY when nothing explicit contradicts it — a title on
 * `favorites` is not abandoned, however little of it was watched. That ordering
 * is the difference between "the viewer disliked this" and "the viewer has not
 * got to it yet".
 */
export const QUICK_ABANDON_RATIO = 0.1;
export const QUICK_ABANDON_WEIGHT = -0.5;

/**
 * ZERO SECONDS IS NOT AN ABANDONMENT.
 *
 * The player writes its history row when playback STARTS, so a row at position 0
 * is the normal state of a title opened a moment ago — and of one opened and
 * immediately closed. Those two are indistinguishable from the position alone, so
 * the only honest weight is zero: nothing to learn, nothing to punish. Treating it
 * as a negative would let a viewer's freshest click — the strongest evidence they
 * have, and the most likely to be a half-written row — argue against the genres
 * they are watching right now.
 *
 * A position above zero and below the abandon ratio is a different statement: the
 * viewer moved through the title and stopped, which is evidence.
 */

/**
 * RECENCY: a half-life of 90 days, with a floor of 0.2.
 *
 * The floor is the load-bearing part. Without it, taste decays to nothing and a
 * viewer who has not watched anything for a year gets an empty profile — which
 * is not what "we have not seen them lately" means, and which would silently
 * switch off every recommendation for the quietest users. The unknown-age case
 * gets the SAME floor and not the maximum: an observation with no timestamp
 * cannot be shown to be fresh, and treating it as fresh would inflate it.
 */
export const RECENCY_HALF_LIFE_DAYS = 90;
export const RECENCY_FLOOR = 0.2;

/**
 * REWATCH: one extra step per repeat, capped so a series watched five times does
 * not drown out everything else in the profile. Steps and not a free multiplier,
 * because the difference between 1 and 2 views is a real signal and the
 * difference between 20 and 21 is not.
 */
export const REWATCH_STEP = 0.5;
export const REWATCH_MAX_STEPS = 4;

/**
 * A LANGUAGE IS WEAKER EVIDENCE THAN A GENRE, at half weight.
 *
 * "French" spans a comedy, a thriller and a documentary, so a shared language is
 * a much coarser statement about taste than a shared genre. Weighting the two
 * equally would let a viewer's locale outvote what they actually watch.
 */
export const LANGUAGE_TERM_SHARE = 0.5;

const DAY_MS = 24 * 60 * 60 * 1000;

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/** The explicit list, as a weight, or null when the title is on none. */
const explicitWeight = (listed: ListedAs | null | undefined): number | null => {
  switch (listed) {
    case 'favorites':
      return 1;
    case 'watched':
      return 0.7;
    case 'watchlist':
      // Intent, not evidence. The viewer put it aside; they have not watched it.
      return 0.25;
    default:
      return null;
  }
};

/**
 * HOW MUCH THIS TITLE COUNTED, before recency and repeats.
 *
 * Measured playback wins, because it is the only thing here that is a
 * measurement rather than a statement. Unmeasured, the explicit list is all we
 * have. Neither, and the title weighs zero — it is not evidence of anything.
 */
export const engagementOf = (observation: TasteObservation): number => {
  const explicit = explicitWeight(observation.listed);

  const position = observation.positionSeconds;
  const duration = observation.durationSeconds;
  const measured =
    typeof position === 'number' &&
    Number.isFinite(position) &&
    typeof duration === 'number' &&
    Number.isFinite(duration) &&
    duration > 0;

  if (!measured) return explicit ?? 0;

  const ratio = clamp01(position / duration);
  if (ratio >= COMPLETION_RATIO) return 1;

  // Abandoned: a real negative, but only against silence, and never at zero
  // seconds — see QUICK_ABANDON_WEIGHT and ZERO SECONDS IS NOT AN ABANDONMENT.
  // An explicit positive outranks a short measurement either way.
  if (ratio < QUICK_ABANDON_RATIO) {
    if (explicit !== null) return explicit;
    return position > 0 ? QUICK_ABANDON_WEIGHT : 0;
  }

  return explicit === null ? ratio : Math.max(ratio, explicit);
};

/** The recency factor, in [RECENCY_FLOOR, 1]. See RECENCY_HALF_LIFE_DAYS. */
export const recencyWeight = (lastSeenMs: number | null | undefined, nowMs: number): number => {
  if (typeof lastSeenMs !== 'number' || !Number.isFinite(lastSeenMs)) return RECENCY_FLOOR;

  const ageDays = Math.max(0, (nowMs - lastSeenMs) / DAY_MS);
  return Math.max(RECENCY_FLOOR, Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS));
};

/** The repeat factor, in [1, 1 + REWATCH_STEP * REWATCH_MAX_STEPS]. */
export const rewatchMultiplier = (observationCount: number | null | undefined): number => {
  const count =
    typeof observationCount === 'number' && Number.isFinite(observationCount)
      ? Math.max(1, Math.floor(observationCount))
      : 1;
  return 1 + REWATCH_STEP * Math.min(count - 1, REWATCH_MAX_STEPS);
};

/** The weight one observation contributes, sign included. */
export const observationWeight = (observation: TasteObservation, nowMs: number): number =>
  engagementOf(observation) *
  recencyWeight(observation.lastSeenMs, nowMs) *
  rewatchMultiplier(observation.observationCount);

/** The key a title is identified by, so two callers cannot spell it differently. */
export const titleKey = (mediaType: MediaType, mediaId: number): string => `${mediaType}:${mediaId}`;

/** The keys of every title this owner has already interacted with. */
export const seenTitleKeys = (observations: readonly TasteObservation[]): string[] =>
  observations.map((observation) => titleKey(observation.mediaType, observation.mediaId));

/**
 * The profile: every term, weighted by what the history actually says.
 *
 * Weights are NORMALISED so the largest absolute weight is 1. Normalising by the
 * maximum and not by the sum is what keeps a negative from cancelling a positive:
 * the sum of a mixed profile can be near zero, and dividing by it would produce
 * weights in the hundreds with the sign of whoever was slightly larger.
 *
 * An observation whose features are unknown contributes nothing and is counted as
 * unknown. An observation whose weight is exactly zero contributes nothing and is
 * NOT counted as unknown — it was read, it simply said nothing.
 */
export const buildTasteProfile = (
  observations: readonly TasteObservation[],
  features: readonly TitleFeatures[],
  nowMs: number,
): TasteProfile => {
  const featuresByKey = new Map<string, TitleFeatures>();
  for (const entry of features) {
    featuresByKey.set(titleKey(entry.mediaType, entry.mediaId), entry);
  }

  const buckets = new Map<
    string,
    { termType: 'genre' | 'language'; termId: string; weight: number }
  >();

  const accumulate = (termType: 'genre' | 'language', termId: string, weight: number): void => {
    const key = `${termType}:${termId}`;
    const current = buckets.get(key);
    if (current) current.weight += weight;
    else buckets.set(key, { termType, termId, weight });
  };

  let titleCount = 0;
  let unknownTitleCount = 0;

  for (const observation of observations) {
    const entry = featuresByKey.get(titleKey(observation.mediaType, observation.mediaId));
    const hasGenres = entry !== undefined && entry.genreIds.length > 0;
    const language = entry?.originalLanguage;

    if (!entry || (!hasGenres && (typeof language !== 'string' || language === ''))) {
      // Nothing to attribute this title to. It is not evidence, and it is not
      // silently treated as "no genres": it is counted, so the caller can say so.
      unknownTitleCount += 1;
      continue;
    }

    const weight = observationWeight(observation, nowMs);
    if (weight === 0) continue;

    if (hasGenres) {
      for (const genreId of entry.genreIds) accumulate('genre', String(genreId), weight);
    }
    if (typeof language === 'string' && language !== '') {
      accumulate('language', language, weight * LANGUAGE_TERM_SHARE);
    }
    titleCount += 1;
  }

  const raw = [...buckets.values()];
  const largest = raw.reduce((max, term) => Math.max(max, Math.abs(term.weight)), 0);

  const terms: TasteTerm[] =
    largest === 0
      ? []
      : raw
          .map((term) => ({
            termType: term.termType,
            termId: term.termId,
            weight: term.weight / largest,
          }))
          // A deterministic order, so two runs over the same signals produce the
          // same profile and a test can compare them.
          .sort((a, b) =>
            a.termType === b.termType
              ? a.termId.localeCompare(b.termId)
              : a.termType.localeCompare(b.termType),
          );

  return {
    terms,
    titleCount,
    unknownTitleCount,
    signalWeight: terms.reduce((sum, term) => sum + Math.abs(term.weight), 0),
  };
};

/**
 * HOW MUCH OF THIS VIEWER'S TASTE A CANDIDATE COVERS, in whole percent — or null.
 *
 * THE FORMULA, stated plainly because it is displayed as a percentage: the sum of
 * the profile's POSITIVE weights carried by the candidate's genres and language,
 * divided by the sum of ALL positive weights in the profile. So 40 means "40% of
 * the taste mass we have measured for you lies in what this title is made of".
 *
 * It returns NULL, NEVER 0, in each case where the number would not be a
 * measurement:
 *
 *   - the profile has no positive weight at all (nothing to compare against);
 *   - the candidate's features are unknown, so it cannot be compared — and a
 *     candidate we cannot score must be left out rather than ranked last, because
 *     "we could not read this" and "you will not like this" are different
 *     statements and only one of them is true.
 *
 * Nothing matched is NOT one of those cases: there, 0 IS the honest answer and is
 * returned, because the comparison happened and the result was nothing.
 *
 * Negative weights are clamped out rather than subtracted: a shared genre with a
 * title they abandoned is not evidence against a candidate that also shares four
 * genres they finished. The penalty's job is to hold those genres back in the
 * profile, which it has already done by lowering their weight.
 */
export const affinityScore = (candidate: TitleFeatures, profile: TasteProfile): number | null => {
  const positiveTotal = profile.terms.reduce(
    (sum, term) => (term.weight > 0 ? sum + term.weight : sum),
    0,
  );
  if (positiveTotal <= 0) return null;

  const hasLanguage =
    typeof candidate.originalLanguage === 'string' && candidate.originalLanguage !== '';
  if (candidate.genreIds.length === 0 && !hasLanguage) return null;

  const weights = new Map<string, number>();
  for (const term of profile.terms) weights.set(`${term.termType}:${term.termId}`, term.weight);

  let matched = 0;
  for (const genreId of candidate.genreIds) {
    const weight = weights.get(`genre:${genreId}`);
    if (typeof weight === 'number' && weight > 0) matched += weight;
  }
  if (hasLanguage) {
    const weight = weights.get(`language:${candidate.originalLanguage}`);
    if (typeof weight === 'number' && weight > 0) matched += weight;
  }

  return Math.round((100 * matched) / positiveTotal);
};

/**
 * Enough signal to recommend from, or not.
 *
 * The same threshold the recommendation endpoint already refuses below: fewer
 * than three titles is not a taste, and answering anyway would be a preference
 * invented from a single evening.
 */
export const MIN_TITLES_FOR_RECOMMENDATION = 3;

export const hasEnoughSignal = (profile: TasteProfile): boolean =>
  profile.titleCount >= MIN_TITLES_FOR_RECOMMENDATION;
