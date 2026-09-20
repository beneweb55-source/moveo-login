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
 * The message shapes our handler supports. These mirror the shapes the previous
 * implementation recognised, so no working contract is removed.
 *
 * `episode_change` is deliberately NOT here: the audit observed the provider
 * emit it, but it carries no position and is not evidence that playback is
 * happening. Treating it as playback would be inventing an event.
 */
const extractPositionFields = (
  data: Record<string, unknown>,
): {currentTime: unknown; duration: unknown} | null => {
  if (data.event === "timeupdate" && isPlainObject(data.data)) {
    return {currentTime: data.data.currentTime, duration: data.data.duration};
  }
  if (data.type === "MEDIA_DATA" && isPlainObject(data.data)) {
    return {currentTime: data.data.currentTime, duration: data.data.duration};
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
    const fields = extractPositionFields(data);
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
