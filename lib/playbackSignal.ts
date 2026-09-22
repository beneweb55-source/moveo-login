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
 *
 * PER ATTEMPT, NOT PER PAGE SESSION — and that distinction had to be added.
 * The Set was write-only: `markPlaybackObserved` was called, nothing ever
 * removed a key, and the fact therefore outlived everything it was evidence
 * about. On a series page an episode change is not a remount of `WatchTimer`
 * (its interval is keyed on `type:id`, which the episode does not change), so
 * one episode that had played once licensed the timer to keep counting for
 * every later episode, and for every later source, on that page — minutes for a
 * frame that had reported nothing at all. Withdrawing the fact when the player
 * starts a new attempt (`clearPlaybackObserved`, called from
 * `resetPlaybackObservation`) is what makes the paragraph above true of the
 * CURRENT attempt rather than of the page's whole life.
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

/**
 * Withdraws the fact for one title, because the evidence it stood on has been
 * replaced. Called by the player when it starts a new attempt (a retry, a source
 * change, an episode change) — the frame that earned the fact is gone, and the
 * new one has reported nothing yet.
 *
 * It is NOT a "reset everything" call and must not be used as one: clearing a
 * title the current attempt did not replace would suppress watch time for a
 * player that is still the one being watched.
 */
export const clearPlaybackObserved = (
  mediaType: string,
  mediaId: string | number,
): void => {
  observed.delete(playbackKey(mediaType, mediaId));
};

/** Test seam: resets the module's memory between cases. */
export const __resetPlaybackSignal = (): void => {
  observed.clear();
};
