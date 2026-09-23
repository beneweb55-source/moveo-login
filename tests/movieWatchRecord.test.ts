/**
 * WHAT THE MOVIE PAGE RECORDS, AND WHAT IT REFUSES TO CLAIM.
 *
 * WHY THIS EXISTS AS A TEST AND NOT ONLY AS A CLICK HANDLER. The reported defect
 * was that the watch history did not work, and it was true for films in the
 * strongest possible sense: a film written by the provider path alone left
 * nothing at all, because the source a first-time visitor is handed has an empty
 * message allowlist and `parsePlaybackProgress` rejects every message from such a
 * provider. The remedy is a writer that does not depend on a provider — which
 * makes this the one path that records a film, and therefore the path where a
 * wrong claim would be the only thing in the history.
 *
 * The rule lives in lib/movieWatchRecord.ts as a pure function, so it can be
 * driven here without a browser, a session or a network.
 *
 * WHAT IT PINS, AND THE DEFECT EACH ONE CARRIES
 *
 *   - the entry names the film: id, title, poster. A history row that cannot be
 *     named is what "the history doesn't work" looks like from the outside.
 *   - IT CARRIES NO POSITION. `0` is a real position — the start of the film —
 *     and writing it as a stand-in for "unknown" is what makes a Reprendre
 *     button offer a resume it cannot honour (§3/§4).
 *   - it therefore lands in "Reprendre la lecture" with no position to show,
 *     which is the intended reading: the viewer chose it, and nothing has been
 *     measured. The card offers Regarder, not Reprendre.
 *   - NO TITLE, NO ENTRY. A record the page could not name is not written.
 *   - it cannot damage what is already stored: merged over a row that HAS a
 *     position, the position survives and only the name is gained. This is the
 *     §1 no-rollback guarantee, asserted HERE as the consequence for this writer
 *     rather than re-derived — the merge rule's own cases belong to
 *     tests/historyList.test.ts and are not restated.
 *
 * Deliberately NOT asserted: that this is called on mount. It must not be, and
 * a test cannot prove a negative about a click handler it does not run. What
 * pins that is the handler's own form — a plain `onClick`, with no effect.
 */

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';

import {movieWatchRecord} from '../lib/movieWatchRecord';
import {
  belongsInContinueWatching,
  displayTitleFor,
  historyForDisplay,
} from '../lib/historyList';
import {isCompleted, mergeWatchEntries, type WatchHistoryItem} from '../utils/historyManager';

const AT = 1_700_000_000_000;

const recordFor = (overrides: Record<string, unknown> = {}) =>
  movieWatchRecord({
    id: '550',
    title: 'Fight Club',
    posterPath: '/poster.jpg',
    provider: 'VidLink',
    now: AT,
    ...overrides,
  });

describe('movieWatchRecord', () => {
  it('names the film the viewer chose to watch', () => {
    const record = recordFor();
    assert.ok(record, 'a titled film must produce an entry');
    assert.equal(record.id, '550');
    assert.equal(record.type, 'movie');
    assert.equal(record.title, 'Fight Club');
    assert.equal(record.poster_path, '/poster.jpg');
    assert.equal(record.provider, 'VidLink');
    assert.equal(record.last_watched, AT);
  });

  it('claims NO position, because none has been measured', () => {
    // The whole point. An entry written by choosing a film is a statement about
    // intent, not about playback, and the two must not be spelled with the same
    // field values.
    const record = recordFor();
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
    // And the read side reads the absence as "not started", not as "finished".
    assert.equal(isCompleted(record.timestamp, record.duration), false);
  });

  it('carries no season or episode, so a film cannot read as a slot', () => {
    const record = recordFor();
    assert.ok(record);
    assert.equal(record.season, undefined);
    assert.equal(record.episode, undefined);
  });

  it('belongs in "Reprendre la lecture", unnamed position and all', () => {
    const record = recordFor();
    assert.ok(record);
    assert.equal(belongsInContinueWatching(record), true);
    assert.equal(displayTitleFor(record), 'Fight Club');
  });

  it('is visible to the viewer whose history it is, and shows up in the list', () => {
    // The end-to-end read of one write: a guest with no account, this browser's
    // copy being the whole history. The entry must reach the painted list.
    const record = recordFor();
    assert.ok(record);
    const shown = historyForDisplay({
      server: [],
      local: [record],
      viewer: {status: 'ready', owner: null},
    });
    assert.equal(shown.length, 1, 'the recorded film did not reach the list');
    assert.equal(shown[0].id, '550');
    assert.equal(shown[0].title, 'Fight Club');
  });

  it('refuses to write an entry it cannot name', () => {
    assert.equal(recordFor({title: undefined}), null);
    assert.equal(recordFor({title: null}), null);
    assert.equal(recordFor({title: ''}), null);
    assert.equal(recordFor({title: '   '}), null);
    assert.equal(recordFor({title: 42}), null);
  });

  it('refuses to write an entry with no id', () => {
    assert.equal(recordFor({id: ''}), null);
    assert.equal(recordFor({id: '   '}), null);
    assert.equal(recordFor({id: undefined}), null);
    assert.equal(recordFor({id: null}), null);
  });

  it('normalises what it is given rather than trusting the caller', () => {
    const record = recordFor({title: '  Fight Club  ', id: ' 550 ', posterPath: null, provider: null});
    assert.ok(record);
    assert.equal(record.title, 'Fight Club');
    assert.equal(record.id, '550');
    // `""` and not `null`: the store's "unknown" spelling for a string field.
    assert.equal(record.poster_path, '');
    assert.equal(record.provider, '');
  });

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
    const record = recordFor();
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
    const record = recordFor();
    assert.ok(record);

    const merged = mergeWatchEntries(stored, record);
    assert.equal(merged.timestamp, 2520);
    assert.equal(merged.title, 'Fight Club');
  });
});

/**
 * THE WIRING, which the pure tests above cannot reach.
 *
 * A source-level assertion, the same technique tests/playerNotice.test.ts uses
 * for the section heading, and it is not redundant with the suite above: the
 * module could be perfect and never called, or called from somewhere that should
 * not call it. What it pins is the property that makes this writer safe —
 * EXACTLY ONE trigger, and it is a deliberate one.
 *
 * A second caller is not a style problem. Every additional call site is another
 * moment that records a viewing, and the only moment this page is entitled to
 * record is the viewer choosing the film: a call from an effect would fill
 * Continue Watching with films that were merely opened, which is the defect the
 * series page's own comment records for the default slot.
 */
describe('the movie page wires the writer to one deliberate action', () => {
  const PAGE = readFileSync(
    path.join(process.cwd(), 'app/movie/[id]/page.tsx'),
    'utf8',
  );

  it('calls the decision and the persistence exactly once each', () => {
    const decisions = PAGE.match(/movieWatchRecord\(/g) ?? [];
    const writes = PAGE.match(/saveWatchHistory\(/g) ?? [];
    assert.equal(decisions.length, 1, 'the movie page has more than one place building the entry');
    assert.equal(writes.length, 1, 'the movie page has more than one place storing an entry');
  });

  it('triggers it from the button, not from an effect', () => {
    assert.match(
      PAGE,
      /onClick=\{handleWatch\}/,
      'the Regarder button no longer records the film it starts',
    );
    // And the handler it calls is not an effect body. `useEffect` is where a
    // page-open write would hide, and a page-open write is the one thing this
    // must never become.
    const handler = PAGE.slice(PAGE.indexOf('const handleWatch'));
    const body = handler.slice(0, handler.indexOf('\n  };'));
    assert.ok(body.length > 0, 'handleWatch has no body');
    assert.equal(
      /useEffect|useLayoutEffect/.test(body),
      false,
      'the write has been moved into an effect, so opening the page records it',
    );
  });
});
