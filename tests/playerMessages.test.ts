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

  it('rejects the MEDIA_DATA shape this suite used to assert', () => {
    // This exact payload — `data: {currentTime, duration}` — was asserted here
    // as accepted. It was never observed from any provider: it had been written
    // to match the parser rather than the parser written to match the wire, so
    // passing it proved nothing about a real provider and hid two real defects
    // (no origin allowlisted for VidLink, and a field path that does not exist).
    // It is now a REJECTION case, because it carries no media id to resolve.
    const data = {type: 'MEDIA_DATA', data: {currentTime: 12, duration: 60}};
    assert.equal(parsePlaybackProgress(data, valid()), null);
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

});

// ---------------------------------------------------------------------------
// MEDIA_DATA — VidLink's envelope, in the shape it was MEASURED sending.
//
// Captured on a live Chrome from origin https://vidlink.pro at
// https://vidlink.pro/tv/1429/1/1, every 2000 ms. A representative payload:
//
//   {"type":"MEDIA_DATA","data":{"1429":{
//      "id":1429,"type":"tv",
//      "progress":{"watched":0,"duration":1439.2},
//      "last_season_watched":"1","last_episode_watched":"1",
//      "show_progress":{"s1e1":{"season":"1","episode":"1",
//        "progress":{"watched":21.206035,"duration":1439.2}}}}}}
//
// Two things in it are load-bearing, and both were observed rather than
// reasoned about: the payload is keyed by media id, and the media-level
// `progress` did NOT track the episode being played — at the moment
// `show_progress.s1e1.progress.watched` read 21.206035, the media-level
// `progress.watched` still read 0. Reading the obvious field would have stored
// a permanent 0:00, which is worse than storing nothing.
// ---------------------------------------------------------------------------

/**
 * Builds the measured envelope for a series episode.
 *
 * The media-level pair is settable SEPARATELY from the per-episode pair, which
 * is the whole point: the measured payload carries both, and the media-level one
 * does not track the episode. A helper that wrote one duration into both places
 * could not express the movie case, whose observed pair is `{watched: 0,
 * duration: 0}` — the zero was invisible and the test asserted against 1439.2.
 */
const seriesEnvelope = (
  over: {
    id?: string | number;
    season?: string | number;
    episode?: string | number;
    watched?: unknown;
    duration?: unknown;
    mediaLevelWatched?: unknown;
    mediaLevelDuration?: unknown;
    type?: string;
  } = {},
) => {
  const id = over.id ?? 1429;
  const season = over.season ?? '1';
  const episode = over.episode ?? '1';
  return {
    type: 'MEDIA_DATA',
    data: {
      [String(id)]: {
        id,
        type: over.type ?? 'tv',
        progress: {
          watched: over.mediaLevelWatched ?? 0,
          duration: over.mediaLevelDuration ?? 1439.2,
        },
        last_season_watched: String(season),
        last_episode_watched: String(episode),
        show_progress: {
          [`s${season}e${episode}`]: {
            season: String(season),
            episode: String(episode),
            progress: {
              watched: over.watched ?? 21.206035,
              duration: over.duration ?? 1439.2,
            },
          },
        },
      },
    },
  };
};

/** The context a series page supplies: which id, which episode. */
const seriesCtx = (over: Partial<MessageValidationContext> = {}) =>
  valid({
    origin: 'https://vidlink.pro',
    allowedOrigins: ['https://vidlink.pro'],
    mediaId: '1429',
    season: 1,
    episode: 1,
    ...over,
  });

describe('MEDIA_DATA — the measured VidLink shape', () => {
  it('reads the per-episode position, not the media-level one', () => {
    assert.deepEqual(parsePlaybackProgress(seriesEnvelope(), seriesCtx()), {
      currentTime: 21.206035,
      duration: 1439.2,
    });
  });

  it('reads the media-level progress as 0 and would be wrong — which is why it is not read', () => {
    // The measured payload carries BOTH. The media-level field says 0 while the
    // episode is at 21.206. This test pins that the parser prefers the episode
    // entry, so a future refactor cannot quietly switch to the field that is
    // always zero.
    const envelope = seriesEnvelope({mediaLevelWatched: 0, watched: 21.206035});
    const parsed = parsePlaybackProgress(envelope, seriesCtx());
    assert.equal(parsed?.currentTime, 21.206035);
    assert.notEqual(parsed?.currentTime, 0);
  });

  it('treats season 0 as a real slot, not as "no season"', () => {
    const envelope = seriesEnvelope({season: '0', episode: '3', watched: 7.5});
    assert.deepEqual(parsePlaybackProgress(envelope, seriesCtx({season: 0, episode: 3})), {
      currentTime: 7.5,
      duration: 1439.2,
    });
  });

  it('rejects when the context names no media id', () => {
    // Without the id we cannot tell which entry in the payload is ours, and
    // picking one would be a guess.
    const ctx = seriesCtx();
    delete (ctx as {mediaId?: string}).mediaId;
    assert.equal(parsePlaybackProgress(seriesEnvelope(), ctx), null);
  });

  it('rejects an envelope for a different title', () => {
    assert.equal(parsePlaybackProgress(seriesEnvelope({id: 999}), seriesCtx()), null);
  });

  it('rejects when the episode we asked for is absent, rather than using another one', () => {
    // `last_season_watched`/`last_episode_watched` are in the payload and DO
    // name an episode with a position. Falling back to them would attribute a
    // position to whichever episode this page happens to be showing.
    const envelope = seriesEnvelope({season: '4', episode: '28'});
    assert.equal(parsePlaybackProgress(envelope, seriesCtx({season: 2, episode: 7})), null);
  });

  it('rejects a series envelope whose progress pair is not usable', () => {
    assert.equal(
      parsePlaybackProgress(seriesEnvelope({duration: 0}), seriesCtx()),
      null,
      'a zero duration is not a runtime',
    );
    assert.equal(
      parsePlaybackProgress(seriesEnvelope({watched: 5000, duration: 100}), seriesCtx()),
      null,
      'a position past the end is not a position',
    );
    assert.equal(
      parsePlaybackProgress(seriesEnvelope({watched: 1e308, duration: 1e308}), seriesCtx()),
      null,
      'the 24-hour bound still applies',
    );
  });

  it('rejects a series envelope that has no show_progress at all', () => {
    const envelope = seriesEnvelope();
    delete (envelope.data['1429'] as {show_progress?: unknown}).show_progress;
    assert.equal(parsePlaybackProgress(envelope, seriesCtx()), null);
  });

  it('reads a movie from the media-level progress', () => {
    const playing = seriesEnvelope({
      type: 'movie',
      mediaLevelWatched: 120.5,
      mediaLevelDuration: 5400,
    });
    delete (playing.data['1429'] as {show_progress?: unknown}).show_progress;
    assert.deepEqual(parsePlaybackProgress(playing, seriesCtx()), {
      currentTime: 120.5,
      duration: 5400,
    });
  });

  it('rejects the movie entry as it was actually observed, at rest', () => {
    // MEASURED ONLY AT REST: the one movie entry observed carried
    // {watched: 0, duration: 0}, so an ADVANCING movie position has not been
    // observed. The pair above is the shape read because it is the only
    // position carrier a movie envelope has; this case is what the provider
    // really sent, and it must store nothing rather than a 0:00 of unknown
    // runtime. The two cases are kept apart on purpose: the first is a shape,
    // the second is a measurement, and neither is claimed to be the other.
    const atRest = seriesEnvelope({
      type: 'movie',
      mediaLevelWatched: 0,
      mediaLevelDuration: 0,
    });
    delete (atRest.data['1429'] as {show_progress?: unknown}).show_progress;
    assert.equal(parsePlaybackProgress(atRest, seriesCtx()), null);
  });

  it('does NOT fall through to the media-level progress for a series', () => {
    // The measured series entry carries the media-level `progress` object TOO,
    // reading 0 while the episode was at 21.206 s. So a series envelope whose
    // per-episode entry is missing must store nothing: falling through would
    // read the one field the measurement proved is stale, and would turn every
    // such payload into a 0:00 position that then has to be refused upstream.
    const envelope = seriesEnvelope({mediaLevelWatched: 300, mediaLevelDuration: 1439.2});
    delete (envelope.data['1429'] as {show_progress?: unknown}).show_progress;
    assert.equal(parsePlaybackProgress(envelope, seriesCtx()), null);
  });

  it('does not read the media-level progress when the type is unrecognised', () => {
    // An envelope whose type we do not know tells us nothing about which field
    // describes the viewer, so it stores nothing rather than guessing.
    const envelope = seriesEnvelope({
      type: 'live',
      mediaLevelWatched: 300,
      mediaLevelDuration: 1439.2,
    });
    delete (envelope.data['1429'] as {show_progress?: unknown}).show_progress;
    assert.equal(parsePlaybackProgress(envelope, seriesCtx()), null);
  });

  it('ignores the other envelopes VidLink sends', () => {
    // Observed alongside MEDIA_DATA and carrying no position.
    for (const payload of [
      {type: 'sr'},
      {data: {type: 'initToParent', counterId: 98154677, hid: 'x'}, __yminfo: 'y'},
    ]) {
      assert.equal(parsePlaybackProgress(payload, seriesCtx()), null);
    }
  });

  it('is still gated on origin and sender before any of this is read', () => {
    assert.equal(
      parsePlaybackProgress(seriesEnvelope(), seriesCtx({origin: 'https://evil.example'})),
      null,
    );
    assert.equal(
      parsePlaybackProgress(seriesEnvelope(), seriesCtx({source: ATTACKER})),
      null,
    );
    assert.equal(
      parsePlaybackProgress(seriesEnvelope(), seriesCtx({allowedOrigins: []})),
      null,
    );
  });
});
