/**
 * THE WRITE CHAIN, EXECUTED RATHER THAN READ.
 *
 * WHY THIS FILE EXISTS WHEN tests/watchRecord.test.ts ALREADY COVERS THE WRITER.
 * That file proves the DECISION (`watchRecord` builds the right entry) and the
 * WIRING (each page calls it once, from a click and not from an effect). Both are
 * source-level or pure-function assertions, and neither one runs
 * `saveWatchHistory`. So the sentence the viewer actually cares about — "I
 * pressed Regarder and the film is in my history" — had never been executed by
 * anything in this repository. §8 names exactly that gap: code correct ≠
 * fonctionnalité validée, and a statistic displayed ≠ real data.
 *
 * WHAT IS DRIVEN HERE, and it is the real modules, not doubles of them:
 *
 *   watchRecord(...)              → the entry
 *   saveWatchHistory(entry, ...)  → utils/historyManager.ts, the single writer
 *   getWatchHistory()             → the store, read back
 *   historyForDisplay({...})      → lib/historyList.ts, what a list renders
 *   globalThis.fetch              → stubbed, so the server half is observable
 *
 * Only the two edges are faked: `window.localStorage` and `fetch`. Everything
 * between them is the production code path.
 *
 * THE THREE THINGS IT PINS, each one a defect that was live on 2026-09-23:
 *
 *   1. THE ENTRY LANDS. A titled film, written through the real writer, is in
 *      the store afterwards and is visible to a list. This is the claim the
 *      viewer made and that nothing had checked.
 *   2. THE DELIBERATE WRITE ANNOUNCES. `lib/useWatchHistory.ts` re-reads on
 *      mount and on `HISTORY_UPDATED_EVENT` and on nothing else, so a write that
 *      announces nothing is a write the on-screen list never learns about.
 *   3. THE PERIODIC WRITE STILL DOES NOT. `components/VideoPlayer.tsx` writes
 *      every `WATCH_PROGRESS_THROTTLE_MS` while a video plays; if that path
 *      announced, every mounted list would re-fetch on that beat — the request
 *      storm §14 forbids. The distinction is the whole reason the option exists,
 *      so it is asserted in both directions rather than only the new one.
 *
 * AND THE FOURTH, which is the server half of the same promise: the entry is
 * POSTed with its TITLE and with NO POSITION. `current_time` must be absent or
 * null, never `0` — `0` is a real position (the start of the film) and writing it
 * as a stand-in for "unknown" is what makes a resume offer that cannot be
 * honoured (§3/§4).
 */

import assert from 'node:assert/strict';
import {afterEach, beforeEach, describe, it} from 'node:test';

import {historyForDisplay} from '../lib/historyList';
import {watchRecord} from '../lib/watchRecord';
import {
  __resetServerSyncLatch,
  getWatchHistory,
  HISTORY_UPDATED_EVENT,
  saveWatchHistory,
} from '../utils/historyManager';

const AT = 1_700_000_000_000;

/** Just enough of Storage. `getItem` answering null is a browser with nothing stored. */
class FakeStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

interface SentRequest {
  readonly url: string;
  readonly body: Record<string, unknown> | null;
}

let storage: FakeStorage;
let announcements: string[];
let sent: SentRequest[];
const realWindow = (globalThis as Record<string, unknown>).window;
const realFetch = (globalThis as Record<string, unknown>).fetch;

beforeEach(() => {
  storage = new FakeStorage();
  announcements = [];
  sent = [];
  __resetServerSyncLatch();

  (globalThis as Record<string, unknown>).window = {
    localStorage: storage,
    // The real listener set lives in lib/useWatchHistory.ts and
    // components/StartedEpisodes.tsx. What this records is that the event WAS
    // dispatched, which is the part the writer is responsible for.
    dispatchEvent: (event: {type: string}) => {
      announcements.push(event.type);
      return true;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  (globalThis as Record<string, unknown>).fetch = async (
    url: string,
    init?: {body?: string},
  ) => {
    sent.push({
      url,
      body: init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    });
    return {ok: true, status: 200, json: async () => ({})};
  };
});

afterEach(() => {
  (globalThis as Record<string, unknown>).window = realWindow;
  (globalThis as Record<string, unknown>).fetch = realFetch;
});

/** The film the viewer pressed Regarder on, in the shape the page builds it. */
const film = () =>
  watchRecord({
    type: 'movie',
    id: '550',
    title: 'Fight Club',
    posterPath: '/poster.jpg',
    now: AT,
  });

/** The POST is fire-and-forget (`void`), so it is awaited by draining the queue. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
};

describe('the deliberate write, executed end to end', () => {
  it('puts the film the viewer started into the store, named', () => {
    const record = film();
    assert.ok(record, 'the writer refused a titled film');
    saveWatchHistory(record, {announce: true});

    const stored = getWatchHistory();
    assert.equal(stored.length, 1, 'the store gained no entry');
    assert.equal(stored[0].id, '550');
    assert.equal(stored[0].type, 'movie');
    assert.equal(stored[0].title, 'Fight Club');
    assert.equal(stored[0].last_watched, AT);
    assert.equal(
      Object.prototype.hasOwnProperty.call(stored[0], 'timestamp'),
      false,
      'a position nothing measured reached the store',
    );
  });

  it('shows it in the list the viewer is looking at', () => {
    // The store is not the thing on screen. This is the step between them.
    const record = film();
    assert.ok(record);
    saveWatchHistory(record, {announce: true});

    const shown = historyForDisplay({
      server: [],
      local: getWatchHistory(),
      viewer: {status: 'ready', owner: null},
    });
    assert.deepEqual(
      shown.map((item) => item.title),
      ['Fight Club'],
    );
  });

  it('announces the change, which is how a list already on screen learns of it', () => {
    const record = film();
    assert.ok(record);
    saveWatchHistory(record, {announce: true});
    assert.deepEqual(announcements, [HISTORY_UPDATED_EVENT]);
  });

  it('sends the title and NO position to the server', async () => {
    const record = film();
    assert.ok(record);
    saveWatchHistory(record, {announce: true});
    await settle();

    assert.equal(sent.length, 1, 'nothing was mirrored to /api/watch-time');
    const body = sent[0].body;
    assert.ok(body, 'the request carried no body');
    assert.equal(sent[0].url, '/api/watch-time');
    assert.equal(body.media_type, 'movie');
    assert.equal(body.media_id, '550');
    assert.equal(body.title, 'Fight Club');
    // `minutes: 0` is "no time increment", which the route accepts by design
    // (it validates the type and the sign, never the magnitude).
    assert.equal(body.minutes, 0);
    // The §3/§4 line. `null` is allowed here and `0` is not: the route reads a
    // NUMBER as "the caller is telling me where the viewer is".
    assert.equal(body.current_time, null);
    assert.notEqual(body.current_time, 0);
    assert.equal(body.total_duration, null);
    assert.equal(body.season, null);
    assert.equal(body.episode, null);
  });
});

describe('the periodic write stays silent', () => {
  it('does not announce a position the player saved mid-viewing', async () => {
    // The §14 direction. `components/VideoPlayer.tsx` calls the writer with one
    // argument, every WATCH_PROGRESS_THROTTLE_MS, for as long as a video plays.
    saveWatchHistory({
      id: '550',
      type: 'movie',
      title: 'Fight Club',
      poster_path: '/poster.jpg',
      provider: 'VidLink',
      last_watched: AT + 60_000,
      timestamp: 1500,
      duration: 8348,
    });
    await settle();

    assert.equal(
      announcements.length,
      0,
      'the player path announced, so every mounted list re-fetches on its save beat',
    );
    // It still wrote, and it still synced — the silence is about the EVENT only.
    assert.equal(getWatchHistory().length, 1);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].body?.current_time, 1500);
  });

  it('leaves a stored position alone when the deliberate write follows it', () => {
    // The §1 no-rollback guarantee, as the viewer experiences it: pressing
    // Regarder again on a title they are 25 minutes into must not rewind it.
    saveWatchHistory({
      id: '550',
      type: 'movie',
      title: 'Fight Club',
      poster_path: '/poster.jpg',
      provider: 'VidLink',
      last_watched: AT,
      timestamp: 1500,
      duration: 8348,
    });
    const record = film();
    assert.ok(record);
    saveWatchHistory(record, {announce: true});

    const stored = getWatchHistory();
    assert.equal(stored.length, 1, 'the second write created a second row');
    assert.equal(stored[0].timestamp, 1500, 'the stored position was rolled back');
    assert.equal(stored[0].title, 'Fight Club');
  });
});
