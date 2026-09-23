/**
 * WHAT THE HISTORY LIST SHOWS — the read side of the ownership rule.
 *
 * WHY THIS EXISTS AS A TEST AND NOT ONLY AS A COMPONENT. Two surfaces now paint
 * a viewer's history: "Reprendre la lecture" on the home page, and the history
 * tab of the profile. They read the same two copies of the same list, and the
 * decisions between "the browser's rows" and "the account's rows" and the two of
 * them put together are exactly the decisions where a mistake is a privacy
 * defect on one surface and not on the other, or a list that silently disagrees
 * with itself about where a viewer stopped.
 *
 * Those decisions live in lib/historyList.ts as pure functions, which is why
 * they can be driven here directly instead of through a component that would
 * need a browser, a fetch and a session to run.
 *
 * WHAT IT PINS, AND THE DEFECT EACH ONE CARRIES
 *
 *   - a guest sees this browser's history. The whole feature depends on it and
 *     there is no account to fall back on.
 *   - an entry naming ANOTHER account is not shown, even though it is sitting in
 *     the store this browser shares. A's session expires with no logout, so no
 *     code of ours runs and nothing removes A's rows; B signs in and would be
 *     shown A's titles without this rule.
 *   - nothing is shown while the session probe is outstanding. Withholding is
 *     the safe direction: painting first and correcting later shows A's titles
 *     to B for as long as the probe takes.
 *   - the server's copy does not REPLACE this browser's. That was the "history
 *     lost" defect: a signed-in viewer who had just watched something saw a list
 *     that did not contain it, because the server row had not come back yet.
 *   - one title found in both copies is ONE row, not two.
 *   - an unmeasured local observation does not erase a measured one, because a
 *     page opened and closed would otherwise throw away the only fact worth
 *     keeping and leave the entry claiming no position at all.
 *
 * The per-title winner for two MEASURED positions is `resolveProgression`, and
 * that rule is pinned by tests/progressionGuard.test.ts. It is deliberately not
 * re-asserted here: a second copy of it in this file would be a second thing to
 * keep in step, which is the failure mode this whole module exists to avoid.
 */

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  belongsInContinueWatching,
  displayTitleFor,
  historyForDisplay,
  mergeHistories,
  sameTitle,
} from '../lib/historyList';
import {guestOwnerKey, userOwnerKey, type HistoryViewer} from '../lib/historyOwnership';
import type {WatchHistoryItem} from '../utils/historyManager';

const readyGuest: HistoryViewer = {status: 'ready', owner: null};
const readyUser = (userId: string | number): HistoryViewer => ({
  status: 'ready',
  owner: {kind: 'user', userId},
});
const loading: HistoryViewer = {status: 'loading'};

/** A stored entry, with only the fields the list rules read made explicit. */
const entry = (
  over: Partial<WatchHistoryItem> & Pick<WatchHistoryItem, 'id' | 'type'>,
): WatchHistoryItem => ({
  title: `Title ${over.id}`,
  poster_path: '',
  provider: '',
  last_watched: 1_000,
  ...over,
});

const film = (id: string, over: Partial<WatchHistoryItem> = {}): WatchHistoryItem =>
  entry({id, type: 'movie', ...over});

const series = (id: string, over: Partial<WatchHistoryItem> = {}): WatchHistoryItem =>
  entry({id, type: 'tv', ...over});

describe('who may be shown which entry', () => {
  it('shows a guest this browser\'s own history', () => {
    const mine = film('550', {owner: guestOwnerKey('device-1'), timestamp: 300, duration: 8_000});
    const shown = mergeHistories([], [mine], readyGuest);

    assert.deepEqual(shown.map((item) => item.id), ['550']);
  });

  it('shows an unattributed entry: no owner means "before the scheme", not "someone else\'s"', () => {
    const before = film('680');
    const shown = mergeHistories([], [before], readyGuest);

    assert.deepEqual(shown.map((item) => item.id), ['680']);
  });

  it('does NOT show another account\'s entry to this account', () => {
    // The leak this rule closes: A's session expired with no logout, so A's rows
    // are still in this browser's store stamped `user:A`, and B is signing in.
    const theirs = film('550', {owner: userOwnerKey(12)});
    const mine = film('680', {owner: userOwnerKey(7)});
    const thisBrowsers = film('1399', {owner: guestOwnerKey('device-1')});

    const shown = mergeHistories([], [theirs, mine, thisBrowsers], readyUser(7));

    assert.deepEqual(shown.map((item) => item.id).sort(), ['1399', '680']);
  });

  it('does not match an account by a key that is not exactly ours', () => {
    // `user:012` is a well-formed-looking string that is NOT identity 12. The
    // strictness is the point: an entry we cannot attribute with certainty is
    // refused rather than interpreted.
    const padded = film('550', {owner: 'user:012'});
    const shown = mergeHistories([], [padded], readyUser(12));

    assert.deepEqual(shown, []);
  });

  it('shows nothing at all while the session probe is outstanding', () => {
    const mine = film('550', {owner: guestOwnerKey('device-1')});
    const theirs = film('680', {owner: userOwnerKey(12)});

    assert.deepEqual(mergeHistories([], [mine, theirs], loading), []);
  });
});

describe('the two copies, put together', () => {
  it('does not let the account\'s copy hide what this browser has', () => {
    // The "history lost" defect, from the read side: the account's list came
    // back first and was taken as the whole truth, so a title watched in this
    // browser a minute ago was missing from the viewer's own history.
    const fromAccount = film('550', {last_watched: 2_000});
    const fromThisBrowser = film('680', {owner: guestOwnerKey('device-1'), last_watched: 3_000});

    const shown = mergeHistories([fromAccount], [fromThisBrowser], readyGuest);

    assert.deepEqual(shown.map((item) => item.id).sort(), ['550', '680']);
  });

  it('lists one title found in both copies ONCE', () => {
    const fromAccount = film('550', {timestamp: 300, duration: 8_000, last_watched: 1_000});
    const fromThisBrowser = film('550', {owner: guestOwnerKey('d'), timestamp: 1_200, duration: 8_000, last_watched: 2_000});

    const shown = mergeHistories([fromAccount], [fromThisBrowser], readyGuest);

    assert.equal(shown.length, 1, 'the same title must not be listed twice');
    assert.equal(shown[0].timestamp, 1_200, 'the further position is the one to resume from');
  });

  it('does not let an unmeasured observation erase a measured one', () => {
    // Opening a page and closing it records the title with no position. Letting
    // that displace the older, measured row would throw away the only fact worth
    // keeping and leave the entry claiming nothing at all.
    const measured = film('550', {timestamp: 2_400, duration: 8_000, last_watched: 1_000});
    const unmeasured = film('550', {owner: guestOwnerKey('d'), last_watched: 2_000});

    const shown = mergeHistories([measured], [unmeasured], readyGuest);

    assert.equal(shown.length, 1);
    assert.equal(shown[0].timestamp, 2_400);
  });

  it('orders by the most recent observation, newest first', () => {
    const older = film('550', {last_watched: 1_000});
    const newer = series('1399', {last_watched: 9_000});

    assert.deepEqual(
      mergeHistories([older, newer], [], readyGuest).map((item) => item.id),
      ['1399', '550'],
    );
  });

  it('tells a film and a series with the same id apart', () => {
    const asFilm = film('1399', {last_watched: 1_000});
    const asSeries = series('1399', {last_watched: 2_000, season: 2, episode: 7});

    assert.equal(sameTitle(asFilm, asSeries), false);

    const shown = mergeHistories([asFilm], [asSeries], readyGuest);
    assert.equal(shown.length, 2, 'a film and a series share the id space and must not collide');
  });
});

describe('what belongs in which list', () => {
  it('drops a film that is over from "Reprendre la lecture"', () => {
    const finished = film('550', {timestamp: 7_900, duration: 8_000});

    assert.equal(belongsInContinueWatching(finished), false);
  });

  it('keeps a finished EPISODE of a series there', () => {
    // The history does not know how long the season is, so "this episode is
    // over" says nothing about the series. Dropping the row would remove a show
    // the viewer is in the middle of.
    const finishedEpisode = series('1399', {
      season: 2,
      episode: 7,
      timestamp: 2_780,
      duration: 2_800,
    });

    assert.equal(belongsInContinueWatching(finishedEpisode), true);
  });

  it('keeps an unfinished film there', () => {
    assert.equal(belongsInContinueWatching(film('550', {timestamp: 300, duration: 8_000})), true);
  });

  it('keeps an entry with no measured position there', () => {
    // It says only "this is what you were on", which is still something to
    // resume — and the card labels it without borrowing the authority of a
    // measured row.
    assert.equal(belongsInContinueWatching(film('550')), true);
  });

  it('keeps the finished film in the profile, whose subject is the record', () => {
    const finished = film('550', {timestamp: 7_900, duration: 8_000, owner: guestOwnerKey('d')});

    assert.deepEqual(
      historyForDisplay({server: [], local: [finished], viewer: readyGuest}).map((item) => item.id),
      [],
    );
    assert.deepEqual(
      historyForDisplay({
        server: [],
        local: [finished],
        viewer: readyGuest,
        includeCompleted: true,
      }).map((item) => item.id),
      ['550'],
    );
  });
});

/**
 * The position winner is not the identity winner.
 *
 * `mergeWatchEntries` returns ONE of its two arguments by reference, decided by
 * `resolveProgression`. That is right for the position and wrong for the name,
 * and until this was separated the two were the same object.
 *
 * The live shape it comes from, measured 2026-09-23: 107 of the 108 rows in
 * `watch_history` carry a NULL title, because the only writer that always
 * carries a `session_id` — the one the route can attribute for a session it
 * cannot verify — was mounted without a title at both of its call sites. Once
 * the GET stopped hiding those rows they reached this merge. The account's row
 * usually has the BETTER position (it is the side that keeps syncing), so the
 * account's row wins — and it is the one with no name. Taking the winner whole
 * therefore replaced a title this browser had held all along with an empty
 * string, so the history became LESS informative the more it synced.
 *
 * What must not change is the position decision. Every case below asserts both:
 * the name comes from whichever side knows it, and the position still comes from
 * `resolveProgression` alone.
 */
describe('a title one side knows survives a merge with a side that does not', () => {
  it("keeps this browser's title when the account's newer position wins", () => {
    // The measured case. The account's row is the winner: 500 > 100 on the same
    // runtime, so `resolveProgression` returns it.
    const onTheAccount = film('550', {title: '', poster_path: '', timestamp: 500, duration: 8_000});
    const inThisBrowser = film('550', {
      title: 'Fight Club',
      poster_path: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
      timestamp: 100,
      duration: 8_000,
    });

    const [shown] = mergeHistories([onTheAccount], [inThisBrowser], readyGuest);

    assert.equal(shown.title, 'Fight Club', 'the account row blanked a name we hold');
    assert.equal(shown.poster_path, '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg');
    assert.equal(
      shown.timestamp,
      500,
      'filling the name must not have moved the position: the winner is still ' +
        'the one resolveProgression chose',
    );
    assert.equal(shown.duration, 8_000);
  });

  it('does not let a blank local title overwrite the one the account has', () => {
    // The reverse direction, which the same rule must not break. A local entry
    // that never knew the name must not blank the account's.
    const onTheAccount = film('550', {title: 'Fight Club', timestamp: 500, duration: 8_000});
    const inThisBrowser = film('550', {title: '', timestamp: 100, duration: 8_000});

    const [shown] = mergeHistories([onTheAccount], [inThisBrowser], readyGuest);

    assert.equal(shown.title, 'Fight Club');
    assert.equal(shown.timestamp, 500);
  });

  it('fills from the local side when the local side wins', () => {
    // Same slot, the local position is newer, so the local entry is the winner
    // and is returned as it stands. Asserted because the fix must not have made
    // the filling one-directional: whichever side wins, the name comes from
    // whoever knows it.
    const onTheAccount = film('550', {title: '', timestamp: 100, duration: 8_000});
    const inThisBrowser = film('550', {title: 'Fight Club', timestamp: 500, duration: 8_000});

    const [shown] = mergeHistories([onTheAccount], [inThisBrowser], readyGuest);

    assert.equal(shown.title, 'Fight Club');
    assert.equal(shown.timestamp, 500);
  });

  it('invents nothing when neither side has a title', () => {
    // §3. An unnamed entry stays unnamed in the DATA. What the card then paints
    // for it is a separate decision, and the one below.
    const onTheAccount = film('550', {title: '', poster_path: '', timestamp: 500, duration: 8_000});
    const inThisBrowser = film('550', {title: '', poster_path: '', timestamp: 100, duration: 8_000});

    const [shown] = mergeHistories([onTheAccount], [inThisBrowser], readyGuest);

    assert.equal(shown.title, '');
    assert.equal(shown.poster_path, '');
    assert.equal(shown.timestamp, 500);
  });
});

/**
 * An entry with no name still has to be identifiable.
 *
 * Measured in the browser on 2026-09-23, after the GET stopped hiding title-less
 * rows: the card rendered an `<h3>` containing the empty string — a poster, a
 * provider badge, a real timecode, and no way to tell what the entry was. This is
 * the second half of what "the history doesn't work" looks like from outside, and
 * the first half (the rows never arriving) is pinned in tests/watchTime.test.ts.
 *
 * The rule must satisfy both halves of §3 at once: name the entry as precisely as
 * what we hold allows, and invent nothing. An id is a fact we hold; a title we
 * never stored is not, and must not be guessed at.
 */
describe('what an unnamed entry is called', () => {
  it('paints the stored title when there is one', () => {
    assert.equal(
      displayTitleFor(film('550', {title: 'Fight Club'})),
      'Fight Club',
    );
  });

  it('names the entry by its id when no title was ever stored', () => {
    // Not decoration: this is the only true statement available about the entry,
    // and it is what makes it recognisable to the viewer who watched it.
    assert.equal(displayTitleFor(film('550', {title: ''})), 'ID: 550');
    assert.equal(displayTitleFor(series('1399', {title: ''})), 'ID: 1399');
  });

  it('does NOT put the type in the label — a deliberate limit, stated', () => {
    // A film 550 and a series 550 with neither title painted both read
    // "ID: 550". That is a real ambiguity in the LABEL, and it is left in place
    // rather than papered over with "Film 550": the type is carried by the link
    // (`/movie/550` vs `/tv/550`), and inventing a prefix would be this function
    // asserting something the entry's name was never asked to say. Pinned so that
    // a later reader sees a decision and not an oversight.
    assert.equal(displayTitleFor(film('550', {title: ''})), 'ID: 550');
    assert.equal(displayTitleFor(series('550', {title: ''})), 'ID: 550');
  });

  it('never paints "undefined" — the id is always a fact we hold', () => {
    // The storage layer refuses an entry with no usable id, so an absent id
    // cannot reach here from the store. Asserted anyway, because the failure mode
    // is a card that looks like a rendering bug rather than missing data.
    for (const id of ['0', '1', '550', '1399']) {
      const painted = displayTitleFor(film(id, {title: ''}));
      assert.equal(painted, `ID: ${id}`);
      assert.ok(!painted.includes('undefined'), painted);
    }
  });

  it('prefers a real title over the id, whatever the id is', () => {
    assert.equal(displayTitleFor(film('550', {title: 'Fight Club'})), 'Fight Club');
  });
});
