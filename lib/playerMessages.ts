/**
 * Strict validation of inbound postMessage payloads from embedded providers.
 *
 * Pure module: no React, no DOM. Tested in tests/playerMessages.test.ts.
 *
 * WHY THIS EXISTS (audit finding H-05): the previous handler accepted any
 * message from any origin, never checked `event.origin` or `event.source`, and
 * passed unvalidated `currentTime`/`duration` straight into persistence. Any
 * third-party frame — including ad iframes nested inside a provider — could
 * therefore write into a signed-in user's watch history. Values such as NaN and
 * Infinity also survived, and `JSON.stringify(Infinity)` becomes `null`, so the
 * stored value did not round-trip.
 *
 * This is a DATA-INTEGRITY fix, not an XSS fix: nothing here is written into
 * HTML, and the identity fields (id/type/title/season/episode) never come from
 * the message.
 */

export interface PlaybackProgress {
  currentTime: number;
  duration: number;
}

export interface MessageValidationContext {
  /** event.origin, verbatim. */
  origin: unknown;
  /** event.source (the sending window). */
  source: unknown;
  /** The iframe's contentWindow, captured at event time. */
  expectedSource: unknown;
  /** Exact origins permitted for the active provider. Empty = reject all. */
  allowedOrigins: readonly string[];
  /**
   * The content id we asked the provider to play, as a string.
   *
   * Required for `MEDIA_DATA`, whose payload is keyed by media id: without it we
   * cannot tell which entry in the payload refers to what we mounted, and
   * picking one would be a guess. When absent, `MEDIA_DATA` is rejected.
   */
  mediaId?: string;
  /** The season/episode we asked for. Used to select the right per-episode entry. */
  season?: number | null;
  episode?: number | null;
}

/**
 * Upper bound on a plausible media position, in seconds (24 hours).
 *
 * A finite, internally consistent pair is not enough on its own: the framed
 * provider's own document can send `{currentTime: 1e308, duration: 1e308}` and
 * pass every other check here, and that value would be persisted verbatim and
 * synced. No title we serve is longer than this, so anything beyond it is not a
 * position we are willing to store.
 */
const MAX_MEDIA_SECONDS = 24 * 60 * 60;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Accepts a real number, or a numeric string (some players serialise numbers).
 * Rejects NaN, Infinity, booleans, null and non-numeric strings.
 */
const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/**
 * Reads the position out of VidLink's `MEDIA_DATA` envelope.
 *
 * MEASURED, not inferred. Captured on a live Chrome from origin
 * `https://vidlink.pro` at `https://vidlink.pro/tv/1429/1/1`, every 2000 ms:
 *
 *   {"type":"MEDIA_DATA","data":{"1429":{
 *      "id":1429,"type":"tv","title":"…",
 *      "progress":{"watched":0,"duration":1439.2},
 *      "last_season_watched":"1","last_episode_watched":"1",
 *      "show_progress":{"s1e1":{"season":"1","episode":"1",
 *        "progress":{"watched":21.206035,"duration":1439.2}}}}}}
 *
 * Two properties of that shape decide this implementation, and both were
 * observed rather than assumed:
 *
 *  1. The payload is KEYED BY MEDIA ID, so the entry we want can only be found
 *     with the id we actually mounted. No id in context ⇒ no read.
 *  2. The media-level `progress` object does NOT track the episode being
 *     played. While the media element sat at 22 s, `show_progress.s1e1
 *     .progress.watched` had advanced to 21.206035 and the media-level
 *     `progress.watched` was still 0. Reading the obvious field would therefore
 *     have persisted a permanent 0:00, which is worse than storing nothing.
 *     The authoritative field for a series is the per-episode entry.
 *
 * The per-episode map is only consulted when we know which episode we asked
 * for, and only under the exact `s{season}e{episode}` key. There is no
 * fallback to `last_season_watched`: that describes wherever the provider's own
 * viewer last stopped, which need not be the episode this page is showing, and
 * storing it would attribute a position to the wrong episode.
 */
const readMediaData = (
  data: Record<string, unknown>,
  ctx: MessageValidationContext,
): {currentTime: unknown; duration: unknown} | null => {
  if (!isPlainObject(data.data)) return null;
  if (typeof ctx.mediaId !== "string" || ctx.mediaId === "") return null;

  const entry = (data.data as Record<string, unknown>)[ctx.mediaId];
  if (!isPlainObject(entry)) return null;

  // Series/movie discriminator comes from the provider's own `type` only to
  // CHOOSE WHICH FIELD TO READ. It never decides identity: the id, season and
  // episode we store are the ones we mounted, taken from our own route.
  const providerType = typeof entry.type === "string" ? entry.type : "";

  if (providerType === "tv") {
    if (!isPlainObject(entry.show_progress)) return null;
    const season = ctx.season;
    const episode = ctx.episode;
    if (typeof season !== "number" || typeof episode !== "number") return null;
    const key = `s${season}e${episode}`;
    const slot = (entry.show_progress as Record<string, unknown>)[key];
    if (!isPlainObject(slot)) return null;
    if (!isPlainObject(slot.progress)) return null;
    const watched = (slot.progress as Record<string, unknown>).watched;
    const duration = (slot.progress as Record<string, unknown>).duration;
    return {currentTime: watched, duration};
  }

  // For a movie the media-level `progress` is the only position carrier.
  //
  // THE TYPE CHECK IS REQUIRED, not defensive. The media-level `progress` is
  // also present on a SERIES entry — measured, carrying `watched: 0` while the
  // episode was at 21.206 s. Falling through to it for anything whose type is
  // not `movie` would therefore read the one field that is known to be stale.
  // An envelope whose type we do not recognise stores nothing, which is the
  // honest outcome: we cannot tell which field describes the viewer.
  //
  // MEASURED ONLY AT REST: the one movie entry observed carried
  // `{watched: 0, duration: 0}`, so an ADVANCING movie position has not been
  // observed. The shape is read because it is real and it is the only carrier a
  // movie envelope has, and the numeric sanity checks below reject the
  // `duration: 0` case outright; it is NOT claimed as verified. See
  // docs/player-validation-2026-09-21.md.
  if (providerType === "movie" && isPlainObject(entry.progress)) {
    const progress = entry.progress as Record<string, unknown>;
    return {currentTime: progress.watched, duration: progress.duration};
  }

  return null;
};

/**
 * The message shapes our handler supports. The `timeupdate` shapes mirror what
 * the previous implementation recognised, so no working contract is removed.
 *
 * `episode_change` is deliberately NOT here: the audit observed the provider
 * emit it, but it carries no position and is not evidence that playback is
 * happening. Treating it as playback would be inventing an event.
 */
const extractPositionFields = (
  data: Record<string, unknown>,
  ctx: MessageValidationContext,
): {currentTime: unknown; duration: unknown} | null => {
  if (data.event === "timeupdate" && isPlainObject(data.data)) {
    return {currentTime: data.data.currentTime, duration: data.data.duration};
  }
  if (data.type === "MEDIA_DATA") {
    return readMediaData(data, ctx);
  }
  if (data.type === "timeupdate") {
    return {currentTime: data.currentTime, duration: data.duration};
  }
  return null;
};

/**
 * Returns sanitised progress, or null when the message must be ignored.
 * Every rejection path is silent by design: unknown senders get no response.
 */
export const parsePlaybackProgress = (
  data: unknown,
  ctx: MessageValidationContext,
): PlaybackProgress | null => {
  // 1. An empty allowlist means this provider is not permitted to send anything.
  if (!Array.isArray(ctx.allowedOrigins) || ctx.allowedOrigins.length === 0) return null;

  // 2. Origin must be an exact, non-wildcard member of the allowlist.
  if (typeof ctx.origin !== "string") return null;
  if (ctx.origin === "" || ctx.origin === "*") return null;
  if (!ctx.allowedOrigins.includes(ctx.origin)) return null;

  // 3. Sender must be the frame we mounted. If we cannot identify it, reject —
  //    an unidentified window is not a trusted window.
  if (!ctx.expectedSource || ctx.source !== ctx.expectedSource) return null;

  // 4/5. Payload shape and numeric sanity. Wrapped because reading properties
  // off an untrusted object can itself throw (a Proxy, or a getter that
  // throws). A malformed message must never propagate an exception into the
  // caller's message handler.
  try {
    // Payload must be a plain object in a shape we recognise.
    if (!isPlainObject(data)) return null;
    const fields = extractPositionFields(data, ctx);
    if (!fields) return null;

    // Numbers must be real, finite and internally consistent.
    const currentTime = toFiniteNumber(fields.currentTime);
    const duration = toFiniteNumber(fields.duration);
    if (currentTime === null || duration === null) return null;
    if (!(currentTime >= 0)) return null;
    if (!(duration > 0)) return null;
    if (!(duration <= MAX_MEDIA_SECONDS)) return null;
    if (!(currentTime <= duration)) return null;

    return {currentTime, duration};
  } catch {
    return null;
  }
};
