/**
 * postMessage validation: origin, sender, payload shape and numeric sanity.
 *
 * Run: node --import tsx --test tests/playerMessages.test.ts
 */

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {parsePlaybackProgress, type MessageValidationContext} from '../lib/playerMessages';

const FRAME = {name: 'iframe-window'} as unknown as Window;
const ATTACKER = {name: 'other-window'} as unknown as Window;

/** A context that passes every check, so each test can vary exactly one thing. */
const valid = (over: Partial<MessageValidationContext> = {}): MessageValidationContext => ({
  origin: 'https://frembed.surf',
  source: FRAME,
  expectedSource: FRAME,
  allowedOrigins: ['https://frembed.surf'],
  ...over,
});

const timeupdate = {event: 'timeupdate', data: {currentTime: 30, duration: 120}};

describe('origin validation', () => {
  it('accepts a message from a verified provider origin', () => {
    assert.deepEqual(parsePlaybackProgress(timeupdate, valid()), {
      currentTime: 30,
      duration: 120,
    });
  });

  it('rejects any origin not on the allowlist', () => {
    const ctx = valid({origin: 'https://evil.example'});
    assert.equal(parsePlaybackProgress(timeupdate, ctx), null);
  });

  it('rejects the literal wildcard origin', () => {
    for (const origin of ['*', '']) {
      assert.equal(parsePlaybackProgress(timeupdate, valid({origin})), null);
    }
  });

  it('rejects a non-string origin', () => {
    for (const origin of [null, undefined, 42, {}, ['https://frembed.surf']]) {
      assert.equal(parsePlaybackProgress(timeupdate, valid({origin})), null);
    }
  });

  it('rejects everything when the allowlist is empty', () => {
    // This is the case for every provider that has never been observed sending
    // a real playback event. They must be able to send nothing at all.
    assert.equal(parsePlaybackProgress(timeupdate, valid({allowedOrigins: []})), null);
    assert.equal(
      parsePlaybackProgress(
        timeupdate,
        valid({allowedOrigins: [], origin: 'https://frembed.surf'}),
      ),
      null,
    );
  });

  it('rejects a lookalike origin that merely contains the allowed one', () => {
    for (const origin of [
      'https://frembed.surf.evil.example',
      'https://evil.example/frembed.surf',
      'http://frembed.surf',
      'https://frembed.surf:8443',
      'https://sub.frembed.surf',
    ]) {
      assert.equal(parsePlaybackProgress(timeupdate, valid({origin})), null, origin);
    }
  });
});

describe('sender validation', () => {
  it('rejects a message from a different window on an allowed origin', () => {
    // An ad iframe served from the provider's own origin is still a different
    // window, and must not be able to write into watch history.
    assert.equal(parsePlaybackProgress(timeupdate, valid({source: ATTACKER})), null);
  });

  it('rejects when we cannot identify the mounted frame', () => {
    assert.equal(parsePlaybackProgress(timeupdate, valid({expectedSource: null})), null);
    assert.equal(parsePlaybackProgress(timeupdate, valid({expectedSource: undefined})), null);
  });

  it('rejects when the event carries no source', () => {
    assert.equal(parsePlaybackProgress(timeupdate, valid({source: null})), null);
  });
});

describe('payload shape', () => {
  it('accepts the nested event/data shape', () => {
    assert.deepEqual(parsePlaybackProgress(timeupdate, valid()), {
      currentTime: 30,
      duration: 120,
    });
  });

  it('accepts the MEDIA_DATA shape', () => {
    const data = {type: 'MEDIA_DATA', data: {currentTime: 12, duration: 60}};
    assert.deepEqual(parsePlaybackProgress(data, valid()), {currentTime: 12, duration: 60});
  });

  it('accepts the flat timeupdate shape', () => {
    const data = {type: 'timeupdate', currentTime: 5, duration: 100};
    assert.deepEqual(parsePlaybackProgress(data, valid()), {currentTime: 5, duration: 100});
  });

  it('accepts numeric strings', () => {
    const data = {type: 'timeupdate', currentTime: '5.5', duration: '100'};
    assert.deepEqual(parsePlaybackProgress(data, valid()), {currentTime: 5.5, duration: 100});
  });

  it('ignores episode_change — it is not a playback event', () => {
    // The audit observed the provider emit exactly this message. It carries no
    // position, and treating it as playback would be inventing an event.
    const data = {event: 'episode_change', data: {season: 1, episode: 2}};
    assert.equal(parsePlaybackProgress(data, valid()), null);
    assert.equal(
      parsePlaybackProgress({type: 'episode_change', data: {season: 1, episode: 2}}, valid()),
      null,
    );
    assert.equal(
      parsePlaybackProgress({type: 'episode_change', currentTime: 1, duration: 2}, valid()),
      null,
    );
  });

  it('rejects a recognised shape carrying no position fields', () => {
    assert.equal(parsePlaybackProgress({event: 'timeupdate', data: {}}, valid()), null);
    assert.equal(parsePlaybackProgress({type: 'timeupdate'}, valid()), null);
  });

  it('rejects non-object payloads', () => {
    for (const data of [null, undefined, 'timeupdate', 42, true, []]) {
      assert.equal(parsePlaybackProgress(data, valid()), null);
    }
  });

  it('rejects a payload whose nested data is not an object', () => {
    assert.equal(parsePlaybackProgress({event: 'timeupdate', data: 'nope'}, valid()), null);
    assert.equal(parsePlaybackProgress({event: 'timeupdate', data: [1, 2]}, valid()), null);
  });

  it('rejects an unknown message type', () => {
    assert.equal(parsePlaybackProgress({type: 'ready'}, valid()), null);
    assert.equal(
      parsePlaybackProgress({event: 'play', data: {currentTime: 0, duration: 10}}, valid()),
      null,
    );
  });

  it('rejects an array wrapping a valid message', () => {
    assert.equal(parsePlaybackProgress([timeupdate], valid()), null);
  });
});

describe('numeric sanity', () => {
  const cases: Array<[string, unknown, unknown]> = [
    ['NaN currentTime', Number.NaN, 100],
    ['NaN duration', 10, Number.NaN],
    ['Infinity duration', 10, Number.POSITIVE_INFINITY],
    ['-Infinity currentTime', Number.NEGATIVE_INFINITY, 100],
    ['zero duration', 10, 0],
    ['negative duration', 10, -5],
    ['negative currentTime', -1, 100],
    ['currentTime beyond duration', 500, 100],
    ['boolean currentTime', true, 100],
    ['null duration', 10, null],
    ['non-numeric string', 'abc', 100],
    ['empty string', '', 100],
    ['object currentTime', {}, 100],
    ['array duration', 10, [100]],
  ];

  for (const [label, currentTime, duration] of cases) {
    it(`rejects ${label}`, () => {
      const data = {event: 'timeupdate', data: {currentTime, duration}};
      assert.equal(parsePlaybackProgress(data, valid()), null);
    });
  }

  it('accepts the boundaries', () => {
    assert.deepEqual(
      parsePlaybackProgress({event: 'timeupdate', data: {currentTime: 0, duration: 1}}, valid()),
      {currentTime: 0, duration: 1},
    );
    assert.deepEqual(
      parsePlaybackProgress(
        {event: 'timeupdate', data: {currentTime: 300, duration: 300}},
        valid(),
      ),
      {currentTime: 300, duration: 300},
    );
  });

  it('returns a value that survives JSON serialisation', () => {
    // Regression: Infinity previously reached JSON.stringify, which turns it
    // into null, so the stored progress did not round-trip.
    const parsed = parsePlaybackProgress(timeupdate, valid());
    assert.ok(parsed);
    assert.deepEqual(JSON.parse(JSON.stringify(parsed)), parsed);
  });

  it('returns plain finite numbers, never a string', () => {
    const parsed = parsePlaybackProgress(
      {type: 'timeupdate', currentTime: '30', duration: '120'},
      valid(),
    );
    assert.equal(typeof parsed?.currentTime, 'number');
    assert.equal(typeof parsed?.duration, 'number');
  });
});

describe('rejection is silent and total', () => {
  it('does not throw on hostile input', () => {
    const hostile: unknown[] = [
      Object.create(null),
      {event: 'timeupdate', data: {currentTime: {valueOf: () => 5}, duration: 10}},
    ];
    for (const data of hostile) {
      assert.doesNotThrow(() => parsePlaybackProgress(data, valid()));
    }
  });

  it('rejects an object built to break property access, without throwing', () => {
    // Reading properties off untrusted data can itself throw. That must not
    // escape into the caller's message handler.
    const trap = new Proxy(
      {},
      {
        get() {
          throw new Error('boom');
        },
      },
    );
    assert.doesNotThrow(() => parsePlaybackProgress(trap, valid()));
    assert.equal(parsePlaybackProgress(trap, valid()), null);
  });
});

describe('magnitude bounds', () => {
  it('rejects absurd but internally consistent values', () => {
    // Finiteness plus currentTime <= duration is not sufficient on its own:
    // this pair passes every other check and would be persisted verbatim.
    const absurd = {event: 'timeupdate', data: {currentTime: 1e308, duration: 1e308}};
    assert.equal(parsePlaybackProgress(absurd, valid()), null);
  });

  it('rejects a duration beyond any real title', () => {
    const tooLong = {event: 'timeupdate', data: {currentTime: 10, duration: 24 * 60 * 60 + 1}};
    assert.equal(parsePlaybackProgress(tooLong, valid()), null);
  });

  it('still accepts a long but plausible title', () => {
    const threeHours = {event: 'timeupdate', data: {currentTime: 60, duration: 3 * 60 * 60}};
    assert.deepEqual(parsePlaybackProgress(threeHours, valid()), {
      currentTime: 60,
      duration: 3 * 60 * 60,
    });
  });

  it('accepts the boundary itself', () => {
    const boundary = {event: 'timeupdate', data: {currentTime: 0, duration: 24 * 60 * 60}};
    assert.deepEqual(parsePlaybackProgress(boundary, valid()), {
      currentTime: 0,
      duration: 24 * 60 * 60,
    });
  });

  it('applies the bound to the MEDIA_DATA shape too', () => {
    const mediaData = {type: 'MEDIA_DATA', data: {currentTime: 1e308, duration: 1e308}};
    assert.equal(parsePlaybackProgress(mediaData, valid()), null);
  });
});
