/**
 * The comparison the catalogue pages use to decide whether to store a newly
 * fetched watched-id list.
 *
 * Regression pinned here, measured against production on 2026-09-21:
 *
 *   GET https://www.moveo.blog/films   (logged out)
 *     -> two identical triples of /api/tmdb-proxy
 *        endpoint=/discover/movie ...&page=1, page=2, page=3
 *
 * getUserWatchedIds() builds a fresh Set on every call, and for a logged-out
 * visitor it returns a fresh EMPTY set — the 401 on /api/user/list fails the
 * `userListRes.ok` check and the function falls through to `return new Set()`.
 * `watchedIds` is a dependency of the pages' initial-fetch effect and a Set is
 * compared by reference, so storing that new empty set re-ran the effect and
 * re-fetched pages 1, 2 and 3. The second batch replaced the first, so the work
 * was not merely duplicated, it was discarded. Every logged-out catalogue page
 * load paid it.
 *
 * The pages avoid it by returning the PREVIOUS set when the ids did not really
 * change — `setWatchedIds(prev => (sameIdSet(prev, ids) ? prev : ids))`. React
 * bails out of a state update whose value is identical by Object.is, so nothing
 * re-renders and the effect does not re-run.
 *
 * That makes `sameIdSet` load-bearing in a silent way: a version that compared
 * only `size` would report "unchanged" for two different lists of equal length
 * and the user's personalisation would quietly stop updating — no error, no
 * request, just a stale list forever. The same-size-different-contents case
 * below is the one that catches it.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sameIdSet } from '../utils/sorting';

const set = (...ids: string[]) => new Set(ids);

describe('sameIdSet — deciding whether a fetched watched list is a real change', () => {
  it('reports no change for two empty sets, which is the logged-out case', () => {
    // This is the pair that used to re-fetch the catalogue. It must compare
    // equal, so the pages keep the old object and React bails out.
    assert.equal(sameIdSet(set(), set()), true);
  });

  it('reports no change for equal contents built as different objects', () => {
    assert.equal(sameIdSet(set('550', '1396'), set('1396', '550')), true);
    assert.equal(sameIdSet(set('550'), set('550')), true);
  });

  it('reports a change when the contents differ but the size matches', () => {
    // The case a size-only comparison would get wrong.
    assert.equal(sameIdSet(set('550'), set('680')), false);
    assert.equal(sameIdSet(set('550', '1396'), set('550', '680')), false);
  });

  it('reports a change when an id is added or removed', () => {
    assert.equal(sameIdSet(set(), set('550')), false);
    assert.equal(sameIdSet(set('550'), set()), false);
    assert.equal(sameIdSet(set('550', '1396'), set('550')), false);
    assert.equal(sameIdSet(set('550'), set('550', '1396')), false);
  });

  it('is symmetric, because both call sites depend on it being a comparison', () => {
    const pairs: [Set<string>, Set<string>][] = [
      [set(), set()],
      [set('1', '2'), set('2', '1')],
      [set('1'), set('2')],
      [set(), set('1')],
      [set('1', '2', '3'), set('1', '2')],
    ];
    for (const [a, b] of pairs) {
      assert.equal(sameIdSet(a, b), sameIdSet(b, a), `asymmetric for ${[...a]} vs ${[...b]}`);
    }
  });
});
