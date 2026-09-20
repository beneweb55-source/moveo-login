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
 * sale") and frembed.work does not resolve. Several third-party listings
 * still reference .pro — do not "restore" it from documentation.
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
  /** Origin of the document we actually frame. Kept for CSP regression tests. */
  frameOrigin: string;
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
    frameOrigin: FREMBED_ORIGIN,
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
    frameOrigin: "https://multiembed.mov",
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
    frameOrigin: "https://vidsrc.to",
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
    frameOrigin: "https://vidsrc.me",
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
    frameOrigin: "https://www.2embed.cc",
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
    frameOrigin: "https://player.smashy.stream",
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
    frameOrigin: "https://vidlink.pro",
    messageOrigins: [],
    buildUrl: ({type, id, season, episode}) => {
      const safeId = encodeId(id);
      return type === "movie"
        ? `https://vidlink.pro/movie/${safeId}`
        : `https://vidlink.pro/tv/${safeId}/${toPositiveInt(season, 1)}/${toPositiveInt(episode, 1)}`;
    },
  },
];

/** Premium host, resolved from our own catalogue rather than a URL template. */
export const PREMIUM_SERVER_NAME = "MOVEO PREMIUM";

/** Sibnet is resolved via /api/sibnet (a scrape), not by URL template. */
export const SBNET_VF_NAME = "Sibnet VF";
export const SBNET_VOSTFR_NAME = "Sibnet VOSTFR";
export const SBNET_FRAME_ORIGIN = "https://video.sibnet.ru";

export const SBNET_SERVER_NAMES: readonly string[] = [SBNET_VF_NAME, SBNET_VOSTFR_NAME];

/**
 * Every value that may legitimately appear in localStorage["preferredServer"].
 * Anything outside this list is stale and must be discarded (see
 * resolveStoredProvider) — this is the validation the audit found missing.
 */
export const STORABLE_SERVERS: readonly string[] = [
  ...PROVIDERS.map((p) => p.name),
  ...SBNET_SERVER_NAMES,
  PREMIUM_SERVER_NAME,
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
 * Hosts the premium (VOE / Dood) catalogue links are allowed to live on.
 *
 * Kept in sync with `frame-src` in next.config.ts by tests/csp.test.ts, which
 * fails if a host listed here is not also permitted by the CSP.
 */
export const PREMIUM_EMBED_HOSTS: readonly string[] = [
  "voe.sx",
  "dood.watch",
  "dood.to",
  "dood.so",
  "dood.pm",
  "dood.wf",
];

/**
 * Pins a premium catalogue URL to the premium hosts, or returns "".
 *
 * WHY THIS EXISTS: `toVoeEmbed`/`toDoodEmbed` only rewrite the path, and the
 * value they receive is a `voe_url`/`dood_url` column written by a scraper —
 * i.e. it is data, not a constant. Two consequences were measured on the
 * previous shape:
 *
 *   - `//evil.example/e/x` satisfies an `includes("/e/")` short-circuit and is
 *     returned verbatim, and
 *   - the `pathname` setter is a no-op on an opaque-path URL, so `javascript:`
 *     and `data:` pass through unchanged.
 *
 * The narrowed CSP now blocks both as an iframe `src` — but CSP does not govern
 * top-level navigation, and this URL is also used for the "open in a new tab"
 * links. A row containing `javascript:` would therefore be offered to the user
 * as a clickable "open your video source" link. Validating here means an
 * unusable value can never reach either sink; it fails closed to "" and the
 * player reports an unavailable source.
 */
export const pinPremiumEmbedUrl = (
  url: string,
  hosts: readonly string[] = PREMIUM_EMBED_HOSTS,
): string => {
  const candidate = typeof url === "string" ? url.trim() : "";
  // Protocol-relative ("//host/path") is rejected before URL parsing: it is a
  // valid URL against the page's scheme and would otherwise inherit `https:`.
  if (candidate === "" || candidate.startsWith("//")) return "";
  try {
    const parsed = new URL(candidate);
    // Only https. This rejects javascript:, data:, blob: and http: alike.
    if (parsed.protocol !== "https:") return "";
    const host = parsed.hostname.toLowerCase();
    const allowed = hosts.some(
      (allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`),
    );
    if (!allowed) return "";
    return parsed.toString();
  } catch {
    // Not an absolute URL at all (e.g. a bare "abc123" id): reject rather than
    // guessing a host for it.
    return "";
  }
};

/**
 * NOTE: SBNET_FRAME_ORIGIN is deliberately NOT wired into getMessageOrigins.
 *
 * The message validator rejects everything for a provider with an empty
 * allowlist, so Sibnet and premium frames cannot send progress — and the player
 * says so rather than inventing a position (see §7 of the integration brief).
 * Permitting an origin is only justified once that provider has been OBSERVED
 * emitting a well-formed position; adding it now on the assumption that it
 * "probably" sends `timeupdate` would widen trust on a guess. This constant
 * records the origin so that wiring it up later is a one-line, reviewable act.
 */
