/**
 * The no-regression rule for a watch position.
 *
 * These are not mock tests: `resolveProgression` is the function the browser
 * calls when an observation arrives and the function the server calls before it
 * writes a row, so every case below is a case the product actually takes. The
 * scenarios are the ones §9 of the audit brief names — same film, same
 * series+season+episode, different timestamps, different positions — plus the
 * case measured live on VidLink, which is the reason the rule exists at all.
 *
 * Run: node --import tsx --test tests/progressionGuard.test.ts
 */

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  COMPLETION_RATIO,
  OBSERVATION_TOLERANCE_MS,
  isComplete,
  progressionColumns,
  resolveProgression,
  sameSlot,
  type ProgressionFields,
} from '../lib/progressionGuard';

const fields = (over: Partial<ProgressionFields> = {}): ProgressionFields => ({
  position: null,
  duration: null,
  season: null,
  episode: null,
  ...over,
});

describe('sameSlot', () => {
  it('treats two films as the same slot', () => {
    assert.equal(sameSlot(fields(), fields()), true);
  });

  it('treats SEASON 0 as a real slot, not as "no season"', () => {
    // The specials season. `0 || null` is null, so an implementation using `||`
    // would call a special and a numbered episode the same slot and let one's
    // position overwrite the other's.
    const special = fields({season: 0, episode: 3});
    const numbered = fields({season: 1, episode: 3});
    const film = fields();
    assert.equal(sameSlot(special, numbered), false);
    assert.equal(sameSlot(special, film), false);
    assert.equal(sameSlot(special, fields({season: 0, episode: 3})), true);
  });

  it('distinguishes two episodes of the same season', () => {
    assert.equal(
      sameSlot(fields({season: 2, episode: 7}), fields({season: 2, episode: 8})),
      false,
    );
  });
});

describe('isComplete', () => {
  it('accepts exactly the completion ratio as complete', () => {
    assert.equal(isComplete(COMPLETION_RATIO * 100, 100), true);
  });

  it('rejects just below the ratio', () => {
    assert.equal(isComplete(COMPLETION_RATIO * 100 - 0.01, 100), false);
  });

  it('refuses to call anything complete without a usable duration', () => {
    // A zero or missing duration is not evidence of finishing, and treating it
    // as such would let a viewer's position be discarded for a title whose
    // runtime the provider never reported.
    assert.equal(isComplete(50, 0), false);
    assert.equal(isComplete(50, null), false);
    assert.equal(isComplete(null, 100), false);
    assert.equal(isComplete(Number.NaN, 100), false);
  });
});

describe('resolveProgression — nothing stored', () => {
  it('stores the incoming observation', () => {
    const incoming = fields({position: 12, duration: 100, season: 1, episode: 1});
    assert.equal(resolveProgression(undefined, incoming), incoming);
  });
});

describe('resolveProgression — the viewer changed episode', () => {
  it('takes the new episode and its position', () => {
    const stored = fields({position: 1300, duration: 1439.2, season: 1, episode: 1});
    const incoming = fields({position: 45, duration: 1439.2, season: 1, episode: 2});
    assert.equal(resolveProgression(stored, incoming), incoming);
  });

  it('does NOT move the slot for an observation that measured nothing', () => {
    // A click on an episode in a list is not watching it (§13). The store holds
    // ONE slot per title, so letting a position-less observation move the slot
    // discards the measured position with nothing able to restore it: a viewer
    // who had reached 32:14, glanced at the next episode and came back was told
    // there was "no position to resume" (audit finding R3-F2).
    const stored = fields({position: 1934, duration: 2830, season: 1, episode: 1});
    const incoming = fields({position: null, duration: null, season: 1, episode: 2});

    const winner = resolveProgression(stored, incoming);
    assert.equal(winner, stored);
    assert.equal(winner.position, 1934);
    // The property the old behaviour was protecting is kept, and kept more
    // strictly: the position is never re-labelled as belonging to the episode
    // that was only clicked.
    assert.equal(winner.season, 1);
    assert.equal(winner.episode, 1);
  });

  it('DOES move the slot once the new episode has been measured', () => {
    // The same move, but the player reported a position for episode 2 — the
    // viewer is genuinely there and the position describes the new episode.
    const stored = fields({position: 1934, duration: 2830, season: 1, episode: 1});
    const incoming = fields({position: 2, duration: 1400, season: 1, episode: 2});
    assert.equal(resolveProgression(stored, incoming), incoming);
  });

  it('REFUSES a stale observation of a different episode', () => {
    // Audit finding F4, and the reason ordering lives in this module. A guest's
    // stored history is merged into the account at sign-in and its entries carry
    // the time they were watched. A month-old S1E1 must not rewind an account
    // that has since reached S2E7 (§9: a correct progression is never
    // arbitrarily overwritten).
    const stored = fields({
      position: 1934, duration: 2830, season: 2, episode: 7, observedAt: 1_700_000_000_000,
    });
    const staleGuestEntry = fields({
      position: 40, duration: 1400, season: 1, episode: 1, observedAt: 1_690_000_000_000,
    });
    assert.equal(resolveProgression(stored, staleGuestEntry), stored);
  });

  it('ACCEPTS a newer observation of a different episode', () => {
    // The honest version of the same shape: a more recent observation of another
    // episode IS the viewer having moved on.
    const stored = fields({
      position: 1934, duration: 2830, season: 2, episode: 7, observedAt: 1_690_000_000_000,
    });
    const newer = fields({
      position: 40, duration: 1400, season: 1, episode: 1, observedAt: 1_700_000_000_000,
    });
    assert.equal(resolveProgression(stored, newer), newer);
  });

  it('treats a missing timestamp as "this is happening now"', () => {
    // The player's own progress messages carry no timestamp. A caller that does
    // not order observations must not be locked out by one that does.
    const stored = fields({
      position: 1934, duration: 2830, season: 2, episode: 7, observedAt: 1_700_000_000_000,
    });
    const fromPlayer = fields({position: 5, duration: 1400, season: 1, episode: 1});
    assert.equal(resolveProgression(stored, fromPlayer), fromPlayer);
  });

  it('accepts an observation that is older only by ordinary clock skew', () => {
    // The server compares the viewer's timestamp against `last_updated`, which
    // the database wrote. Two clocks do not agree exactly, so a genuine episode
    // change can arrive looking a few minutes old. If that were read as stale,
    // a phone running slow could never move its season again.
    const stored = fields({
      position: 1934, duration: 2830, season: 2, episode: 7, observedAt: 1_700_000_000_000,
    });
    const slightlyOld = fields({
      position: 12, duration: 1400, season: 1, episode: 2, observedAt: 1_700_000_000_000 - 90_000,
    });
    assert.equal(resolveProgression(stored, slightlyOld), slightlyOld);
  });

  it('refuses an observation just past the skew tolerance', () => {
    // The boundary the previous test sits under, stated so that widening the
    // tolerance is a deliberate act rather than an accident: past a day, the
    // rule says this is not a clock disagreeing, it is old news.
    const storedAt = 1_700_000_000_000;
    const stored = fields({
      position: 1934, duration: 2830, season: 2, episode: 7, observedAt: storedAt,
    });
    const beyond = fields({
      position: 12, duration: 1400, season: 1, episode: 2,
      observedAt: storedAt - OBSERVATION_TOLERANCE_MS - 1,
    });
    assert.equal(resolveProgression(stored, beyond), stored);
  });

  it('accepts an observation exactly at the skew tolerance', () => {
    const storedAt = 1_700_000_000_000;
    const stored = fields({
      position: 1934, duration: 2830, season: 2, episode: 7, observedAt: storedAt,
    });
    const boundary = fields({
      position: 12, duration: 1400, season: 1, episode: 2,
      observedAt: storedAt - OBSERVATION_TOLERANCE_MS,
    });
    assert.equal(resolveProgression(stored, boundary), boundary);
  });

  it('records the latest sighting when neither side measured anything', () => {
    const stored = fields({season: 1, episode: 1, observedAt: 1_690_000_000_000});
    const newer = fields({season: 1, episode: 2, observedAt: 1_700_000_000_000});
    assert.equal(resolveProgression(stored, newer), newer);
    assert.equal(resolveProgression(newer, stored), newer);
  });

  it('stores the first measured position of a new episode', () => {
    // The stored slot was only ever "looked at"; now there is a measurement.
    const stored = fields({position: null, duration: null, season: 3, episode: 4});
    const incoming = fields({position: 10, duration: 900, season: 3, episode: 5});
    assert.equal(resolveProgression(stored, incoming), incoming);
  });

  it('treats a move into the specials season as an episode change', () => {
    const stored = fields({position: 1300, duration: 1439.2, season: 1, episode: 1});
    const special = fields({position: 10, duration: 600, season: 0, episode: 1});
    assert.equal(resolveProgression(stored, special), special);
  });
});

describe('resolveProgression — the same slot', () => {
  /**
   * A 47:10 runtime, i.e. 2830 s, so that the brief's own example —
   * "Saison 2 · Épisode 7 · 32:14 / 47:10" — is a position 68% of the way in
   * rather than past the end. Getting this wrong is not cosmetic: a position
   * that EXCEEDS its duration reads as complete (ratio > 0.95), which switches
   * the rule into its "this is a rewatch" branch and lets the position rewind.
   */
  const RUNTIME = 2830;
  const storedAt = (position: number, duration = RUNTIME) =>
    fields({position, duration, season: 2, episode: 7});

  it('keeps the stored position when the incoming value has none', () => {
    const stored = storedAt(1934); // 32:14 of 47:10
    const incoming = fields({position: null, duration: null, season: 2, episode: 7});
    assert.equal(resolveProgression(stored, incoming), stored);
  });

  it('accepts a forward move', () => {
    const stored = storedAt(1934);
    const incoming = storedAt(2000);
    assert.equal(resolveProgression(stored, incoming), incoming);
  });

  it('accepts an unchanged position', () => {
    const stored = storedAt(1934);
    const incoming = storedAt(1934);
    assert.equal(resolveProgression(stored, incoming), incoming);
  });

  it('REFUSES a backward move — the case measured on VidLink', () => {
    // Measured: when its player mounts, VidLink emits its progress envelope
    // with `watched: 0`, and the real position only appears as playback
    // advances. Taking the newest value blindly therefore resets a 32-minute
    // position to zero on every page load. This is the test that pins the fix.
    const stored = storedAt(1934);
    const freshPageLoad = storedAt(0);
    assert.equal(resolveProgression(stored, freshPageLoad), stored);
    assert.equal(resolveProgression(stored, freshPageLoad).position, 1934);
  });

  it('refuses a backward move even when the observation is much newer', () => {
    // Nothing in this function compares timestamps: a later observation is not
    // a reason to rewind. Ordering between two DEVICES is decided by the caller
    // that knows the timestamps; the position rule is monotonic.
    const stored = storedAt(1934);
    const olderDevice = fields({position: 60, duration: RUNTIME, season: 2, episode: 7});
    assert.equal(resolveProgression(stored, olderDevice), stored);
  });

  it('ALLOWS a backward move when the stored position was already complete', () => {
    // A finished title being restarted is the one situation where moving
    // backwards is what the viewer asked for.
    const finished = storedAt(RUNTIME);
    const restarted = storedAt(0);
    assert.equal(resolveProgression(finished, restarted), restarted);
  });

  it('treats a stored position with no duration as unfinished', () => {
    const stored = fields({position: 5000, duration: null, season: 2, episode: 7});
    const incoming = fields({position: 10, duration: RUNTIME, season: 2, episode: 7});
    assert.equal(resolveProgression(stored, incoming), stored);
  });

  it('stores the first position seen when the stored row has none', () => {
    const stored = fields({position: null, duration: null, season: 2, episode: 7});
    const incoming = storedAt(1934);
    assert.equal(resolveProgression(stored, incoming), incoming);
  });
});

describe('resolveProgression — movies', () => {
  it('compares positions across the null season/episode slot', () => {
    const stored = fields({position: 3000, duration: 5400});
    const incoming = fields({position: 3010, duration: 5400});
    assert.equal(resolveProgression(stored, incoming), incoming);
    assert.equal(resolveProgression(incoming, stored), incoming);
  });
});

describe('progressionColumns — what a write is allowed to set', () => {
  /**
   * These pin the server's write decision. Every case below is a row that can be
   * created by real traffic — a second device, a guest merge, a click on an
   * episode — and the property under test is that the columns returned always
   * come from ONE observation. A row whose position came from one observation and
   * whose episode number came from the other is the defect these replace.
   */
  it('writes NOTHING when the stored observation wins', () => {
    // A month-old guest entry for a different episode, merged at sign-in. The
    // stored row is right; the incoming one has nothing to contribute, including
    // its season and episode.
    const stored = fields({
      position: 1934, duration: 2830, season: 2, episode: 7, observedAt: 1_700_000_000_000,
    });
    const stale = fields({
      position: 40, duration: 1400, season: 1, episode: 1, observedAt: 1_690_000_000_000,
    });
    assert.deepEqual(progressionColumns(stored, stale), {
      currentTime: null, totalDuration: null, season: null, episode: null,
    });
  });

  it('writes the position and the slot TOGETHER when the incoming one wins', () => {
    const stored = fields({ position: 1934, duration: 2830, season: 1, episode: 1 });
    const incoming = fields({ position: 45, duration: 2800, season: 1, episode: 2 });
    assert.deepEqual(progressionColumns(stored, incoming), {
      currentTime: 45, totalDuration: 2800, season: 1, episode: 2,
    });
  });

  it('keeps the stored position when the incoming observation measured nothing', () => {
    // Pin for R3-F2. Clicking the next episode in a list is not watching it, and
    // a viewer who had reached 32:14 came back to "no position to resume" — the
    // position was discarded here, and nothing else in the row could restore it.
    const stored = fields({ position: 1934, duration: 2830, season: 1, episode: 1 });
    const clicked = fields({ season: 1, episode: 2 });
    assert.deepEqual(progressionColumns(stored, clicked), {
      currentTime: null, totalDuration: null, season: null, episode: null,
    });
  });

  it('records the slot alone when the title was never measured', () => {
    // The one case where a slot move without a position is both real and safe:
    // there is no stored position that the new episode number could misdescribe.
    const stored = fields({ season: 1, episode: 1 });
    const incoming = fields({ season: 1, episode: 2 });
    assert.deepEqual(progressionColumns(stored, incoming), {
      currentTime: null, totalDuration: null, season: 1, episode: 2,
    });
  });

  it('never mixes the two observations in one result', () => {
    // The invariant, stated over the cases above so that a future edit which
    // reintroduces the contradiction fails here rather than in production.
    const stored = fields({
      position: 1934, duration: 2830, season: 2, episode: 7, observedAt: 1_700_000_000_000,
    });
    const incomings = [
      fields({ position: 40, duration: 1400, season: 1, episode: 1, observedAt: 1_690_000_000_000 }),
      fields({ position: 45, duration: 2800, season: 1, episode: 2, observedAt: 1_700_000_100_000 }),
      fields({ season: 1, episode: 2 }),
      fields({ position: 2000, duration: 2830, season: 2, episode: 7 }),
    ];

    for (const incoming of incomings) {
      const columns = progressionColumns(stored, incoming);
      const fromIncoming = [
        columns.currentTime === incoming.position,
        columns.season === incoming.season,
        columns.episode === incoming.episode,
      ];
      const allFromIncoming = fromIncoming.every(Boolean);
      const allStored = columns.currentTime === null && columns.season === null && columns.episode === null;
      assert.ok(
        allFromIncoming || allStored,
        `columns mixed the two observations: ${JSON.stringify(columns)}`,
      );
    }
  });
});

describe('resolveProgression — the contract callers depend on', () => {
  it('returns one of its two arguments BY REFERENCE', () => {
    // Both callers identify the winner by identity rather than by re-deriving
    // it from the numbers. If this function ever started returning a new object,
    // the browser would silently read "the incoming value did not win" for every
    // merge and the stored position would be frozen forever.
    const stored = fields({position: 100, duration: 1000, season: 1, episode: 1});
    const later = fields({position: 200, duration: 1000, season: 1, episode: 1});
    const earlier = fields({position: 50, duration: 1000, season: 1, episode: 1});

    assert.ok(resolveProgression(stored, later) === later);
    assert.ok(resolveProgression(stored, earlier) === stored);
    assert.ok(resolveProgression(undefined, later) === later);
  });
});
