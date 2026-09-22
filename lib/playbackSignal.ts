/**
 * "Has anything actually played here?" — one fact, one module.
 *
 * Pure module: no React, no DOM. Tested in tests/playbackSignal.test.ts.
 *
 * WHY THIS EXISTS. §13 of the audit brief forbids deriving progress from
 * anything but playback, and names the two false proofs explicitly: an iframe
 * `load`, and a timer. The page carried exactly that defect — `WatchTimer` is
 * mounted on the detail page, independent of the player, and accrued one minute
 * of "watch time" per minute the page was open and visible. A tab left on a
 * detail page therefore reported an hour of viewing, and because the write also
 * touches `last_updated` it reordered that title in the resume list ahead of
 * something genuinely being watched.
 *
 * The signal it needs already existed — `VideoPlayer` sets `playbackObserved`
 * when `parsePlaybackProgress` returns a verified position — but it lived in
 * component state, where the timer could not see it. It is lifted here so the
 * timer can ask, and so the answer is the same one the player acted on rather
 * than a second guess at it.
 *
 * SCOPE: in-memory, per page session, deliberately. It must NOT be persisted —
 * a stored flag would claim a previous visit's playback for this one, which is
 * the same lie in a different place. A reload starts empty, and a page where
 * nothing plays therefore reports nothing.
 *
 * A CONSEQUENCE, stated rather than hidden: minutes now accrue only on
 * providers that emit a verifiable position. Today that is VidLink alone
 * (measured — see lib/providers.ts). Frembed, SmashyStream and Sibnet report
 * no position, so they report no watch time either. The alternative was to keep
 * counting page-presence as viewing, and a figure that cannot be trusted is
 * worse than a figure that is absent.
 */

const observed = new Set<string>();

/** Canonical key. Exported so both sides build it the same way. */
export const playbackKey = (mediaType: string, mediaId: string | number): string =>
  `${mediaType}:${String(mediaId)}`;

/** Called by the player, and only after a position has been validated. */
export const markPlaybackObserved = (
  mediaType: string,
  mediaId: string | number,
): void => {
  observed.add(playbackKey(mediaType, mediaId));
};

/** Reads the fact. False when nothing verifiable has arrived. */
export const hasPlaybackBeenObserved = (
  mediaType: string,
  mediaId: string | number,
): boolean => observed.has(playbackKey(mediaType, mediaId));

/** Test seam: resets the module's memory between cases. */
export const __resetPlaybackSignal = (): void => {
  observed.clear();
};
