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
import {readFileSync} from 'node:fs';
import path from 'node:path';
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

/**
 * The section heading above the player box, which is a different UI element from
 * the advisory notice above but was making the same class of claim about it.
 *
 * MEASURED, production, 2026-09-22. On `/movie/969681` the heading read "Lecture
 * en cours" for the whole 132-second session while nothing played: the only
 * position-bearing messages the frame sent were the provider's stored snapshots
 * at a 2000 ms cadence, every one of them `{watched: 0, duration: 0}`, and no
 * `timeupdate` shape ever arrived. The heading had no signal behind it in either
 * direction — it was rendered unconditionally, before the frame had said
 * anything at all.
 *
 * §15: "Aucune UI ne doit annoncer 'Lecture en cours' sans signal fiable de
 * lecture." The honest fix is not to detect playback in the parent — it cannot
 * be detected in a cross-origin frame — but to stop claiming a state and name
 * the section instead, which is what these assertions hold in place.
 */
describe('the player section heading must not claim a playback state', () => {
  const PAGES = ['app/movie/[id]/page.tsx', 'app/tv/[id]/page.tsx'];

  it('has no locale carrying a "nowPlaying" heading under details', () => {
    for (const locale of LOCALES) {
      const keys = Object.keys(translations[locale].details);
      assert.equal(
        keys.includes('nowPlaying'),
        false,
        `${locale}.details.nowPlaying is back — that key is what rendered a ` +
          `playback claim across the player before any signal arrived`,
      );
    }
  });

  it('names the section in every locale, and the name is not empty', () => {
    for (const locale of LOCALES) {
      const label = translations[locale].details.videoPlayer;
      assert.equal(typeof label, 'string');
      assert.ok(label.trim().length > 0, `${locale}: the heading must not be empty`);
    }
  });

  it('is what both detail pages actually render', () => {
    // The source-level half, and it is not redundant: the heading could be
    // restored without reintroducing the key, by inlining the literal. This
    // pins the WIRING — the key that exists is the key the pages use.
    for (const relative of PAGES) {
      const page = readFileSync(path.join(process.cwd(), relative), 'utf8');
      assert.match(
        page,
        /t\.details\.videoPlayer/,
        `${relative} must render the section name`,
      );
      assert.equal(
        /t\.details\.nowPlaying/.test(page),
        false,
        `${relative} renders a key that no longer exists in either locale`,
      );
    }
  });
});
