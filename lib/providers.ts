/**
 * Single source of truth for external embedded player providers.
 *
 * Pure module: no React, no Next.js, no DOM. This is deliberate — the URL
 * construction and the origin allowlists are the parts that must be testable
 * without a browser (see tests/providers.test.ts).
 *
 * URL formats were VERIFIED against the live provider, not guessed:
 *   GET https://frembed.surf/api/film.php?id=550
 *     -> 308, location: /embed/movie/550?id=550
 *   GET https://frembed.surf/api/serie.php?id=1396&sa=1&epi=1
 *     -> 308, location: /embed/serie/1396?id=1396&sa=1&epi=1
 * The `api/*.php` endpoints are redirectors; the `/embed/...` URLs are the
 * final embed targets and are what we frame directly, saving a round trip.
 *
 * The final targets were confirmed frameable (HTTP 200, no X-Frame-Options,
 * no frame-ancestors, no CSP) on 2026-09-20.
 *
 * NOTE ON HOSTS: frembed.pro is a PARKED DOMAIN ("This domain may be for
 * sale"). Several third-party listings still reference it — do not "restore"
 * it from documentation.
 *
 * frembed.work is a REDIRECTOR, not a dead host, despite an earlier note here
 * claiming it "does not resolve". Measured 2026-09-20:
 *   GET https://frembed.work/api/film.php?id=98               -> 302 -> frembed.surf/...
 *   GET https://frembed.work/api/serie.php?id=1399&sa=1&epi=1 -> 302 -> frembed.surf/...
 * The app deliberately frames frembed.surf DIRECTLY rather than the redirector,
 * so frembed.work is intentionally absent from `frame-src` in next.config.ts.
 * Framing the redirector would be pointless: Chrome re-checks frame-src against
 * the redirect's target, so frembed.surf would have to be allowed regardless.
 */

export type MediaType = "movie" | "tv";

export interface ProviderUrlParams {
  type: MediaType;
  id: string;
  season?: number;
  episode?: number;
}

/**
 * Whether a capability has been MEASURED to work.
 *
 * `"unknown"` is a first-class value and is the default for everything. This is
 * deliberate, and it is the whole point of the type: the provider review held
 * that *"a provider that only returns a 200 page is NOT automatically a working
 * player"*, so an unmeasured cell must be representable. Collapsing `"unknown"`
 * into `"no"` would turn a gap in the review into a false claim about the
 * provider, which is the failure mode this field exists to prevent.
 */
export type Support = "yes" | "no" | "unknown";

/**
 * What each provider was OBSERVED to do, per dimension. Every value here traces
 * to a dated measurement recorded in docs/provider-matrix.md — none is inferred
 * from documentation or from a provider's own marketing.
 *
 * Caveat that applies to `playbackObserved` throughout: "not observed" is
 * recorded as `"unknown"`, never as `"no"`. These players fetch media inside
 * MSE/`blob:` sources and Web Workers, so a page-level network log can show no
 * media request for a provider that is in fact playing. Only a direct read of
 * the media element (readyState 4, advancing currentTime, non-zero
 * videoWidth/videoHeight) justifies `"yes"`.
 */
export interface ProviderCapabilities {
  /** Observed decoding media, by direct media-element measurement. */
  playbackObserved: Support;
  /** Resolves TMDB season 0 (specials) to the correct episode. */
  specials: Support;
  /** A subtitle track was observed being fetched. */
  subtitles: Support;
  /** Was observed to display adult advertising inside its frame. */
  adultAdvertising: Support;
  /** Measured on a mobile viewport. `"unknown"` until a mobile pass is run. */
  mobile: Support;
}

/**
 * Icon identity, resolved to a concrete component by the UI layer.
 *
 * This is a plain string rather than a React component ON PURPOSE: this module
 * is pure (no React, no DOM — see the header), and provider identity used to
 * live in a `Record<string, React.ElementType>` inside VideoPlayer.tsx keyed by
 * DISPLAY NAME, which meant the registry and the identity map could disagree
 * silently. A provider renamed here would keep the old icon and nothing would
 * fail. Now an unknown key is a type error at the one place that maps it.
 */
export type ProviderIconKey = "globe" | "server" | "zap";

export interface ProviderDefinition {
  /** Display name. Also the value persisted in localStorage["preferredServer"]. */
  name: string;
  group: string;
  /** Icon identity for the UI layer. See ProviderIconKey. */
  iconKey: ProviderIconKey;
  /** Measured capabilities. See Support — unmeasured is `"unknown"`, not `"no"`. */
  capabilities: ProviderCapabilities;
  /** i18n key for a provider-specific caveat, if any. */
  warningKey?: string;
  /**
   * EVERY origin this provider can put in a frame document, in navigation
   * order: `[0]` is the origin of the URL buildUrl() produces, and each later
   * entry is the origin of a redirect target the provider itself issues.
   *
   * WHY A LIST AND NOT A SINGLE ORIGIN: `frame-src` is re-checked against a
   * redirect's TARGET, not only against the URL we wrote into the iframe. A
   * single-origin field therefore described only half of what the browser
   * enforces, and a provider whose entry point 302s was silently blocked while
   * the test suite stayed green. Every entry below is a MEASUREMENT with a
   * date — re-measure before editing, and never add one from documentation.
   */
  frameOrigins: readonly string[];
  /**
   * Origins permitted to postMessage our window on this provider's behalf.
   * EMPTY means: accept nothing. Only origins observed emitting real messages
   * are listed here — see the note on Frembed below.
   */
  messageOrigins: readonly string[];
  buildUrl: (params: ProviderUrlParams) => string;
}

const FREMBED_ORIGIN = "https://frembed.surf";

/**
 * Provider ids arrive from route params (`/movie/[id]`) and are interpolated
 * into provider URLs, so they are always encoded. Without this, an id such as
 * `../x` or `1&epi=99` would alter the provider URL's path or query.
 */
const encodeId = (id: string): string => encodeURIComponent(String(id ?? "").trim());

/**
 * Episode numbers are normalised before interpolation. The previous
 * implementation interpolated raw values, so a missing season produced
 * `&sa=undefined&epi=undefined` in the provider URL.
 *
 * Episodes are 1-based in TMDB, so 0 is not a valid episode and is coerced.
 */
const toPositiveInt = (value: unknown, fallback: number): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/**
 * Season numbers are normalised SEPARATELY from episodes, because 0 is a valid
 * season number and is NOT a valid episode number.
 *
 * THE BUG THIS FIXES: every provider used `toPositiveInt` for season too, which
 * requires `n > 0` — so TMDB's season 0 (SPECIALS) was silently rewritten to
 * season 1. A user who explicitly picked "Hors-série → E1" on the TV page was
 * served **S1E1** instead: not a broken player, the RIGHT-LOOKING but WRONG
 * episode, which is the worse failure because nothing signals it.
 *
 * MEASURED 2026-09-21 — the season-0 grammar is real, not hypothetical. Against
 * the SmashyStream successor on Breaking Bad (TMDB 1396):
 *   /embed/tmdb-tv-1396-1-1 -> document title "Breaking Bad - Pilot | AnyEmbed"
 *   /embed/tmdb-tv-1396-0-1 -> document title "Breaking Bad - Good Cop / Bad Cop | AnyEmbed"
 * "Good Cop / Bad Cop" IS the title of that show's season-0 episode 1, so the
 * provider understood `0` and resolved the correct special. (It then reported
 * no source carrying it — `116 SOURCES · 80 SERVER + 36 BROWSER … checked` —
 * which is a provider CONTENT gap surfaced honestly by the player's own error
 * state, not something our URL builder should paper over by lying about which
 * episode was requested.)
 *
 * So sending the truthful season is correct even where the media turns out to be
 * absent: a visibly unavailable special is honest, a silently substituted pilot
 * is not. `fallback` still applies to a value that is absent, non-integer or
 * negative — `undefined`, `NaN` and `-1` all still resolve to 1.
 */
const toSeasonNumber = (value: unknown, fallback: number): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
};

export const PROVIDERS: readonly ProviderDefinition[] = [
  {
    name: "Frembed",
    group: "Alternative",
    iconKey: "globe",
    // Broadest RESOLUTION measured of any provider here: it resolves all four
    // content classes by TMDB id, including Korean drama AND anime (series and
    // movie), and its nested page renders the real title, Saison/Épisode, a VF
    // badge and SERVEURS / ÉPISODES controls.
    // Playback stayed "unknown": after the frame settled there were no media-type
    // requests and no stream host in xhr/fetch, and clicking its one interactive
    // element produced no media. Per the Support doc comment, "not observed" is
    // recorded as unknown, never as "no" — these players fetch through MSE.
    capabilities: {
      playbackObserved: "unknown",
      specials: "unknown",
      subtitles: "unknown",
      adultAdvertising: "unknown",
      mobile: "unknown",
    },
    // No redirect hop: buildUrl targets frembed.surf directly rather than the
    // frembed.work redirector (see module header). One origin is the whole
    // chain.
    frameOrigins: [FREMBED_ORIGIN],
    /**
     * Verified emitter. The audit observed exactly one message from this
     * origin: `{type:"episode_change",season:1,episode:1}` — which is NOT a
     * playback event and is deliberately not treated as one. No `timeupdate`
     * was ever observed from this provider, so in practice nothing is accepted
     * today; the allowlist exists so that IF a real position is ever exposed,
     * only this exact origin can supply it.
     */
    messageOrigins: [FREMBED_ORIGIN],
    buildUrl: ({type, id, season, episode}) => {
      const safeId = encodeId(id);
      if (type === "movie") {
        return `${FREMBED_ORIGIN}/embed/movie/${safeId}?id=${safeId}`;
      }
      const s = toSeasonNumber(season, 1);
      const e = toPositiveInt(episode, 1);
      return `${FREMBED_ORIGIN}/embed/serie/${safeId}?id=${safeId}&sa=${s}&epi=${e}`;
    },
  },
  {
    name: "SuperEmbed",
    group: "Alternative",
    iconKey: "server",
    // PRODUCT-SAFETY FINDING, measured 2026-09-21: framing this provider can
    // display ADULT ADVERTISING inside our player. Its content for Korean 93405
    // S1E1 was an ad/affiliate landing page (an adult webcam service) reached via
    // redirectors, with `Error: 600010` (= a Cloudflare Turnstile challenge)
    // retry-looping inside the frame. That last part is the provider's own gate
    // failing; we do not bypass anti-bot challenges, so this is recorded rather
    // than routed around. The adult-advertising fact holds regardless of whether
    // playback ever succeeds.
    capabilities: {
      playbackObserved: "unknown",
      specials: "unknown",
      subtitles: "unknown",
      adultAdvertising: "yes",
      mobile: "unknown",
    },
    // MEASURED 2026-09-20 — this provider is a redirect chain, and unlike
    // frembed.work the hop CANNOT be skipped:
    //   GET /?video_id=550&tmdb=1 -> 302 -> https://streamingnow.mov/?play=<b64>
    // The `play` payload is generated server-side, so the final URL is not
    // reproducible from the id — the iframe must start at multiembed.mov and
    // land on streamingnow.mov. BOTH origins must therefore be in `frame-src`,
    // because Chrome re-checks frame-src against a redirect's target.
    // streamingnow.mov is the same provider, not an ad domain:
    //   GET https://streamingnow.mov/ -> 302 -> https://www.superembed.stream?c=embed
    frameOrigins: ["https://multiembed.mov", "https://streamingnow.mov"],
    messageOrigins: [],
    buildUrl: ({type, id, season, episode}) => {
      const safeId = encodeId(id);
      return type === "movie"
        ? `https://multiembed.mov/?video_id=${safeId}&tmdb=1`
        : `https://multiembed.mov/?video_id=${safeId}&tmdb=1&s=${toSeasonNumber(season, 1)}&e=${toPositiveInt(episode, 1)}`;
    },
  },
  {
    name: "VidSrc.to",
    group: "Alternative",
    iconKey: "server",
    // Reached the same player backend as VidSrc.me and resolved Korean 93405 S1E1
    // as `Squid Game 2021 · S01 E01`. Playback not observed within ~14s of its own
    // `Play` being clicked; recorded as unknown, not as a negative.
    capabilities: {
      playbackObserved: "unknown",
      specials: "unknown",
      subtitles: "unknown",
      adultAdvertising: "unknown",
      mobile: "unknown",
    },
    frameOrigins: ["https://vidsrc.to"],
    messageOrigins: [],
    buildUrl: ({type, id, season, episode}) => {
      const safeId = encodeId(id);
      return type === "movie"
        ? `https://vidsrc.to/embed/movie/${safeId}`
        : `https://vidsrc.to/embed/tv/${safeId}/${toSeasonNumber(season, 1)}/${toPositiveInt(episode, 1)}`;
    },
  },
  {
    name: "VidSrc.me",
    group: "Alternative",
    iconKey: "globe",
    // Same upstream player as VidSrc.to (measured: both resolve to one player
    // backend), so its capabilities mirror that entry rather than being re-derived.
    capabilities: {
      playbackObserved: "unknown",
      specials: "unknown",
      subtitles: "unknown",
      adultAdvertising: "unknown",
      mobile: "unknown",
    },
    // MEASURED 2026-09-20 — this host is migrating:
    //   GET /embed/movie?tmdb=550 -> 301 Moved Permanently -> https://vidsrc.sh/...
    // (and a later probe from the same network got no answer at all from
    // vidsrc.me while vidsrc.sh served the embed with 200). The query string is
    // preserved across the hop, so the redirect COULD be skipped by pointing
    // buildUrl at vidsrc.sh directly — that is a deliberate behavioural change
    // and is left for its own review. Meantime both origins are allowed, so the
    // provider works whether the browser takes the hop or not.
    frameOrigins: ["https://vidsrc.me", "https://vidsrc.sh"],
    messageOrigins: [],
    buildUrl: ({type, id, season, episode}) => {
      const safeId = encodeId(id);
      return type === "movie"
        ? `https://vidsrc.me/embed/movie?tmdb=${safeId}`
        : `https://vidsrc.me/embed/tv?tmdb=${safeId}&season=${toSeasonNumber(season, 1)}&episode=${toPositiveInt(episode, 1)}`;
    },
  },
  {
    name: "2Embed",
    group: "Alternative",
    iconKey: "globe",
    // Its odd-looking `embedtv/{id}&s=&e=` path IS the provider's working format:
    // its own page renders the resolved title with an `(S01E01)` heading, so the
    // path parses correctly. The player area is an `about:blank` iframe plus a
    // redirect layer, with no media observed.
    capabilities: {
      playbackObserved: "unknown",
      specials: "unknown",
      subtitles: "unknown",
      adultAdvertising: "unknown",
      mobile: "unknown",
    },
    frameOrigins: ["https://www.2embed.cc"],
    messageOrigins: [],
    buildUrl: ({type, id, season, episode}) => {
      const safeId = encodeId(id);
      return type === "movie"
        ? `https://www.2embed.cc/embed/${safeId}`
        : `https://www.2embed.cc/embedtv/${safeId}&s=${toSeasonNumber(season, 1)}&e=${toPositiveInt(episode, 1)}`;
    },
  },
  {
    name: "SmashyStream",
    group: "Alternative",
    iconKey: "zap",
    capabilities: {
      // "yes" is justified by direct media-element measurement, not by a 200:
      //   /embed/tmdb-movie-550   -> "Fight Club", 8348.4s, readyState 4, 1280x534
      //   /embed/tmdb-tv-1396-1-1 -> "Breaking Bad - Pilot", 3479.9s, 1280x720
      // Non-zero video dimensions only occur once frames are decoded.
      playbackObserved: "yes",
      // MEASURED 2026-09-21: season 0 is understood and resolves to the CORRECT
      // special — /embed/tmdb-tv-1396-0-1 titles itself "Breaking Bad - Good Cop /
      // Bad Cop", which is genuinely that show's season-0 episode 1. This is the
      // measurement that made the season-0 coercion in this module a bug rather
      // than a harmless gap. Note the provider then reported no source carrying
      // it (it cycles `116 SOURCES · 80 SERVER + 36 BROWSER`), i.e. it resolves
      // the special but has no media for it — a content gap, honestly surfaced by
      // the player's own state.
      specials: "yes",
      subtitles: "unknown",
      adultAdvertising: "unknown",
      mobile: "unknown",
    },
    // HOST MOVED — re-measured 2026-09-21. The provider did not die, it moved.
    //
    // The old embed host is dead: `player.smashy.stream` presents a TLS
    // certificate whose subject is `CN=tools.anyembed.xyz` — a hostname
    // mismatch, so no standards-compliant client can load it (curl:
    // http_code=000; Chrome: chrome-error://chromewebdata/). Two independent
    // clients agreed, so it was reproducible rather than a vantage artifact.
    //
    // The successor was established by MEASUREMENT, not from a listing:
    //   GET https://player.smashystream.com/movie/550
    //     -> 301 -> https://anyembed.xyz/embed/tmdb-movie-550
    //   GET https://embed.smashystream.com/movie/550
    //     -> 301 -> https://anyembed.xyz/embed/tmdb-movie-550
    //   GET https://player.smashystream.com/tv/1396?s=1&e=1
    //     -> 301 -> https://anyembed.xyz/embed/tmdb-tv-1396-1-1
    // The redirector translates EXACTLY the two path shapes this entry used to
    // build, which is what identifies it as the same service rather than a
    // namesake. The hop is then deliberately SKIPPED, the way frembed.work's is:
    // we frame the measured final target directly, so one origin suffices.
    //
    // The grammar below is the provider's own translation of those requests:
    //   movie -> /embed/tmdb-movie-{id}
    //   tv    -> /embed/tmdb-tv-{id}-{s}-{e}
    // The final target answers 200 with no X-Frame-Options, no frame-ancestors
    // and no CSP, i.e. it is frameable.
    //
    // PLAYBACK OBSERVED 2026-09-21 — measured on the media element itself, not
    // read off the provider's own progress labels:
    //   /embed/tmdb-movie-550   -> "Fight Club",           duration 8348.4s
    //     (= 2:19:08, the film's real runtime), readyState 4, paused=false,
    //     1280x534 decoded
    //   /embed/tmdb-tv-1396-1-1 -> "Breaking Bad - Pilot", duration 3479.9s
    //     (= 57:59, the episode's real runtime), readyState 4, paused=false,
    //     1280x720 decoded
    // Both the correct TITLE and the correct EPISODE resolved, and the video
    // dimensions are non-zero, which only happens when frames are decoded. The
    // source is a `blob:` MSE object, which is why a page-level network log
    // shows no media request for this provider.
    //
    // STILL NOT CLAIMED: subtitles/language support, mobile behaviour and
    // per-season depth are unmeasured here. An absent claim is a gap in the
    // review, not a "no".
    frameOrigins: ["https://anyembed.xyz"],
    messageOrigins: [],
    buildUrl: ({type, id, season, episode}) => {
      const safeId = encodeId(id);
      return type === "movie"
        ? `https://anyembed.xyz/embed/tmdb-movie-${safeId}`
        : `https://anyembed.xyz/embed/tmdb-tv-${safeId}-${toSeasonNumber(season, 1)}-${toPositiveInt(episode, 1)}`;
    },
  },
  {
    name: "VidLink",
    group: "Alternative",
    iconKey: "server",
    capabilities: {
      // The one provider where playback was observed end-to-end: a DASH manifest,
      // init segments, and 14 consecutive chunk-stream segments fetched over ~13s.
      playbackObserved: "yes",
      // A subtitle `.srt` was observed being fetched, and the manifest carried
      // three streams (i.e. multiple audio tracks) — for Korean AND anime.
      subtitles: "yes",
      specials: "unknown",
      adultAdvertising: "unknown",
      mobile: "unknown",
    },
    warningKey: "disableAdblock",
    frameOrigins: ["https://vidlink.pro"],
    messageOrigins: [],
    buildUrl: ({type, id, season, episode}) => {
      const safeId = encodeId(id);
      return type === "movie"
        ? `https://vidlink.pro/movie/${safeId}`
        : `https://vidlink.pro/tv/${safeId}/${toSeasonNumber(season, 1)}/${toPositiveInt(episode, 1)}`;
    },
  },
];

/**
 * Every origin ANY provider can place in a frame document — the union of the
 * per-provider `frameOrigins`, including redirect targets.
 *
 * This is the list `frame-src` must cover. It exists because the previous
 * single-origin field let a provider pass the CSP test while the browser
 * blocked it: the test checked the origin we wrote, and the browser also checks
 * where the provider redirects us. Consumers that want one canonical origin per
 * provider (e.g. a probe target) should keep using `frameOrigins[0]`, which is
 * the origin of the URL buildUrl() produces.
 */
export const PROVIDER_FRAME_ORIGINS: readonly string[] = [
  ...new Set(PROVIDERS.flatMap((provider) => provider.frameOrigins)),
];

/** Sibnet is resolved via /api/sibnet (a scrape), not by URL template. */
export const SBNET_VF_NAME = "Sibnet VF";
export const SBNET_VOSTFR_NAME = "Sibnet VOSTFR";
export const SBNET_FRAME_ORIGIN = "https://video.sibnet.ru";

export const SBNET_SERVER_NAMES: readonly string[] = [SBNET_VF_NAME, SBNET_VOSTFR_NAME];

/**
 * Every value that may legitimately appear in localStorage["preferredServer"].
 * Anything outside this list is stale and must be discarded (see
 * resolveStoredProvider) — this is the validation the audit found missing.
 *
 * A value previously written for the removed premium tier ("MOVEO PREMIUM") is
 * therefore discarded on next load rather than selected, which is the intended
 * migration: it resolves to DEFAULT_PROVIDER_NAME instead of stranding the user
 * on a server that no longer exists.
 */
export const STORABLE_SERVERS: readonly string[] = [
  ...PROVIDERS.map((p) => p.name),
  ...SBNET_SERVER_NAMES,
];

export const DEFAULT_PROVIDER_NAME = "Frembed";

export const getProvider = (name: string): ProviderDefinition | undefined =>
  PROVIDERS.find((p) => p.name === name);

export const isProvider = (name: string): boolean => getProvider(name) !== undefined;

export const isStorableServer = (name: string): boolean => STORABLE_SERVERS.includes(name);

export const isSibnetServer = (name: string): boolean => SBNET_SERVER_NAMES.includes(name);

/**
 * Builds the iframe URL for a named provider. Returns null for unknown names
 * so callers cannot frame an arbitrary target.
 */
export const buildProviderUrl = (name: string, params: ProviderUrlParams): string | null => {
  const provider = getProvider(name);
  if (!provider) return null;
  const id = String(params.id ?? "").trim();
  if (id === "") return null;
  return provider.buildUrl({...params, id});
};

/** Origins allowed to postMessage us for the given server, or [] for none. */
export const getMessageOrigins = (serverName: string): readonly string[] =>
  getProvider(serverName)?.messageOrigins ?? [];

/**
 * NOTE: SBNET_FRAME_ORIGIN is deliberately NOT wired into getMessageOrigins.
 *
 * The message validator rejects everything for a provider with an empty
 * allowlist, so a Sibnet frame cannot send progress — and the player says so
 * rather than inventing a position (see §7 of the integration brief).
 * Permitting an origin is only justified once that provider has been OBSERVED
 * emitting a well-formed position; adding it now on the assumption that it
 * "probably" sends `timeupdate` would widen trust on a guess. This constant
 * records the origin so that wiring it up later is a one-line, reviewable act.
 *
 * REMOVED: the premium (VOE / Dood) tier — PREMIUM_SERVER_NAME,
 * PREMIUM_EMBED_HOSTS and pinPremiumEmbedUrl. Those sources came from
 * /api/catalogue (voe_url / dood_url) and were selected ahead of every real
 * provider. Measured on production 2026-09-20: the URLs the scraper had stored
 * no longer resolve, so a first-time visitor's default source was a dead embed
 * (voe.sx answered 404). VOE and Dood are not supported by the product, so the
 * tier is gone rather than repaired — and with it the twelve `frame-src`
 * entries that existed only to permit those two hosts.
 */
