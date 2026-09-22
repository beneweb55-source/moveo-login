/**
 * The timecode shown on a history card.
 *
 * §10 of the audit brief specifies the display as "32:14 / 47:10", and §21
 * forbids the interface claiming a state it cannot observe. The distinction
 * these tests exist to protect is between a MEASURED 0:00 (the start of the
 * video) and an UNMEASURED position (we were never told anything), because
 * collapsing the two is what let a "Reprendre" button appear on a title the
 * viewer had only opened.
 *
 * Run: node --import tsx --test tests/timecode.test.ts
 */

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {formatProgress, formatTimecode} from '../lib/timecode';

describe('formatTimecode', () => {
  const cases: Array<[number, string]> = [
    [0, '0:00'],
    [1, '0:01'],
    [59, '0:59'],
    [60, '1:00'],
    [61, '1:01'],
    [599, '9:59'],
    [1934, '32:14'], // the brief's own example
    [2829, '47:09'],
    [2830, '47:10'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [3725, '1:02:05'],
    [86399, '23:59:59'],
  ];

  for (const [seconds, expected] of cases) {
    it(`renders ${seconds}s as ${expected}`, () => {
      assert.equal(formatTimecode(seconds), expected);
    });
  }

  it('rounds down, never up — a position is where the viewer IS', () => {
    // 21.206 s was the position measured on VidLink. Showing 0:22 would claim
    // the viewer is a second further along than the measurement says.
    assert.equal(formatTimecode(21.206035), '0:21');
    assert.equal(formatTimecode(59.999), '0:59');
  });

  it('returns an empty string for a value that is not a measured time', () => {
    // Never "0:00". An empty string is what tells the caller "we have nothing",
    // and the caller must render nothing rather than a zero.
    for (const value of [
      undefined,
      null,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -1,
      -0.5,
    ]) {
      assert.equal(formatTimecode(value as number), '', String(value));
    }
  });
});

describe('formatProgress', () => {
  it('renders the pair the brief specifies', () => {
    assert.equal(formatProgress(1934, 2830), '32:14 / 47:10');
  });

  it('renders a measured zero position as a real timecode', () => {
    // 0 is not "unknown". It is the start of the video, and it is a position we
    // are entitled to show precisely because it was measured.
    assert.equal(formatProgress(0, 2830), '0:00 / 47:10');
  });

  it('shows nothing when the position was never measured', () => {
    // The duration alone must not produce "/ 47:10": a runtime with no position
    // invites the reader to infer a progress that does not exist.
    assert.equal(formatProgress(undefined, 2830), '');
    assert.equal(formatProgress(null, null), '');
  });

  it('falls back to the position alone when the runtime is not known', () => {
    assert.equal(formatProgress(1934, undefined), '32:14');
    assert.equal(formatProgress(1934, 0), '32:14');
  });

  it('never emits a partial "x / " for a broken duration', () => {
    assert.equal(formatProgress(1934, Number.NaN), '32:14');
    assert.equal(formatProgress(1934, -10), '32:14');
  });

  it('handles a film longer than an hour on both sides', () => {
    assert.equal(formatProgress(3725, 7200), '1:02:05 / 2:00:00');
  });
});
