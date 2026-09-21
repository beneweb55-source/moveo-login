/**
 * The one place that turns search text into the search route's path.
 *
 * `query` is a PATH SEGMENT, not a query-string value, and the route is
 * `/search/[query]` with no catch-all — so an unencoded `/` splits it into two
 * segments and matches nothing. Measured on production before this module
 * existed:
 *
 *   GET /search/Face/Off   → 404   (query "Face/Off", the film)
 *   GET /search/Face%2FOff → 200   and the page renders 'Face/Off' correctly
 *
 * Next keeps `%2F` inside the single segment, so encoding is the fix and no
 * catch-all is needed.
 *
 * The destination must NOT be changed to match: `useParams()` returns the
 * segment still ENCODED, and `app/search/[query]/page.tsx` calls
 * `decodeURIComponent` exactly once. That single decode is load-bearing, which
 * is why it looks redundant and is not — verified by loading `/search/100%25`,
 * which renders '100%' with no URIError. Removing it would display `a%20b`
 * literally for a query of `a b`, and adding a second decode would throw
 * URIError on a query containing a bare `%`.
 *
 * Whitespace is deliberately NOT trimmed here. The caller guards on
 * `query.trim()` being non-empty but submits the raw value, and narrowing the
 * segment's job to "make it safe as a segment" keeps that behaviour unchanged
 * rather than quietly altering what gets searched for.
 *
 * Kept as a module rather than inlined at its one call site so the invariant is
 * testable — see tests/searchPath.test.ts.
 */
export function buildSearchPath(query: string): string {
  return `/search/${encodeURIComponent(query)}`;
}
