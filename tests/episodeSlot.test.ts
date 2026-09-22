/**
 * WHERE A SERIES PAGE OPENS — the promise the history link makes.
 *
 * The history card links to `/tv/<id>?s=<season>&e=<episode>`, and §10 asks that
 * reopening a series lands on the episode the viewer stopped at. That promise is
 * made in two steps: reading the slot out of the address bar, and honouring it
 * only if the title really has that season. Both used to live inline inside
 * `app/tv/[id]/page.tsx`, where nothing could drive them, and this is the promise
 * that fails SILENTLY — a wrong answer opens season 1 episode 1, which looks
 * perfectly normal and has quietly thrown away where the viewer was.
 *
 * So they are pinned here, over the whole matrix rather than the happy path: the
 * malformed query that must ask for nothing, the season the title no longer has,
 * the episode past the end of its season, a season whose count TMDB has not
 * published, and season 0 — the SPECIALS season, which a truthiness test would
 * drop on the floor.
 */

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {chooseSlot, parseSlotQuery, type SeasonInfo} from '../lib/episodeSlot';

/** A season as the details endpoint describes it. */
const season = (season_number: number, episode_count?: number): SeasonInfo => ({
  season_number,
  ...(episode_count === undefined ? {} : {episode_count}),
});

describe('what the address bar asks for', () => {
  it('reads a slot out of the query, with or without the leading "?"', () => {
    // `window.location.search` includes the "?", and a hand-built string may not.
    assert.deepEqual(parseSlotQuery('?s=2&e=7'), {season: 2, episode: 7});
    assert.deepEqual(parseSlotQuery('s=2&e=7'), {season: 2, episode: 7});
  });

  it('reads SEASON 0 — the specials — as a real slot', () => {
    // `if (season)` would have rejected this, and every special with it.
    assert.deepEqual(parseSlotQuery('?s=0&e=1'), {season: 0, episode: 1});
  });

  it('accepts leading zeros rather than refusing a well-formed number', () => {
    assert.deepEqual(parseSlotQuery('?s=02&e=07'), {season: 2, episode: 7});
  });

  it('ignores parameters it does not need', () => {
    assert.deepEqual(parseSlotQuery('?s=12&e=3&utm_source=x&t=40'), {season: 12, episode: 3});
  });

  it('asks for nothing when either half is missing', () => {
    // The caller falls back to where this device stopped, which is a real
    // answer. Half a slot is not.
    for (const search of ['', '?', '?s=2', '?e=7', '?s=&e=7', '?s=2&e=']) {
      assert.equal(parseSlotQuery(search), null, JSON.stringify(search));
    }
  });

  it('asks for nothing when a value is not a plain integer', () => {
    // `Number.parseInt` would have read "2abc" as season 2 — a number nobody
    // wrote — and then overridden this device's true stored slot with it.
    for (const search of [
      '?s=2abc&e=7',
      '?s=abc&e=7',
      '?s=2&e=7abc',
      '?s=-1&e=7',
      '?s=2.5&e=7',
      '?s= 2&e=7',
      '?s=2&e=7.0',
      '?s=NaN&e=7',
      '?s=Infinity&e=7',
    ]) {
      assert.equal(parseSlotQuery(search), null, JSON.stringify(search));
    }
  });
});

describe('what the title can actually give', () => {
  const seasons = [season(1, 10), season(2, 8), season(3, 6)];

  it('honours the requested slot when the season exists', () => {
    const chosen = chooseSlot({season: 2, episode: 7}, seasons);

    assert.equal(chosen?.season, 2);
    assert.equal(chosen?.episode, 7, 'the episode the viewer stopped on');
    assert.equal(chosen?.episodeCount, 8);
    assert.equal(chosen?.fromRequest, true);
  });

  it('keeps an episode on the last boundary of its season', () => {
    assert.equal(chooseSlot({season: 2, episode: 8}, seasons)?.episode, 8);
  });

  it('falls back to episode 1 for an episode past the end of the season', () => {
    // A stored episode can outlive the season it belonged to. Pointing the
    // player at an episode the season does not contain is the failure.
    assert.equal(chooseSlot({season: 2, episode: 99}, seasons)?.episode, 1);
  });

  it('falls back to episode 1 for an episode below 1', () => {
    assert.equal(chooseSlot({season: 2, episode: 0}, seasons)?.episode, 1);
  });

  it('KEEPS the requested episode when the season count is unknown', () => {
    // Not the same as "the season has 0 episodes". The real episode list is
    // fetched afterwards and is authoritative; dropping the episode here would
    // turn "we do not know yet" into "start at 1".
    const chosen = chooseSlot({season: 2, episode: 99}, [season(1, 10), season(2)]);

    assert.equal(chosen?.episode, 99);
    assert.equal(chosen?.episodeCount, undefined, 'unknown stays unknown, not 0');
  });

  it('treats a count of 0 the same way, since 0 is not a season length', () => {
    const chosen = chooseSlot({season: 1, episode: 5}, [season(1, 0)]);

    assert.equal(chosen?.episode, 5);
    assert.equal(chosen?.episodeCount, 0);
  });

  it('honours a slot in the SPECIALS season', () => {
    const chosen = chooseSlot({season: 0, episode: 3}, [season(0, 5), season(1, 10)]);

    assert.equal(chosen?.season, 0);
    assert.equal(chosen?.episode, 3);
  });

  it('ignores a requested season the title no longer has', () => {
    // A stale link must not select a season that was removed. It falls through
    // to the normal default rather than leaving the page with no season at all.
    const chosen = chooseSlot({season: 9, episode: 4}, seasons);

    assert.equal(chosen?.season, 1);
    assert.equal(chosen?.episode, 1);
    assert.equal(chosen?.fromRequest, false, 'a refused request is not a request');
  });

  it('reports a request as a request even when the episode was clamped', () => {
    // The season WAS honoured, and the old code wrote the clamped episode in
    // that branch. Reporting this as a fallback would change what the caller
    // does, so the flag follows the season and not the episode.
    const chosen = chooseSlot({season: 2, episode: 99}, seasons);

    assert.equal(chosen?.fromRequest, true);
    assert.equal(chosen?.episode, 1);
  });

  it('opens season 1 episode 1 when nothing was requested', () => {
    const chosen = chooseSlot(null, seasons);

    assert.equal(chosen?.season, 1);
    assert.equal(chosen?.episode, 1);
    assert.equal(chosen?.episodeCount, 10);
    assert.equal(chosen?.fromRequest, false);
  });

  it('opens SEASON 1 and not the specials, when the specials are listed first', () => {
    // The default is season 1, not `seasons[0]`, and the difference only shows
    // when a title has specials — which TMDB lists as season 0, ahead of season
    // 1. A viewer arriving without a slot would otherwise be dropped into the
    // specials of every show that has them.
    const chosen = chooseSlot(null, [season(0, 4), season(1, 10), season(2, 8)]);

    assert.equal(chosen?.season, 1);
    assert.equal(chosen?.episode, 1);
  });

  it('still honours an explicit request for the specials, listed first or not', () => {
    // The same list, with the viewer having actually asked for season 0.
    const chosen = chooseSlot({season: 0, episode: 2}, [season(0, 4), season(1, 10)]);

    assert.equal(chosen?.season, 0);
    assert.equal(chosen?.episode, 2);
  });

  it('opens the first season the title has when there is no season 1', () => {
    // Anime and some imports have no season 1; the page must still open on one.
    const chosen = chooseSlot(null, [season(3, 5), season(4, 2)]);

    assert.equal(chosen?.season, 3);
    assert.equal(chosen?.episode, 1);
  });

  it('chooses nothing when the title has no seasons to open on', () => {
    // null and not a fabricated season: the caller must leave the selection as
    // it is rather than point the player at a season that does not exist.
    assert.equal(chooseSlot(null, []), null);
    assert.equal(chooseSlot({season: 2, episode: 7}, []), null);
  });

  it('lets a requested season 0 win over the season 1 default', () => {
    // The regression a truthiness test would cause: `requested.season` is 0, so
    // `if (requested.season)` is false and the specials would never be restored.
    const chosen = chooseSlot({season: 0, episode: 2}, [season(0, 4), season(1, 10)]);

    assert.equal(chosen?.season, 0);
    assert.equal(chosen?.episode, 2);
  });
});

describe('the two together, as the page runs them', () => {
  it('carries the link a history card writes all the way to a slot', () => {
    // The end-to-end shape of the feature: the card writes `?s=2&e=7`, and the
    // page opens on season 2 episode 7 of a title that has 8 episodes in it.
    const requested = parseSlotQuery('?s=2&e=7');
    const chosen = chooseSlot(requested, [season(1, 10), season(2, 8)]);

    assert.deepEqual(chosen, {season: 2, episode: 7, episodeCount: 8, fromRequest: true});
  });

  it("falls back to the caller's stored slot when the link names none", () => {
    // `parseSlotQuery` answering null is what lets the caller use the device's
    // stored position instead — so null must not be turned into a slot here.
    const requested = parseSlotQuery('?utm_source=share');
    const fromStorage = {season: 2, episode: 7};
    const chosen = chooseSlot(requested ?? fromStorage, [season(1, 10), season(2, 8)]);

    assert.deepEqual(chosen, {season: 2, episode: 7, episodeCount: 8, fromRequest: true});
  });
});
