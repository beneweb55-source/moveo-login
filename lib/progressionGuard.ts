/**
 * The rule that stops a watch position from going backwards.
 *
 * Pure module: no React, no DOM, no database. Tested in
 * tests/progressionGuard.test.ts.
 *
 * WHY THIS EXISTS. §9 of the audit brief: a merge "ne doit jamais écraser
 * arbitrairement une progression correcte". That guarantee has to hold in two
 * places that cannot call each other — the browser, where a new observation
 * meets the stored one (utils/historyManager.ts), and the server, where a write
 * from one device meets a row another device wrote (/api/watch-time) — and a
 * guarantee enforced by two independent reimplementations is not a guarantee.
 * So the arithmetic lives here once and both callers use it.
 *
 * THE DRIFT THIS ALREADY SUFFERED, recorded because it is the reason the slot
 * rule below is stated at this length. When this module was written it owned the
 * position rule but NOT the question of which of two DIFFERENT episodes was the
 * current one: the browser answered that itself, by comparing `last_watched`,
 * while the server took the incoming value unconditionally. So "the two rules
 * cannot drift apart" was true of the half that lived here and false of the half
 * that did not — and the consequence was a stale guest entry rewinding an
 * account that had moved on (a month-old "S1E1 at 0:40" overwriting "S2E7 at
 * 32:14"), which is the defect §9 exists to prevent. Ordering now lives here
 * too.
 *
 * WHY IT CANNOT BE A PLAIN "TAKE THE NEWEST". Measured on VidLink: when its
 * player mounts it emits its progress envelope with `watched: 0`, and the real
 * position only appears once playback advances. Taking the newest value blindly
 * therefore RESETS a 21-minute position to zero on every page load. The rule
 * below keeps the stored position in that case, and gives it up only when the
 * viewer had actually finished — which is a rewatch, and the one situation
 * where moving backwards is what the viewer asked for.
 */

/** A position at or above this share of the runtime counts as finished. */
export const COMPLETION_RATIO = 0.95;

/**
 * How much older than the stored observation an incoming one may be and still be
 * treated as current.
 *
 * The browser compares two timestamps taken by the SAME clock, so it does not
 * need this. The server does not have that luxury: the observation's time comes
 * from the viewer's device and the stored time is `watch_history.last_updated`,
 * written by the database. Comparing them exactly would make this rule a device
 * -clock test, and a phone running two days slow could never move its season
 * again — every genuine episode change would read as stale and be refused.
 *
 * A day is chosen to sit between the two magnitudes involved. Ordinary skew is
 * minutes to hours; the entries this rule exists to refuse are a guest's stored
 * history being merged after days or weeks of account activity (§9). So a wide
 * margin on clock skew costs nothing that matters and removes a whole class of
 * "my progress stopped moving" reports that no amount of testing here would
 * reproduce.
 *
 * The remaining failure is deliberately in the safe direction: a device more
 * than a day behind keeps its stored position instead of overwriting it.
 */
export const OBSERVATION_TOLERANCE_MS = 24 * 60 * 60 * 1000;

/** The four fields that identify and locate a position. */
export interface ProgressionFields {
  /** Seconds into the media, or null when no position was measured. */
  position: number | null;
  /** Total runtime in seconds, or null when unknown. */
  duration: number | null;
  /** TMDB season number; null for a film and for "not applicable". */
  season: number | null;
  /** Episode number; null for a film. */
  episode: number | null;
  /**
   * When this observation was made, in epoch milliseconds; null when the caller
   * does not track it.
   *
   * Maps to NO database column. It exists so that two observations of DIFFERENT
   * episodes can be ordered when one of them arrives late — a guest's stored
   * history being merged into an account that has since moved further along —
   * which is the case §9 names. On the server it is the client's
   * `last_watched` compared against `watch_history.last_updated`; in the browser
   * it is the two entries' own `last_watched`.
   *
   * It orders observations that describe different slots. It deliberately does
   * NOT order two positions in the SAME slot: there, a later observation is not
   * a reason to rewind, which is the rule the VidLink mount envelope measured.
   */
  observedAt?: number | null;
}

export const isComplete = (
  position: number | null,
  duration: number | null,
): boolean =>
  typeof position === "number" &&
  typeof duration === "number" &&
  duration > 0 &&
  position / duration >= COMPLETION_RATIO;

/**
 * True when both describe the same episode slot.
 *
 * Season 0 is TMDB's SPECIALS season and is a real slot, so this compares with
 * `?? null` and never with `||`: `0 || null` is null, which would make the
 * specials season indistinguishable from "not applicable" and let a special's
 * position be applied to a numbered episode.
 */
export const sameSlot = (
  a: Pick<ProgressionFields, "season" | "episode">,
  b: Pick<ProgressionFields, "season" | "episode">,
): boolean =>
  (a.season ?? null) === (b.season ?? null) &&
  (a.episode ?? null) === (b.episode ?? null);

/**
 * True when `incoming` describes a moment recent enough to be the current one.
 *
 * A caller that does not record when an observation was made is telling us about
 * NOW — the player's own periodic progress messages are the example — so a
 * missing timestamp on either side means "incoming is current". That keeps this
 * function's behaviour unchanged for every caller that existed before timestamps
 * were carried, and it fails towards applying the observation in front of us
 * rather than towards freezing a stored value.
 *
 * The tolerance is what makes this usable across two clocks; see
 * `OBSERVATION_TOLERANCE_MS` for why it is a day and for the failure it leaves.
 */
const incomingIsCurrent = (
  stored: ProgressionFields,
  incoming: ProgressionFields,
): boolean => {
  const storedAt = stored.observedAt;
  const incomingAt = incoming.observedAt;
  if (typeof storedAt !== "number" || typeof incomingAt !== "number") return true;
  return incomingAt >= storedAt - OBSERVATION_TOLERANCE_MS;
};

/**
 * Returns the progression that should be stored.
 *
 * The return value is ALWAYS one of the two arguments, by reference, so a caller
 * can `===`-compare it to learn which record won instead of re-deriving that
 * from the numbers.
 *
 *  - Nothing stored: the incoming value.
 *  - A different season/episode: whichever observation is CURRENT, except that
 *    an observation that measured nothing never displaces one that did. Both
 *    halves matter and both are explained where they are applied below.
 *  - Same slot, nothing stored, incoming present: incoming.
 *  - Same slot, stored present, incoming absent: STORED. Not knowing where
 *    someone is now is not a reason to forget where they were.
 *  - Same slot, neither measured: the more recent sighting. This is a record of
 *    having been on a title at all, and the latest one is the truthful one.
 *  - Same slot, both present: incoming when it moved forward or stayed level,
 *    or when the stored value was already complete; otherwise STORED.
 */
export const resolveProgression = (
  stored: ProgressionFields | undefined,
  incoming: ProgressionFields,
): ProgressionFields => {
  if (!stored) return incoming;

  if (!sameSlot(stored, incoming)) {
    // A different episode. Two independent questions, and both are asked before
    // the stored slot is allowed to move.
    //
    // 1. WAS ANYTHING MEASURED? An observation carrying no position is not
    //    evidence that the viewer is anywhere — clicking an episode in a list is
    //    not watching it (§13). Letting it win here discards a measured
    //    position, and there is only ONE slot per title in the store and ONE
    //    row in watch_history, so nothing else can restore it: a viewer who had
    //    reached 32:14 and glanced at the next episode came back to "no position
    //    to resume". The slot therefore moves WITH a position, never instead of
    //    one. This also preserves the property that the stored position is never
    //    re-labelled as belonging to an episode it does not describe, because
    //    the position is never carried across the change — the branch that wins
    //    here is returned whole.
    //
    // 2. WHICH OBSERVATION IS CURRENT? Moving to another episode is an event
    //    that happened at a time, and an OLDER observation of a different episode
    //    is not that event; it is a stale entry arriving late, which is exactly
    //    what merging a guest's stored history into an account that has since
    //    moved further along produces (§9). Without this comparison a month-old
    //    "S1E1 at 0:40" rewinds an account's "S2E7 at 32:14".
    const storedHasPosition = stored.position !== null;
    const incomingHasPosition = incoming.position !== null;

    if (storedHasPosition && !incomingHasPosition) return stored;
    if (!storedHasPosition && incomingHasPosition) return incoming;
    // Neither measured anything, so nothing can be lost: this is the record of
    // which episode the viewer was looking at, and the latest one wins.
    return incomingIsCurrent(stored, incoming) ? incoming : stored;
  }

  if (stored.position === null) {
    if (incoming.position === null) {
      return incomingIsCurrent(stored, incoming) ? incoming : stored;
    }
    return incoming;
  }
  if (incoming.position === null) return stored;
  if (incoming.position >= stored.position) return incoming;
  if (isComplete(stored.position, stored.duration)) return incoming;
  return stored;
};

/**
 * The columns a write should set, given the two observations, `null` meaning
 * "leave what is stored alone".
 *
 * This is the step that PERSISTS the decision above, and it lives here for a
 * reason worth recording. It used to be written inline in the route, where the
 * position columns were fed from the winner but the season and episode columns
 * were fed from the raw request: a refused observation therefore still moved the
 * slot, and the row was left contradicting itself — the newer position under the
 * older episode's number, or "S2E7 · 32:14". A second defect lived one branch
 * over, where losing the slot comparison NULLed a position the stored row was
 * right to keep. Both were invisible to every test in the repository, because a
 * decision cannot be tested through the route that wraps it in a database call.
 *
 * Keeping the slot and the position in ONE return value is what makes the
 * contradiction unrepresentable: a caller can no longer write one without the
 * other, so an episode number and the timecode beside it always describe the
 * same viewing.
 *
 * A slot move with no measurement is representable and is real — a viewer who
 * opens an episode of a title nothing was ever measured on — and it is safe for
 * the same reason: the guard only lets that observation win when there is no
 * stored position for it to mislabel.
 */
export interface ProgressionColumns {
  currentTime: number | null;
  totalDuration: number | null;
  season: number | null;
  episode: number | null;
}

export const progressionColumns = (
  stored: ProgressionFields | undefined,
  incoming: ProgressionFields,
): ProgressionColumns => {
  const winner = resolveProgression(stored, incoming);

  // Identity, not equality: this is the contract `resolveProgression` documents
  // and the reason `tests/progressionGuard.test.ts` pins it. If the two ever
  // diverge, this returns "write nothing" for every observation — a store that
  // silently stops recording, which is the failure mode that test exists for.
  if (winner !== incoming) {
    return { currentTime: null, totalDuration: null, season: null, episode: null };
  }

  return {
    currentTime: incoming.position,
    // Only meaningful alongside a position: a duration with no position is a
    // runtime, not a place in the video, and writing it alone would rewrite the
    // row's runtime from an observation that lost.
    totalDuration: incoming.position === null ? null : incoming.duration,
    season: incoming.season,
    episode: incoming.episode,
  };
};
