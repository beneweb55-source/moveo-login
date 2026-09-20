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

export interface ProviderDefinition {
  /** Display name. Also the value persisted in localStorage["preferredServer"]. */
  name: string;
  group: string;
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
 * Season/episode are normalised before interpolation. The previous
 * implementation interpolated raw values, so a missing season produced
 * `&sa=undefined&epi=undefined` in the provider URL.
 */
const toPositiveInt = (value: unknown, fallback: number): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

export const PROVIDERS: readonly ProviderDefinition[] = [
  {
    name: "Frembed",
    group: "Alternative",
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
      const s = toPositiveInt(season, 1);
      const e = toPositiveInt(episode, 1);
      return `${FREMBED_ORIGIN}/embed/serie/${safeId}?id=${safeId}&sa=${s}&epi=${e}`;
    },
  },
  {
    name: "SuperEmbed",
    group: "Alternative",
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
        : `https://multiembed.mov/?video_id=${safeId}&tmdb=1&s=${toPositiveInt(season, 1)}&e=${toPositiveInt(episode, 1)}`;
    },
  },
  {
    name: "VidSrc.to",
    group: "Alternative",
    frameOrigins: ["https://vidsrc.to"],
    messageOrigins: [],
    buildUrl: ({type, id, season, episode}) => {
      const safeId = encodeId(id);
      return type === "movie"
        ? `https://vidsrc.to/embed/movie/${safeId}`
        : `https://vidsrc.to/embed/tv/${safeId}/${toPositiveInt(season, 1)}/${toPositiveInt(episode, 1)}`;
    },
  },
  {
    name: "VidSrc.me",
    group: "Alternative",
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
        : `https://vidsrc.me/embed/tv?tmdb=${safeId}&season=${toPositiveInt(season, 1)}&episode=${toPositiveInt(episode, 1)}`;
    },
  },
  {
    name: "2Embed",
    group: "Alternative",
    frameOrigins: ["https://www.2embed.cc"],
    messageOrigins: [],
    buildUrl: ({type, id, season, episode}) => {
      const safeId = encodeId(id);
      return type === "movie"
        ? `https://www.2embed.cc/embed/${safeId}`
        : `https://www.2embed.cc/embedtv/${safeId}&s=${toPositiveInt(season, 1)}&e=${toPositiveInt(episode, 1)}`;
    },
  },
  {
    name: "SmashyStream",
    group: "Alternative",
    // UNVERIFIED from our network on 2026-09-20 (connection timeout), so no
    // redirect target can be declared. If this provider is revived, re-measure
    // the chain before trusting this single entry.
    frameOrigins: ["https://player.smashy.stream"],
    messageOrigins: [],
    buildUrl: ({type, id, season, episode}) => {
      const safeId = encodeId(id);
      return type === "movie"
        ? `https://player.smashy.stream/movie/${safeId}`
        : `https://player.smashy.stream/tv/${safeId}?s=${toPositiveInt(season, 1)}&e=${toPositiveInt(episode, 1)}`;
    },
  },
  {
    name: "VidLink",
    group: "Alternative",
    warningKey: "disableAdblock",
    frameOrigins: ["https://vidlink.pro"],
    messageOrigins: [],
    buildUrl: ({type, id, season, episode}) => {
      const safeId = encodeId(id);
      return type === "movie"
        ? `https://vidlink.pro/movie/${safeId}`
        : `https://vidlink.pro/tv/${safeId}/${toPositiveInt(season, 1)}/${toPositiveInt(episode, 1)}`;
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
