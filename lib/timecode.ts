/**
 * Seconds → the timecode a viewer reads.
 *
 * Extracted rather than inlined in the component because the format is a
 * PRODUCT decision, not a rendering detail: §10 of the audit brief asks for the
 * position to be shown as "32:14 / 47:10", and the same numbers must render the
 * same way wherever they appear. A pure function is also the only part of the
 * history UI that can be tested without a DOM.
 *
 * Returns an EMPTY STRING for anything that is not a real, non-negative,
 * finite number. That is deliberate: the alternative — returning "0:00" — makes
 * "we do not know where you were" indistinguishable from "you were at the very
 * beginning", which is the same conflation that made the old resume button lie.
 */

const pad = (value: number): string => String(value).padStart(2, "0");

export const formatTimecode = (seconds: number | undefined | null): string => {
  if (typeof seconds !== "number") return "";
  if (!Number.isFinite(seconds) || seconds < 0) return "";

  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor(whole / 60) % 60;
  const secs = whole % 60;

  // Hours appear only when there are hours: a 47-minute episode reads "47:10",
  // not "0:47:10".
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
};

/**
 * "32:14 / 47:10", or "" when there is no measured position to show.
 *
 * The duration alone is not enough: a runtime without a position would render
 * "/ 47:10", which invites the reader to infer a position that was never
 * measured.
 *
 * A DURATION OF ZERO IS NOT A RUNTIME, and it is why the second half does not
 * simply reuse `formatTimecode` here. For a POSITION, 0 is a real measurement —
 * the start of the video — which is why `formatTimecode(0)` returns "0:00". For
 * a DURATION, the same number means "we were not told how long this is", and
 * rendering it produced the nonsense "32:14 / 0:00". The rest of the codebase
 * already treats it that way: `parsePlaybackProgress` rejects `duration <= 0`
 * and `isComplete` refuses to call anything finished without a usable duration.
 */
export const formatProgress = (
  position: number | undefined | null,
  duration: number | undefined | null,
): string => {
  const from = formatTimecode(position);
  if (from === "") return "";
  const to =
    typeof duration === "number" && Number.isFinite(duration) && duration > 0
      ? formatTimecode(duration)
      : "";
  return to === "" ? from : `${from} / ${to}`;
};
