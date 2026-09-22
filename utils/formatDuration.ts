/**
 * ONE FORMATTER FOR A NUMBER OF MINUTES, because there were three.
 *
 * The same quantity — a watch-time total in minutes, straight from a SQL `SUM` —
 * was rendered by three components, each with its own arithmetic, and two of them
 * were wrong in the same way:
 *
 *   WatchTimeManager  `Math.floor(m / 60)}h {m % 60}m`   → 59 minutes read "0h 59m"
 *   UsersManager      `Math.floor(m / 60)}h`             → 59 minutes read "0h"
 *   Dashboard         its own local formatMinutes        → correct
 *
 * "0h" IS NOT A ROUNDING CHOICE, it is a wrong number: an admin looking at a
 * column of users and reading `0h` beside someone who watched 59 minutes has been
 * told that user watched nothing, and the `% 60` remainder that would have
 * corrected it was being dropped. §3 of the brief forbids a displayed figure that
 * is not the real one, and four call sites doing their own division is how that
 * keeps happening — the Dashboard's copy was right and the other two never
 * inherited it.
 *
 * The unit word is `min` everywhere and never `m`: at a glance `2h 5m` in a
 * monospace column reads as a duration, and `2h 5min` cannot be misread as
 * "2 hours 5 months" by someone skimming a rank table.
 */

/**
 * Formats a minute count for display.
 *
 * Below an hour it is minutes alone — `59min`, not `0h 59min` — because the hours
 * part of a sub-hour duration is information-free and the leading `0h` is what
 * made the original bug look deliberate. At or above an hour the hours come
 * first and the remainder is added only when it is not zero, so a round total
 * reads `3h` and not `3h 0min`.
 *
 * A negative or non-finite input is clamped to zero rather than rendered as
 * `-1h` or `NaN`: an adjustment that has not been applied yet, or a COUNT that
 * returned nothing, is an absence of minutes and not a negative quantity. The
 * card around it is what says whether zero means "no activity".
 */
export const formatWatchTime = (minutes: number): string => {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0min';

  const whole = Math.floor(minutes);
  if (whole < 60) return `${whole}min`;

  const hours = Math.floor(whole / 60);
  const remainder = whole % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}min`;
};
