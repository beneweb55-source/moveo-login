/**
 * The advisory notice shown while a cross-origin player is loaded.
 *
 * Regression guard for a defect measured in production on 2026-09-21. The
 * notice used to read "Lecture non confirmée" / "Le lecteur est chargé mais ne
 * confirme pas la lecture", asserting a verdict the player cannot reach:
 * `messageOrigins` is empty for every provider that emits nothing we accept, so
 * `parsePlaybackProgress` rejects every message, `playbackObserved` is
 * structurally unreachable, and the notice fired on 100% of loads — including
 * loads where playback was watched advancing on screen:
 *
 *   SmashyStream / anime movie   /movie/129  seek slider 0:18 -> 0:43, "Pause"
 *   SmashyStream / Western movie /movie/550  timecode   0:25 -> 0:52, "Pause"
 *   VidLink      / Korean series /tv/93405   timecode   0:00 -> 0:03, "Pause"
 *
 * The copy therefore must not assert a playback verdict in either direction. It
 * states our own limitation, and names the action that actually unsticks a
 * stalled player: pressing Play inside the player.
 *
 * Run: node --import tsx --test tests/playerNotice.test.ts
 */

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {translations} from '../lib/translations';

const LOCALES = ['fr', 'en'] as const;

/** Wording that asserts a verdict — exactly what the measured defect produced. */
const FORBIDDEN = [
  'ne confirme pas la lecture',
  'not confirming playback',
  'lecture non confirmée',
  'playback not confirmed',
];

describe('advisory notice — must not assert a playback verdict', () => {
  for (const locale of LOCALES) {
    it(`${locale}: does not claim playback is unconfirmed`, () => {
      const details = translations[locale].details;
      const copy = `${details.playbackUnverified} ${details.playbackUnverifiedDesc}`.toLowerCase();
      for (const phrase of FORBIDDEN) {
        assert.ok(
          !copy.includes(phrase.toLowerCase()),
          `"${phrase}" is a verdict the player cannot observe in a cross-origin frame`,
        );
      }
    });

    it(`${locale}: points at the action that unsticks a stalled player`, () => {
      const desc = translations[locale].details.playbackUnverifiedDesc.toLowerCase();
      assert.ok(
        desc.includes('play') || desc.includes('lecture'),
        'the copy should direct the user to the in-player Play control',
      );
    });

    it(`${locale}: supplies a localised dismiss label`, () => {
      const label = translations[locale].details.closeNotice;
      assert.equal(typeof label, 'string');
      assert.ok(label.trim().length > 0, 'dismiss label must not be empty');
    });
  }

  it('keeps the two locales structurally aligned', () => {
    const [fr, en] = LOCALES.map(locale => Object.keys(translations[locale].details).sort());
    assert.deepEqual(fr, en, 'a key added to one locale must be added to the other');
  });
});
