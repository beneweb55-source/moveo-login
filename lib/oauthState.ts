/**
 * Signed, browser-bound `state` for the Google OAuth flow.
 *
 * Two separate defects are fixed here, both read out of the live code:
 *
 *  1. CSRF. `/api/auth/google/url` sent `state: origin` — a CONSTANT, predictable
 *     value, and the callback read it but never compared it to anything stored.
 *     Nothing tied the authorization code coming back to the browser that started
 *     the flow, so an attacker who captured a code (single-use, but capturable by
 *     simply not following the redirect) could send a victim to our callback and
 *     have the victim's browser quietly issued an `auth_token` for the ATTACKER's
 *     account — login CSRF, and the session confusion that follows.
 *  2. Trust. The callback used the client-supplied `state` as the base for
 *     `redirect_uri` whenever APP_URL was unset, so that value was attacker-chosen.
 *
 * Signing alone does NOT fix (1): an attacker's own state is legitimately signed.
 * The binding has to live in the victim's browser, so the route that starts the
 * flow stores the same string in an httpOnly cookie, and the callback requires
 * BOTH a valid signature AND an exact match with that cookie. A cookie is the one
 * thing an attacker cannot write into someone else's browser.
 *
 * Signature verification is what fixes (2): the origin is now part of the signed
 * payload, so the callback can trust it instead of trusting the query string.
 *
 * Run: node --import tsx --test tests/oauthState.test.ts
 */

import {createHmac, randomUUID, timingSafeEqual} from 'node:crypto';

/** Cookie that binds a state value to the browser that asked for it. */
export const OAUTH_STATE_COOKIE = 'oauth_state';

/**
 * Ten minutes outlasts any real consent screen while keeping a captured state
 * useless by the time it could be replayed.
 */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export interface OAuthState {
  /** Origin the flow started from — reused as the `redirect_uri` base. */
  origin: string;
  /** When this state stops being accepted, as epoch milliseconds. */
  expiresAt: number;
}

const signingKey = (): string => process.env.JWT_SECRET || 'fallback_secret';

const sign = (payload: string): string =>
  createHmac('sha256', signingKey()).update(payload).digest('base64url');

/** Constant-time equality that tolerates differing lengths. */
const equals = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * Mint a state carrying a random nonce and the origin, signed so neither can be
 * altered. The caller must also store this exact string in a cookie.
 */
export const createOAuthState = (origin: string, now: number = Date.now()): string => {
  const payload = Buffer.from(
    JSON.stringify({o: origin, n: randomUUID(), e: now + OAUTH_STATE_TTL_MS}),
  ).toString('base64url');

  return `${payload}.${sign(payload)}`;
};

/**
 * Returns the state's origin and expiry, or null when the value is unsigned,
 * tampered with, malformed, or expired.
 */
export const verifyOAuthState = (
  state: string | null | undefined,
  now: number = Date.now(),
): OAuthState | null => {
  if (!state) return null;

  const parts = state.split('.');
  if (parts.length !== 2) return null;

  const [payload, signature] = parts;
  if (!payload || !signature) return null;
  // Checked before parsing: an unsigned payload must never be interpreted.
  if (!equals(signature, sign(payload))) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));

    if (typeof decoded?.o !== 'string' || decoded.o === '') return null;
    if (typeof decoded?.n !== 'string' || decoded.n === '') return null;
    if (typeof decoded?.e !== 'number' || !Number.isFinite(decoded.e)) return null;
    // `<=`, not `<`: expiresAt names the instant the state stops being valid, so
    // a state is usable strictly before it.
    if (decoded.e <= now) return null;

    return {origin: decoded.o, expiresAt: decoded.e};
  } catch {
    return null;
  }
};

/**
 * True only when `state` is exactly the value this browser was handed. This is
 * the check that actually stops login CSRF, so it is deliberately strict: a
 * missing cookie is a failure, never a pass.
 */
export const matchesCookie = (
  state: string | null | undefined,
  cookie: string | null | undefined,
): boolean => Boolean(state) && Boolean(cookie) && equals(state as string, cookie as string);
