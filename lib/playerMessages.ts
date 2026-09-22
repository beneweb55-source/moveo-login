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

/**
 * WHERE a verified position came from, which decides what it can be evidence of.
 *
 *  - `event`    — a live playback event: the provider is describing what is
 *                 happening now.
 *  - `snapshot` — the provider's STORED state, re-sent on a timer whether or not
 *                 anything is playing. Measured on VidLink on 2026-09-22:
 *                 `MEDIA_DATA` repeats roughly every 2000 ms, and at mount it
 *                 carries whatever the provider last remembered for that title.
 *
 * The distinction is load-bearing, and it was added AFTER a measurement rather
 * than before one. A snapshot at mount was being read as playback, so opening a
 * title's player produced a stored progression of 0:00 for a title nobody had
 * watched, and started the watch-time signal with nothing playing. Measured on
 * `https://www.moveo.blog/movie/969681` on 2026-09-22: with `watch_history`
 * cleared and nothing but the source selected, the entry
 * `{timestamp: 0, duration: 8678, provider: "VidLink"}` came back, and was then
 * rewritten roughly every five seconds. The movie page has no writer of its own,
 * so the only path that can have written it is this module's output.
 *
 * The MOUNT write reproduces on the movie branch and not on the series branch,
 * which is worth knowing: the movie position lives in a media-level `progress`
 * that carries a REAL runtime, so `{watched: 0, duration: 8678}` survives every
 * numeric check, while a series reads its per-episode slot and an unplayed title
 * stores `duration: 0` there, which the checks reject. The asymmetry, not the
 * zero, is what made this reachable.
 *
 * See `isSnapshotAdvance`, which is what a `snapshot` now has to demonstrate
 * before it counts.
 */
export type PositionSource = "event" | "snapshot";

export interface PlaybackProgress {
  currentTime: number;
  duration: number;
  /** See `PositionSource`. Never inferred later: it is decided where the shape is read. */
  source: PositionSource;
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
  // MEASURED ONLY AT REST. A movie entry being mounted carries a real runtime
  // and a ZERO position: measured at `https://www.moveo.blog/movie/969681` on
  // 2026-09-22, ten consecutive envelopes (gaps 1996–2003 ms) each carried
  // `{watched: 0, duration: 8678}` while nothing was playing. Because the
  // duration is real, this pair passes every numeric check — which is why the
  // movie branch is the one that reproduced the mount-write defect on
  // production (see `PositionSource`). The `{watched: 0, duration: 0}` pair has
  // also been observed, on VidLink's PER-EPISODE slot for a title it has no
  // stored progress for (`/tv/1429` S1E1, same day); that pair is rejected by
  // `duration > 0` below, and it is why that check is required rather than
  // assumed. What has NEVER been observed is an ADVANCING movie position, so
  // the movie branch is read as a real shape and is not claimed as verified for
  // playback — and because the position it carries is the provider's memory, it
  // now arrives tagged `source: "snapshot"` and must advance before anything
  // counts it as viewing (see `isSnapshotAdvance`).
  // See docs/player-validation-2026-09-21.md.
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
): {currentTime: unknown; duration: unknown; source: PositionSource} | null => {
  if (data.event === "timeupdate" && isPlainObject(data.data)) {
    return {currentTime: data.data.currentTime, duration: data.data.duration, source: "event"};
  }
  if (data.type === "MEDIA_DATA") {
    // The provider's stored state, not an event. Tagged here rather than by the
    // caller because this is the only place that knows which branch was taken.
    const read = readMediaData(data, ctx);
    return read ? {currentTime: read.currentTime, duration: read.duration, source: "snapshot"} : null;
  }
  if (data.type === "timeupdate") {
    return {currentTime: data.currentTime, duration: data.duration, source: "event"};
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

    return {currentTime, duration, source: fields.source};
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// SNAPSHOT ≠ PLAYBACK EVENT
//
// A snapshot is the provider's MEMORY. It is re-sent on a timer and it repeats
// the same value whether or not anything is playing, so on its own it is not
// evidence that this visit watched anything: the mount envelope of a title the
// provider already knows will carry a position before the viewer has pressed
// play, and a title the provider does not know will carry `watched: 0`.
//
// What turns a snapshot into evidence is that it MOVED. Two consecutive
// readings of the same slot, the later strictly greater than the earlier, is
// viewing having advanced between them — a stored value cannot do that on its
// own. VidLink's `watched` was measured advancing in step with the media element
// (providers.ts records 21.206035 while the element read 22 s), so the advance
// is the property that is actually available to us.
//
// The comparison is deliberately stateful only through a caller-held cursor, so
// this module stays pure and every rule below is testable without a browser.
// ---------------------------------------------------------------------------

/** The last SNAPSHOT reading seen for one slot. Held by the caller, not here. */
export interface SnapshotCursor {
  slot: string;
  position: number;
}

/**
 * Tolerance, in seconds, on "strictly greater".
 *
 * Snapshots arrive as floats with many decimals, and a provider that rounds the
 * same position twice must not read as movement. Real movement between two
 * snapshots is around two seconds of playback, so half a second sits far below
 * a real advance and far above any rounding artefact.
 */
export const SNAPSHOT_ADVANCE_EPSILON_S = 0.5;

/**
 * A slot identifies WHICH position a reading describes.
 *
 * Season 0 is the specials season and `-` is "no season at all" (a film), so the
 * two cannot collide: `||` would fold the specials into the films' slot and let
 * one's position describe the other.
 */
export const slotKey = (
  type: string,
  id: string | number,
  season: number | null | undefined,
  episode: number | null | undefined,
): string => `${type}:${id}:s${season ?? "-"}e${episode ?? "-"}`;

/**
 * Whether a snapshot shows viewing having advanced since the previous snapshot
 * of the SAME slot.
 *
 * A different slot is never an advance: the two readings describe different
 * positions, and comparing them would invent movement out of an episode change.
 * A `null` cursor (nothing observed yet) is never an advance — which is exactly
 * the mount case this exists to refuse.
 */
export const isSnapshotAdvance = (
  previous: SnapshotCursor | null,
  slot: string,
  position: number,
): boolean =>
  previous !== null &&
  previous.slot === slot &&
  position > previous.position + SNAPSHOT_ADVANCE_EPSILON_S;

/**
 * The whole policy, in one pure function: does this observation count as
 * playback, and what cursor does it leave behind?
 *
 * It is here rather than inside `components/VideoPlayer.tsx` because a rule that
 * decides whether a viewing is reported must be reachable by a test that does
 * not mount a browser. The component keeps only the cursor ref and calls this.
 *
 * The cursor is returned for BOTH sources, and that is deliberate:
 *
 *  - an `event` is the real position, so a snapshot arriving afterwards that is
 *    greater than it is a genuine advance;
 *  - a snapshot that did not count is still the baseline the next snapshot needs
 *    to be compared against. A baseline that was not recorded would make the
 *    following snapshot incomparable, and the rule could never fire.
 *
 * An `event` always counts. No measurement here has ever seen one, which is why
 * a snapshot has to be able to count as well — but if a provider ever does send
 * a live playback event, that is direct evidence and needs no corroboration.
 */
export const observePosition = (
  progress: PlaybackProgress,
  previous: SnapshotCursor | null,
  slot: string,
): {countsAsPlayback: boolean; cursor: SnapshotCursor} => {
  const cursor: SnapshotCursor = {slot, position: progress.currentTime};
  if (progress.source === "event") return {countsAsPlayback: true, cursor};
  return {
    countsAsPlayback: isSnapshotAdvance(previous, slot, progress.currentTime),
    cursor,
  };
};
