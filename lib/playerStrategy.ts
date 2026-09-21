/**
 * WHICH PROVIDER MOVEO OFFERS, FOR WHICH KIND OF CONTENT, IN WHICH ORDER — AND
 * WHY. Pure module: no React, no DOM, no network. Tested in
 * tests/playerStrategy.test.ts.
 *
 * WHY THIS EXISTS AS A SEPARATE MODULE RATHER THAN A FIELD ON EACH PROVIDER.
 *
 * A provider's ROLE is not intrinsic to the provider: SmashyStream is the first
 * choice for a Western film and the second choice for a Korean drama. A single
 * `role` field on the provider entry therefore cannot express the strategy, and
 * a per-provider duplicate of the order would be a second source of truth that
 * could disagree with it. What IS intrinsic — identity, URL grammar, origins,
 * measured capabilities — stays in lib/providers.ts. What is a DECISION about
 * ordering lives here, in exactly one place, as the ordered candidate lists
 * below. There is one provider registry and one selection rule; this module
 * adds no third thing.
 *
 * THE EVIDENCE BEHIND EACH ORDER. Every ordering claim traces to a measurement
 * recorded in lib/providers.ts. Nothing here is inferred from a provider's own
 * marketing, from its name, or from a "VF"/"VOSTFR" label — see the French and
 * English note at the bottom of this file for why those labels are explicitly
 * NOT evidence.
 *
 *   SmashyStream — playbackObserved "yes" by DIRECT media-element measurement:
 *     Fight Club at 8348.4s / 1280x534 and Breaking Bad "Pilot" at 3479.9s /
 *     1280x720, with decoded frame dimensions, which an iframe alone cannot
 *     produce. It is also the only provider with specials "yes", measured
 *     resolving TMDB season 0 to the CORRECT special rather than silently
 *     substituting S1E1. And it is the only provider for which playback was
 *     confirmed INSIDE A REAL MOVEO JOURNEY: framing /movie/550 in our own page,
 *     its own on-screen timecode advanced 0:06 -> 0:16 against a duration of
 *     2:19:08 (Fight Club's true runtime), with visibly different decoded frames
 *     between the two samples, while two user-activation clicks spawned ZERO
 *     popups.
 *
 *   VidLink — playbackObserved "yes" (DASH manifest, init segments, 14
 *     consecutive chunk-stream segments) and subtitles "yes": a subtitle file
 *     was fetched and the manifest carried three streams, i.e. multiple audio
 *     tracks. That audio/subtitle evidence is the only measured language
 *     evidence in the registry, and it was observed FOR KOREAN AND FOR ANIME
 *     specifically — which is why this provider leads the Korean and anime
 *     orders and takes second place for Western content.
 *     RECORDED WEAKNESS: its own on-screen Play control did not start playback
 *     under emulated input while the element's own play() resolved and ran.
 *     Click interception was ruled out — document.elementFromPoint at the video
 *     centre returns the VIDEO, with no overlay link above it — so the cause is
 *     undetermined. An unexplained interaction defect is why it does not lead
 *     the content classes where SmashyStream has direct evidence.
 *
 *   Frembed — LAST in every automatic order, and never the default. It carries
 *     the BROADEST resolution measured of any provider (all four content classes
 *     by TMDB id) and the only REPRODUCED French subtitle track (`_fr.srt` ->
 *     200, seen on two separate runs). None of that is why it is last. It is
 *     last because:
 *       - its playback observation DID NOT REPRODUCE. One run streamed a
 *         master playlist and segments 1-7; a re-run an hour later from a fresh
 *         context at the direct embed URL fetched NO manifest at all, with
 *         pre-roll advertising running into hundreds of requests instead.
 *       - re-measured in a real Moveo journey (the same journey that confirmed
 *         SmashyStream) it produced NO playback across two user-activation
 *         attempts, spawned THREE popup tabs (an interstitial and a redirect to
 *         YouTube), emitted ad beacons to four third-party hosts, and ran
 *         AdScore anti-bot — and its "SERVEURS" control opened no server list.
 *     `playbackObserved` stays "unknown" there for a separate, stricter reason:
 *     its player is cross-origin, so the media-element read that flag requires is
 *     impossible. Being last is a UX-and-reliability judgement, not a claim that
 *     it never plays.
 *
 *   VidSrc.to, VidSrc.me, 2Embed — MANUAL_ONLY. vidsrc.to resolved the correct
 *     Korean episode title but produced no playback within ~14s of its own Play
 *     being clicked; vidsrc.me is the same upstream player as vidsrc.to and its
 *     host is mid-migration; 2embed's player area was an about:blank iframe plus
 *     a redirect layer, with no media observed. Each is a legitimate thing for a
 *     user to TRY, and none has evidence strong enough to be chosen FOR the
 *     user. They are offered, never automatic.
 *
 *   SuperEmbed — REMOVED from the registry entirely, not merely demoted, so it
 *     appears nowhere here. Measured 2026-09-21: framing it displayed ADULT
 *     ADVERTISING inside our own player — its content for a Korean drama episode
 *     was an adult webcam landing page reached via redirectors, with a
 *     Cloudflare Turnstile challenge retry-looping in the frame. Offering a
 *     button that can show adult content under Moveo's branding is a
 *     product-safety defect, not a quality trade-off, and a provider that cannot
 *     play the content it was chosen for does not materially improve viewing
 *     success. Removing the entry also removed its two origins from `frame-src`
 *     (see next.config.ts), which narrows our own policy — the same standard
 *     applies to every origin. Reverting is deliberate, not incidental: it needs
 *     a fresh measurement and a registry entry, and tests/csp.test.ts will refuse
 *     the origins back.
 *
 * THE INVARIANT THIS MODULE MUST NEVER BREAK, restated because it is the whole
 * point of the player's state machine: a user's manual choice is AUTHORITATIVE.
 * Nothing here may be used to displace a manual selection — the reducer enforces
 * that (lib/playerState.ts, SELECT_AUTO returns state unchanged when
 * `selection === "manual"`), and every function below is a *candidate* proposer
 * that the caller may ignore. This module never decides what is displayed; it
 * only says what would be tried next.
 */

import {
  PROVIDERS,
  SBNET_VF_NAME,
  SBNET_VOSTFR_NAME,
  type MediaType,
} from "./providers";

/**
 * The five content classes Moveo actually serves, named the way the product
 * brief names them: movies, Western TV, Korean drama, anime movies, anime
 * series.
 *
 * WHY ANIME AND KOREAN ARE CLASSES RATHER THAN A TAG. The default provider
 * genuinely differs between them (see the orders below), because the measured
 * evidence differs: the only provider with measured multi-audio and subtitle
 * capability measured it for Korean and anime. Folding anime into "tv" would
 * make that a hidden side effect of generic TV logic, which is exactly what the
 * brief forbids. The classes are derived from TMDB facts the pages already have
 * (`original_language` plus the Animation genre id), not stored as new data and
 * not guessed from a provider's own category labels.
 */
export type ContentClass =
  | "movie"
  | "western-tv"
  | "korean"
  | "anime-movie"
  | "anime-series";

/**
 * A provider's position in the automatic order for one content class.
 *
 *   PRIMARY            — first choice. Chosen for the user.
 *   FALLBACK           — second choice, used when the primary fails.
 *   SECONDARY_FALLBACK — third choice. Still automatic, still last.
 *   MANUAL_ONLY        — offered to the user, NEVER chosen for them.
 *
 * There is no DISABLED or REMOVE member: a provider in either of those states is
 * not in the registry at all, and a role value for something that cannot be
 * named is dead weight that would have to be filtered at every read site. A
 * removal is expressed the way the codebase expresses every other removal — by
 * the entry's absence — with the reason recorded above and in
 * docs/player-strategy.md.
 */
export type ProviderRole =
  | "PRIMARY"
  | "FALLBACK"
  | "SECONDARY_FALLBACK"
  | "MANUAL_ONLY";

/** TMDB's Animation genre id, used to tell anime from live-action. */
export const ANIMATION_GENRE_ID = 16;

/**
 * The automatic order, per content class. ONE declaration, read by everything.
 *
 * An entry omitted from every list below is MANUAL_ONLY by construction:
 * `roleOf` returns MANUAL_ONLY for anything not found, so a newly added provider
 * defaults to the SAFE end — offered, never automatic — instead of silently
 * becoming someone's default source.
 */
const ORDER_BY_CLASS: Readonly<Record<ContentClass, readonly string[]>> = {
  // A Western film. SmashyStream first on the strength of the in-journey
  // confirmation on /movie/550: advancing timecode, correct 2:19:08 runtime,
  // zero popups.
  movie: ["SmashyStream", "VidLink", "Frembed"],

  // Western (non-Korean, non-anime) television. Same reasoning, and
  // SmashyStream's Breaking Bad "Pilot" measurement is a TV episode resolved to
  // its correct 3479.9s runtime.
  "western-tv": ["SmashyStream", "VidLink", "Frembed"],

  // Korean drama. VidLink leads here, and the reason is specific to Korean: it
  // is the only provider measured carrying multiple audio streams AND a subtitle
  // track, and that measurement was made ON KOREAN CONTENT. For this class the
  // crux is which audio and subtitle tracks exist, so the provider with evidence
  // about tracks outranks the provider with evidence about playback.
  korean: ["VidLink", "SmashyStream", "Frembed"],

  // Anime movie and anime series. VidLink leads for the same measured reason:
  // its multi-audio and subtitle observation covered ANIME as well as Korean,
  // and anime depends on the original Japanese audio track being present rather
  // than on a dub. Season/specials handling is separate — see providerOrder.
  "anime-movie": ["VidLink", "SmashyStream", "Frembed"],
  "anime-series": ["VidLink", "SmashyStream", "Frembed"],
};

/**
 * Providers MEASURED to resolve TMDB season 0 (specials) to the correct episode.
 *
 * Derived from the registry rather than listed again, so this follows the
 * measurement: when another provider's `capabilities.specials` becomes "yes", it
 * joins the front of the specials order with no edit here.
 */
export const SPECIALS_CAPABLE: readonly string[] = PROVIDERS.filter(
  (provider) => provider.capabilities.specials === "yes",
).map((provider) => provider.name);

/**
 * Every provider named in any automatic order — i.e. everything that is not
 * MANUAL_ONLY. Derived, so adding a name to one class list above is the only
 * edit needed to make that provider automatic.
 */
const AUTOMATIC: ReadonlySet<string> = new Set(
  Object.values(ORDER_BY_CLASS).flat(),
);

export interface StrategyContext {
  contentClass: ContentClass;
  /**
   * True when the user is looking at TMDB season 0 (SPECIALS).
   *
   * WHY THIS REORDERS: a provider that resolves season 0 to the WRONG episode is
   * worse than one that fails, because the wrong episode looks right and nothing
   * in the UI signals the substitution. Where a provider is measured to resolve
   * specials correctly it is promoted ahead of providers whose specials
   * behaviour is unmeasured for this title. This only ever REORDERS the existing
   * class list; it can never introduce a provider the class order does not
   * already contain.
   */
  specials?: boolean;
}

/**
 * Derives the content class from TMDB facts the detail pages already hold.
 *
 * Deliberately conservative: anything not positively identified as Korean or
 * anime falls through to the generic class for its media type. A wrong "korean"
 * would send a Western film to the Korean order, so the eventual tests are
 * asymmetrical — the positive cases must be certain, and the fallback must be
 * safe.
 *
 * `originalLanguage` is matched case-insensitively and trimmed, because TMDB and
 * the pages' own query params are not guaranteed to agree on case.
 */
export const deriveContentClass = ({
  type,
  originalLanguage,
  genreIds,
}: {
  type: MediaType | string;
  originalLanguage?: string | null;
  genreIds?: readonly number[] | null;
}): ContentClass => {
  const language =
    typeof originalLanguage === "string" ? originalLanguage.trim().toLowerCase() : "";
  const animated =
    Array.isArray(genreIds) && genreIds.includes(ANIMATION_GENRE_ID);
  const isMovie = type === "movie";

  // Korean is checked BEFORE anime: a Korean animated title is still Korean
  // drama by the product's own taxonomy, and anime is defined by Japanese
  // origin, so the two conditions cannot both be the answer.
  if (language === "ko") return "korean";
  if (language === "ja" && animated) {
    return isMovie ? "anime-movie" : "anime-series";
  }
  return isMovie ? "movie" : "western-tv";
};

/**
 * The automatic order for this content class, specials-aware.
 *
 * Returns only providers that are genuinely in the registry, so a name removed
 * from lib/providers.ts cannot linger here and be handed to the player as a
 * source it cannot build a URL for.
 */
export const providerOrder = ({
  contentClass,
  specials = false,
}: StrategyContext): readonly string[] => {
  const known = new Set(PROVIDERS.map((provider) => provider.name));
  const base = ORDER_BY_CLASS[contentClass].filter((name) => known.has(name));
  if (!specials) return base;

  // Stable partition: specials-capable providers first, in their existing
  // relative order, then the rest in theirs. A provider not measured as
  // specials-capable is not demoted out of the list — "unknown" is not "no", and
  // demoting on an absence of measurement would be exactly the false claim this
  // codebase's capability type exists to prevent.
  const capable = base.filter((name) => SPECIALS_CAPABLE.includes(name));
  const rest = base.filter((name) => !SPECIALS_CAPABLE.includes(name));
  return [...capable, ...rest];
};

/**
 * The providers offered to the user: automatic ones first in strategy order,
 * then the MANUAL_ONLY ones in registry order.
 *
 * This is the order the source buttons render in, so the recommended source is
 * the first thing a user sees rather than an accident of array position.
 */
export const offeredProviderNames = ({
  contentClass,
  specials = false,
}: StrategyContext): readonly string[] => [
  ...providerOrder({ contentClass, specials }),
  ...manualOnlyProviderNames(),
];

/** The MANUAL_ONLY providers, in registry order. Never chosen automatically. */
export const manualOnlyProviderNames = (): readonly string[] =>
  PROVIDERS.map((provider) => provider.name).filter(
    (name) => !AUTOMATIC.has(name),
  );

/**
 * The provider a user with no stored preference should get for this content.
 *
 * This is the function that replaced a hardcoded `DEFAULT_PROVIDER_NAME =
 * "Frembed"`. The measured consequence of that constant is worth recording: the
 * default source for every first-time visitor was the one provider that produced
 * no playback in a real journey AND spawned three popups, while the provider
 * that played the same film with zero popups sat at the wrong end of the list.
 *
 * Falls back to the registry's first entry only if the class order is empty,
 * which cannot happen while ORDER_BY_CLASS is non-empty and its names exist.
 */
export const defaultProviderName = (context: StrategyContext): string => {
  const order = providerOrder(context);
  return order[0] ?? PROVIDERS[0]?.name ?? "";
};

/**
 * This provider's role for this content class.
 *
 * Anything not in the automatic order is MANUAL_ONLY — including a name that is
 * not a provider at all, which is the safe answer and keeps callers from having
 * to special-case a lookup miss.
 */
export const roleOf = (name: string, context: StrategyContext): ProviderRole => {
  const index = providerOrder(context).indexOf(name);
  if (index === 0) return "PRIMARY";
  if (index === 1) return "FALLBACK";
  if (index === 2) return "SECONDARY_FALLBACK";
  return "MANUAL_ONLY";
};

/** True when this provider may ever be selected FOR the user. */
export const isAutomaticProvider = (name: string): boolean => AUTOMATIC.has(name);

/**
 * The next source to offer when the current one fails or the user asks for
 * another.
 *
 * BOUNDED FALLBACK, NOT AN INFINITE LOOP. This walks the OFFERED list once and
 * wraps, because it is what the user-initiated "change source" control calls: a
 * person clicking repeatedly must always reach somewhere new, so wrapping is the
 * correct behaviour for a manual action. It is explicitly NOT wired to a timer —
 * nothing in the player advances the source by itself, so there is no retry loop
 * to bound. The automatic path is: try the chosen source; if it fails, SHOW the
 * failure panel and offer the next source. The player never silently substitutes
 * one provider for another.
 *
 * A current value that is not an offered provider — a Sibnet variant, or a stale
 * name — resolves to the FIRST offered provider. Previously this returned the
 * raw array's first element, which made a Sibnet failure fall to Frembed
 * regardless of content class.
 */
export const nextProviderName = (
  current: string,
  context: StrategyContext,
): string => {
  const offered = offeredProviderNames(context);
  if (offered.length === 0) return "";
  const index = offered.indexOf(current);
  if (index === -1) return offered[0];
  return offered[(index + 1) % offered.length];
};

/**
 * Which Sibnet variant to offer first, for a viewer of this language.
 *
 * WHAT THIS IS: a UI ordering preference between two variants OF THE SAME
 * SOURCE. Both remain offered and either is one click away; this only decides
 * which button comes first.
 *
 * WHAT THIS IS NOT, and the distinction is deliberate: it is NOT a claim that
 * the VF variant resolves for any given title, nor that it carries French audio.
 * Whether a variant resolves is decided per title by the scrape — the buttons
 * render "Indisponible" when it does not — and the brief is explicit that a "VF"
 * label or a French title is NOT evidence of French availability. Nothing here
 * is counted as French-language success; that requires a real session with a
 * measured audio or subtitle track, and there is no such measurement to claim.
 *
 * Non-French viewers get VOSTFR first because it preserves the original audio
 * track, which is the closer match to the original-version preference — not
 * because it is believed to be English.
 */
export const sibnetOrder = (
  language: string | null | undefined,
): readonly string[] => {
  const prefersFrench =
    typeof language === "string" &&
    language.trim().toLowerCase().startsWith("fr");
  return prefersFrench
    ? [SBNET_VF_NAME, SBNET_VOSTFR_NAME]
    : [SBNET_VOSTFR_NAME, SBNET_VF_NAME];
};

/** True when a name is one of the Sibnet variants rather than a URL-template provider. */
export const isSibnetVariant = (name: string): boolean =>
  name === SBNET_VF_NAME || name === SBNET_VOSTFR_NAME;

/**
 * OPEN LIMITATION, recorded rather than papered over.
 *
 * A French viewer's stated preference order is: French audio, then French
 * subtitles, then VOSTFR. This module does NOT reorder the provider lists for
 * that preference, and that is a deliberate refusal rather than an oversight.
 *
 * The reason is that the evidence does not support it. The registry records
 * exactly one MEASURED French capability anywhere: Frembed fetched a French
 * subtitle track, and that observation reproduced. It was made on ONE title.
 * Promoting Frembed — a provider measured to fail and to open popups in a real
 * journey — ahead of working providers on the strength of a single title's
 * subtitle fetch would be precisely the error the brief warns about, making the
 * strategy depend on one lucky title. VidLink's multi-audio manifest is real, but
 * its track LANGUAGES were never read, so it cannot be claimed as French either.
 *
 * What a French viewer gets instead is honest and immediate: the Sibnet VF
 * variant offered first (above), every provider still one click away, and no
 * provider labelled as French when that was never measured. Closing this gap
 * needs per-title measurement of actual audio and subtitle tracks across several
 * titles and both languages — see docs/player-strategy.md, "Known limitations".
 */
