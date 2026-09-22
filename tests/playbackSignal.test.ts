/**
 * The playback signal that gates watch time.
 *
 * WHY THESE ARE REAL TESTS AND NOT A FORMALITY. `lib/playbackSignal.ts` is the
 * only thing standing between §13 and the defect it names: `WatchTimer` accrues
 * watch time, and it asks this module whether anything verifiable has played. A
 * bug here is not a wrong number in a corner — it is an hour of "watch time" for
 * a tab left open on a detail page, and a resume list reordered by page presence
 * rather than by viewing.
 *
 * The module's own docstring claimed "Tested in tests/playbackSignal.test.ts"
 * while that file did not exist. The claim was found during the audit; the file
 * below is the claim being made true rather than deleted, because §28 forbids a
 * test that is asserted and not performed.
 *
 * Run: node --import tsx --test tests/playbackSignal.test.ts
 */

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {describe, it, beforeEach} from 'node:test';

import {
  __resetPlaybackSignal,
  hasPlaybackBeenObserved,
  markPlaybackObserved,
  playbackKey,
} from '../lib/playbackSignal';

describe('playbackSignal', () => {
  beforeEach(() => {
    __resetPlaybackSignal();
  });

  it('reports "not observed" before anything has been marked', () => {
    // The default has to be the pessimistic one. If this returned true, every
    // page open would report viewing without a single frame having played.
    assert.equal(hasPlaybackBeenObserved('tv', 1399), false);
  });

  it('reports "observed" once the player has marked it', () => {
    markPlaybackObserved('tv', 1399);
    assert.equal(hasPlaybackBeenObserved('tv', 1399), true);
  });

  it('keeps the media TYPE in the key', () => {
    // TMDB numbers films and series in separate namespaces, so 550 is both a
    // film and, on another day, a series' number. Without the type in the key,
    // playback of one would grant watch time to the other.
    markPlaybackObserved('movie', 550);
    assert.equal(hasPlaybackBeenObserved('movie', 550), true);
    assert.equal(hasPlaybackBeenObserved('tv', 550), false);
  });

  it('does not leak one title into another', () => {
    markPlaybackObserved('tv', 1399);
    assert.equal(hasPlaybackBeenObserved('tv', 1396), false);
    assert.equal(hasPlaybackBeenObserved('movie', 1399), false);
  });

  it('treats a numeric id and its string form as the same title', () => {
    // The player receives `id` from a route param (a string) in some paths and
    // from JSON (a number) in others. If those produced two keys, playback on
    // one path would leave the timer asking about the other.
    assert.equal(playbackKey('tv', 1399), playbackKey('tv', '1399'));
    markPlaybackObserved('tv', '1399');
    assert.equal(hasPlaybackBeenObserved('tv', 1399), true);
  });

  it('forgets everything when reset', () => {
    // The seam exists so that the other cases in this file are independent; a
    // leak between them would be the same defect these tests are about.
    markPlaybackObserved('tv', 1399);
    __resetPlaybackSignal();
    assert.equal(hasPlaybackBeenObserved('tv', 1399), false);
  });

  it('does not persist the signal anywhere', () => {
    // SCOPE, asserted rather than trusted. The docstring says the signal is
    // in-memory "deliberately" and that persisting it "would claim a previous
    // visit's playback for this one, which is the same lie in a different
    // place". That is a property of the source, not of a call: a stored flag is
    // added by editing this file, and no runtime case could catch it, because
    // the module would still behave correctly within one page session.
    const source = readFileSync(
      new URL('../lib/playbackSignal.ts', import.meta.url),
      'utf8',
    );
    for (const store of ['localStorage', 'sessionStorage', 'document.cookie', 'indexedDB']) {
      assert.equal(
        source.includes(store),
        false,
        `playbackSignal must not touch ${store}: a persisted signal claims a previous visit's playback`,
      );
    }
  });

  it('works with no browser present at all', () => {
    // It is imported by a module that also runs on the server. Reaching for a
    // DOM API here would throw during that import, so the absence of window in
    // this Node process is the point rather than an accident.
    assert.equal(typeof globalThis.window, 'undefined');
    markPlaybackObserved('tv', 42);
    assert.equal(hasPlaybackBeenObserved('tv', 42), true);
  });
});
