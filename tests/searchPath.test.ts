/**
 * The search route is `/search/[query]` with no catch-all, so the query has to
 * survive as exactly ONE path segment. It did not: a raw `/` in a title split
 * the path in two and the router matched nothing. Measured on production before
 * the fix — `GET /search/Face/Off` → 404, while `/search/Face%2FOff` → 200 and
 * the page rendered 'Face/Off'.
 *
 * So the assertion that matters is not "does it call encodeURIComponent" — that
 * would pass for any encoding and prove nothing. It is the two properties the
 * router and the destination page actually depend on:
 *
 *   1. the result is one segment, never two;
 *   2. decoding that segment once returns the original query.
 *
 * (2) is the contract with `app/search/[query]/page.tsx`, which calls
 * `decodeURIComponent` exactly once on the value `useParams()` returns. It is
 * load-bearing: removing it would display `a%20b` for a query of `a b`, and
 * adding a second decode would throw URIError on a query containing a bare `%`.
 * If either side's encoding ever drifts, these tests fail rather than a user
 * silently landing on a 404.
 *
 * Run: node --import tsx --test tests/searchPath.test.ts
 */

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {buildSearchPath} from '../lib/searchPath';

const PREFIX = '/search/';

/** Real titles, and the characters that broke or could break the segment. */
const QUERIES = [
  'dune',
  'Face/Off',
  'Spider-Man: No Way Home',
  '100% Wolf',
  'M*A*S*H',
  'Kill Bill: Vol. 1',
  'a b',
  '&',
  '?',
  '#',
  'the "office"',
  'Amélie',
  'アキラ100%',
  'Assault on Precinct 13 (2005)',
];

describe('buildSearchPath', () => {
  it('keeps the query inside a single path segment', () => {
    for (const query of QUERIES) {
      const path = buildSearchPath(query);
      // ['', 'search', '<segment>'] — a third real segment means the router
      // sees `/search/[query]/<extra>` and 404s.
      assert.equal(
        path.split('/').length,
        3,
        `${query} produced ${path}, which is not a single segment`,
      );
      assert.ok(path.startsWith(PREFIX), `${query} lost the route prefix`);
    }
  });

  it('never leaves a raw space or a raw slash in the segment', () => {
    for (const query of QUERIES) {
      const segment = buildSearchPath(query).slice(PREFIX.length);
      assert.ok(!segment.includes(' '), `${query} left a raw space`);
      assert.ok(!segment.includes('/'), `${query} left a raw slash`);
    }
  });

  it('round-trips through exactly one decode, as the page performs', () => {
    // One decode is what app/search/[query]/page.tsx does, and it throws on a
    // malformed sequence, so this also pins that the encoder never emits one.
    for (const query of QUERIES) {
      const segment = buildSearchPath(query).slice(PREFIX.length);
      assert.doesNotThrow(() => decodeURIComponent(segment), `${query} is not decodable`);
      assert.equal(decodeURIComponent(segment), query);
    }
  });

  it('encodes the characters that would otherwise change the URL', () => {
    // Not a property of our code, but of the contract with the browser: these
    // must not appear literally, or the browser or router reinterprets them.
    assert.equal(buildSearchPath('Face/Off'), '/search/Face%2FOff');
    assert.equal(buildSearchPath('100% Wolf'), '/search/100%25%20Wolf');
    assert.equal(buildSearchPath('a?b#c'), '/search/a%3Fb%23c');
  });
});
