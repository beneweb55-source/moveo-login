/**
 * Cross-site request-forgery rule for state-changing methods.
 *
 * WHY THIS EXISTS
 *
 * The session cookie is issued with `sameSite: 'none'` (see
 * app/api/auth/login/route.ts), because the comment there says a cross-origin
 * iframe needs it. Whatever the reason, the consequence is that the cookie IS
 * attached to requests initiated by other sites.
 *
 * Nothing downstream compensates. Every authenticated route — the admin ones
 * included — authenticates from that cookie alone: lib/adminAuth.ts reads
 * `auth_token` and never looks at Origin, Referer, or a CSRF token. There is no
 * CSRF token anywhere in the app.
 *
 * Whether an attacker's page can therefore reach a state-changing endpoint was
 * measured, not assumed. For DELETE and PUT it cannot: a cross-origin `fetch`
 * with those methods is not a simple request, so the browser sends a preflight,
 * and these routes return no Access-Control-Allow-Origin — the browser blocks
 * the request before it is sent. That is protection by omission rather than by
 * design, but it holds.
 *
 * POST is the exception. `req.json()` does not check Content-Type, so a body
 * declared `text/plain` — a CORS-safelisted type, i.e. a simple request with no
 * preflight — is decoded exactly like application/json. Measured against
 * production on 2026-09-21: identical credentials sent as text/plain and as
 * application/json both reached the same handler branch, which means the JSON was
 * parsed either way. (At measurement time that shared branch was login's captcha
 * rejection. It has since been removed along with the captcha, and the
 * observation survives it: a body that had failed to parse would have returned
 * 400 "Missing email or password" instead of reaching that branch at all.) A cross-site
 * `fetch(url, {method:'POST', mode:'no-cors', credentials:'include', body:
 * JSON.stringify({...})})` therefore arrives with the cookie and a readable body.
 *
 * The reachable damage is concrete, and the list below is the set of handlers
 * that actually exist — it was corrected when `POST /api/admin/system` was
 * removed along with its unenforced maintenance toggle: POST /api/admin/sections
 * creates a home-page section, POST /api/admin/roles creates a role, and
 * POST /api/admin/watch-time grants watch time to any account. An admin who
 * merely visits a hostile page can have any of those performed for them. A
 * comment that names a deleted endpoint as a live one is worse than no comment:
 * it tells the next reader the surface has been enumerated when it has not.
 *
 * THE RULE, AND WHY IT IS SAFE
 *
 * A browser always sends `Origin` on a non-GET request, same-origin included, so
 * an ABSENT header means a non-browser caller (curl, a server-to-server call)
 * rather than a page that forgot to set one. Only a present-and-mismatched
 * Origin is refused. The comparison is against the request's own origin, so the
 * rule is environment-agnostic: it hardcodes no domain and behaves the same on
 * production, a preview deployment, and localhost.
 *
 * Residual, recorded rather than hidden: middleware.ts excludes `api/auth/` from
 * its matcher, deliberately, so a banned user gets the login route's own JSON
 * 403 rather than a redirect to /banned. The auth routes are therefore not
 * covered by this gate. Their exposure is lower — the OAuth flow already carries
 * its own signed state against login CSRF, and a forged logout is a nuisance
 * rather than a privilege change — but it is not zero, and closing it means
 * changing that matcher, a separate change with its own regression risk.
 */

export const STATE_CHANGING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

const STATE_CHANGING = new Set<string>(STATE_CHANGING_METHODS);

export interface OriginCheck {
  /** The request method, as received. */
  method: string;
  /** The `Origin` request header, or null when the header was absent. */
  origin: string | null;
  /** The origin the request was addressed to (a request's own origin). */
  selfOrigin: string;
}

/** True only when the request would be refused as a cross-site forgery. */
export const isCrossSiteRequest = ({ method, origin, selfOrigin }: OriginCheck): boolean => {
  if (!STATE_CHANGING.has(method.toUpperCase())) return false;
  if (!origin) return false;
  return origin !== selfOrigin;
};
