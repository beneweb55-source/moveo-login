/**
 * WHAT A DETAIL PAGE RECORDS WHEN THE VIEWER CHOOSES TO WATCH, AND WHAT IT
 * REFUSES TO CLAIM.
 *
 * WHY THIS EXISTS AS A TEST AND NOT ONLY AS A CLICK HANDLER. The reported defect
 * was that the watch history did not work, and it was true in the strongest
 * possible sense: for a FILM nothing was written at all, and for a SERIES only a
 * slot the viewer changed was written, so opening a show and watching the
 * episode in front of you left no trace either. The viewer's own report,
 * 2026-09-23, was one row in the whole history with a film and a series both
 * watched immediately afterwards and both absent.
 *
 * The remedy is a writer that does not depend on a provider — which makes this
 * the ONLY path that records those titles, and therefore the path where a wrong
 * claim would be the only thing in the history. That is why it is tested here,
 * against a pure function, rather than left to the click handler.
 *
 * WHAT IT PINS, AND THE DEFECT EACH ONE CARRIES
 *
 *   - the entry names the title: id, title, poster. A history row that cannot be
 *     named is what "the history doesn't work" looks like from the outside.
 *   - IT CARRIES NO POSITION. `0` is a real position — the start of the film —
 *     and writing it as a stand-in for "unknown" is what makes a Reprendre
 *     button offer a resume it cannot honour (§3/§4).
 *   - a FILM claims no slot, so it can never read as an episode of something.
 *   - a SERIES claims one, and a series call whose slot is unusable is refused
 *     rather than written slotless — a slotless series row cannot be keyed or
 *     resumed.
 *   - NO TITLE, NO ENTRY. A record the page could not name is not written.
 *   - it cannot damage what is already stored: merged over a row that HAS a
 *     position, the position survives and only the name is gained. This is the
 *     §1 no-rollback guarantee, asserted HERE as the consequence for this writer
 *     rather than re-derived — the merge rule's own cases belong to
 *     tests/historyList.test.ts and are not restated.
 *
 * Deliberately NOT asserted: that this is called on mount. It must not be, and a
 * test cannot prove a negative about a click handler it does not run. What pins
 * that is the handler's own form — a plain `onClick`, with no effect — and the
 * source-level suite at the bottom.
 */

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';

import {watchRecord} from '../lib/watchRecord';
import {
  belongsInContinueWatching,
  displayTitleFor,
  historyForDisplay,
} from '../lib/historyList';
import {isCompleted, mergeWatchEntries, type WatchHistoryItem} from '../utils/historyManager';

const AT = 1_700_000_000_000;

const filmFor = (overrides: Record<string, unknown> = {}) =>
  watchRecord({
    type: 'movie',
    id: '550',
    title: 'Fight Club',
    posterPath: '/poster.jpg',
    provider: 'VidLink',
    now: AT,
    ...overrides,
  });

const episodeFor = (overrides: Record<string, unknown> = {}) =>
  watchRecord({
    type: 'tv',
    id: '1399',
    title: 'Game of Thrones',
    posterPath: '/got.jpg',
    provider: 'VidLink',
    season: 7,
    episode: 1,
    now: AT,
    ...overrides,
  });

describe('watchRecord — a film the viewer chose', () => {
  it('names the film the viewer chose to watch', () => {
    const record = filmFor();
    assert.ok(record, 'a titled film must produce an entry');
    assert.equal(record.id, '550');
    assert.equal(record.type, 'movie');
    assert.equal(record.title, 'Fight Club');
    assert.equal(record.poster_path, '/poster.jpg');
    assert.equal(record.provider, 'VidLink');
    assert.equal(record.last_watched, AT);
  });

  it('claims NO position, because none has been measured', () => {
    const record = filmFor();
    assert.ok(record);
    assert.equal(
      Object.prototype.hasOwnProperty.call(record, 'timestamp'),
      false,
      'the entry carries a position nothing measured',
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(record, 'duration'),
      false,
      'the entry carries a duration nothing measured',
    );
    assert.equal(isCompleted(record.timestamp, record.duration), false);
  });

  it('claims no slot, so a film cannot read as an episode of something', () => {
    const record = filmFor();
    assert.ok(record);
    assert.equal(record.season, undefined);
    assert.equal(record.episode, undefined);
  });

  it('ignores a slot that was passed to it anyway', () => {
    // The movie page has no season or episode to pass, but a caller that passed
    // one must not be able to make a film claim a slot by accident.
    const record = filmFor({season: 7, episode: 1});
    assert.ok(record);
    assert.equal(record.season, undefined);
    assert.equal(record.episode, undefined);
  });
});

describe('watchRecord — an episode the viewer chose', () => {
  it('names the series and the episode being started', () => {
    const record = episodeFor();
    assert.ok(record);
    assert.equal(record.id, '1399');
    assert.equal(record.type, 'tv');
    assert.equal(record.title, 'Game of Thrones');
    assert.equal(record.season, 7);
    assert.equal(record.episode, 1);
    assert.equal(record.last_watched, AT);
  });

  it('claims NO position either — choosing an episode is not watching it', () => {
    // §13. This is the rule the slot-only write already followed; it is asserted
    // here because this writer is now the one that fires on the ordinary path.
    const record = episodeFor();
    assert.ok(record);
    assert.equal(Object.prototype.hasOwnProperty.call(record, 'timestamp'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(record, 'duration'), false);
  });

  it('keeps SEASON 0 as a real slot', () => {
    // TMDB's SPECIALS. `??` and never `||` at every step, or a special becomes
    // indistinguishable from "no season" and its position lands on episode 1.
    const record = episodeFor({season: 0, episode: 3});
    assert.ok(record);
    assert.equal(record.season, 0);
    assert.equal(record.episode, 3);
  });

  it('refuses a series call whose slot is unusable', () => {
    // A slotless series row cannot be keyed by `episodeSlotOf` or offered as a
    // resume target, so writing one would be writing a row nothing can use.
    assert.equal(episodeFor({season: undefined}), null);
    assert.equal(episodeFor({episode: undefined}), null);
    assert.equal(episodeFor({season: null, episode: null}), null);
    // The database columns are INTEGER: a fractional or negative value would be
    // a `22P02` at the server. `slotOf` is the shared rule that refuses both.
    assert.equal(episodeFor({season: 1.5, episode: 1}), null);
    assert.equal(episodeFor({season: 1, episode: -1}), null);
    assert.equal(episodeFor({season: '7', episode: '1'}), null);
  });
});

describe('what the entry is allowed to say about itself', () => {
  it('refuses to write an entry it cannot name', () => {
    for (const missing of [undefined, null, '', '   ', 42]) {
      assert.equal(filmFor({title: missing}), null);
      assert.equal(episodeFor({title: missing}), null);
    }
  });

  it('refuses to write an entry with no id', () => {
    for (const missing of ['', '   ', undefined, null]) {
      assert.equal(filmFor({id: missing}), null);
      assert.equal(episodeFor({id: missing}), null);
    }
  });

  it('normalises what it is given rather than trusting the caller', () => {
    const record = filmFor({
      title: '  Fight Club  ',
      id: ' 550 ',
      posterPath: null,
      provider: null,
    });
    assert.ok(record);
    assert.equal(record.title, 'Fight Club');
    assert.equal(record.id, '550');
    // `""` and not `null`: the store's "unknown" spelling for a string field.
    assert.equal(record.poster_path, '');
    assert.equal(record.provider, '');
  });

  it('belongs in "Reprendre la lecture" for both shapes', () => {
    const film = filmFor();
    const episode = episodeFor();
    assert.ok(film && episode);
    assert.equal(belongsInContinueWatching(film), true);
    assert.equal(displayTitleFor(film), 'Fight Club');
    assert.equal(belongsInContinueWatching(episode), true);
    assert.equal(displayTitleFor(episode), 'Game of Thrones');
  });

  it('is visible to the viewer whose history it is, and shows up in the list', () => {
    const film = filmFor();
    const episode = episodeFor();
    assert.ok(film && episode);
    const shown = historyForDisplay({
      server: [],
      local: [film, episode],
      viewer: {status: 'ready', owner: null},
    });
    assert.deepEqual(shown.map((item) => item.id).sort(), ['1399', '550']);
  });
});

describe('a chosen title cannot damage what is already stored', () => {
  it('cannot roll a stored position back, and supplies the name it lacked', () => {
    // MEASURED SHAPE. 107 of the 108 rows in the live table had a NULL title,
    // because the mount site that wrote them passed none — so the row this merge
    // sees is exactly this one: a real position and no name. The choice of film
    // must add the name without touching the position.
    const stored: WatchHistoryItem = {
      id: '550',
      type: 'movie',
      title: '',
      poster_path: '',
      provider: 'VidLink',
      last_watched: AT - 3_600_000,
      timestamp: 2520,
      duration: 8348,
    };
    const record = filmFor();
    assert.ok(record);

    const merged = mergeWatchEntries(stored, record);
    assert.equal(merged.timestamp, 2520, 'the stored position was rolled back');
    assert.equal(merged.duration, 8348);
    assert.equal(merged.title, 'Fight Club', 'the name the row never had was not gained');
    assert.equal(merged.poster_path, '/poster.jpg');
  });

  it('leaves an already-named stored entry with its position intact', () => {
    const stored: WatchHistoryItem = {
      id: '550',
      type: 'movie',
      title: 'Fight Club',
      poster_path: '/poster.jpg',
      provider: 'VidLink',
      last_watched: AT - 60_000,
      timestamp: 2520,
      duration: 8348,
    };
    const record = filmFor();
    assert.ok(record);

    const merged = mergeWatchEntries(stored, record);
    assert.equal(merged.timestamp, 2520);
    assert.equal(merged.title, 'Fight Club');
  });

  it('survives being stored twice, which is what the series page can do', () => {
    // The series page's slot effect and its Regarder button can both fire for the
    // same slot. The second write must be a no-op, not a second row.
    const first = episodeFor();
    assert.ok(first);
    const merged = mergeWatchEntries(first, episodeFor({now: AT + 5_000}) as WatchHistoryItem);
    assert.equal(merged.id, '1399');
    assert.equal(merged.season, 7);
    assert.equal(merged.episode, 1);
    assert.equal(
      Object.prototype.hasOwnProperty.call(merged, 'timestamp'),
      false,
      'a repeat of the same claim invented a position',
    );
  });
});

/**
 * THE WIRING, which the pure tests above cannot reach.
 *
 * A source-level assertion, the same technique tests/playerNotice.test.ts uses
 * for the section heading, and it is not redundant with the suite above: the
 * module could be perfect and never called, or called from somewhere that should
 * not call it. What it pins is the property that makes this writer safe —
 * EXACTLY ONE trigger per page, and it is a deliberate one.
 *
 * A second caller is not a style problem. Every additional call site is another
 * moment that records a viewing, and the only moment these pages are entitled to
 * record is the viewer choosing the title: a call from an effect would fill
 * Continue Watching with titles that were merely opened, which is the defect the
 * series page's own comment records for the default slot.
 */
describe('each detail page wires the writer to one deliberate action', () => {
  const PAGE = (relative: string) =>
    readFileSync(path.join(process.cwd(), relative), 'utf8');

  const MOVIE = PAGE('app/movie/[id]/page.tsx');
  const TV = PAGE('app/tv/[id]/page.tsx');

  /** The text of a `watchRecord({…})` call, so its arguments can be inspected. */
  const callIn = (source: string): string => {
    const start = source.indexOf('watchRecord({');
    assert.notEqual(start, -1, 'the page does not build an entry at all');
    const end = source.indexOf('});', start);
    assert.notEqual(end, -1, 'the watchRecord call is not terminated');
    return source.slice(start, end);
  };

  for (const [name, source] of [['movie', MOVIE], ['tv', TV]] as const) {
    it(`the ${name} page builds exactly one entry`, () => {
      const decisions = source.match(/watchRecord\(/g) ?? [];
      assert.equal(decisions.length, 1, `${name} has more than one place building the entry`);
    });

    it(`the ${name} page triggers it from the button, not from an effect`, () => {
      assert.match(
        source,
        /onClick=\{handleWatch\}/,
        `the Regarder button on ${name} no longer records what it starts`,
      );
      // And the handler it calls is not an effect body. `useEffect` is where a
      // page-open write would hide, and a page-open write is the one thing this
      // must never become.
      const handler = source.slice(source.indexOf('const handleWatch'));
      const body = handler.slice(0, handler.indexOf('\n  };'));
      assert.ok(body.length > 0, 'handleWatch has no body');
      assert.equal(
        /useEffect|useLayoutEffect/.test(body),
        false,
        `the write moved into an effect on ${name}, so opening the page records it`,
      );
    });
  }

  it('the film call claims no slot and the series call claims the current one', () => {
    // Where the two pages MUST differ. A film that carried a season would read as
    // an episode of something; a series that carried none could not be resumed.
    const filmCall = callIn(MOVIE);
    assert.equal(/season|episode/.test(filmCall), false, 'the film call claims a slot');

    const tvCall = callIn(TV);
    assert.match(tvCall, /season:\s*selectedSeason/, 'the series call does not claim its season');
    assert.match(tvCall, /episode:\s*selectedEpisode/, 'the series call does not claim its episode');
  });
});
