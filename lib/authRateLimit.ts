/**
 * The server-side anti-abuse controls that stand in for the captcha challenge
 * removed from /login and /register.
 *
 * WHY THIS EXISTS. The hCaptcha widget and its two server-side checks were
 * removed from login and registration, so these two routes are now the only
 * thing between an automated client and password guessing, credential stuffing,
 * and verification-email flooding. This module is that replacement, not
 * decoration added to a flow that did not need it.
 *
 * WHAT IT IS NOT. These limiters are process-local and keyed on a header the
 * caller can influence — see the trust assumption at the top of lib/rateLimit.ts.
 * They are friction, not an access control, and must not be treated as one. Each
 * instance counts independently, so a shared store is what would make this a
 * control rather than a speed bump.
 *
 * THE SHAPE, AND WHY EACH NUMBER IS WHAT IT IS.
 *
 * Every dimension is checked on every request, so tripping one does not require
 * tripping the others. The dimensions are ordered so the key an attacker cannot
 * rotate — the account — carries the tightest limit, and the key a legitimate
 * crowd can share — the IP — carries the loosest.
 *
 *   login, per account, 10 FAILURES per 15 min
 *     Counts failures only. A successful sign-in never records one, so this
 *     cannot be turned into a lockout against a known email: an attacker who
 *     spends the allowance with wrong passwords has only stopped themselves
 *     guessing, and the real owner's correct password is still accepted. Ten
 *     wrong passwords in a quarter hour is not a typo, it is a guessing run.
 *
 *   login, per IP, 30 ATTEMPTS per 15 min
 *     Counts every attempt. Deliberately loose, because a household, an office,
 *     or a mobile carrier's NAT can put many people behind one address and
 *     nothing here should make a shared network look like an attacker.
 *
 *   register, per email, 3 ATTEMPTS per hour
 *     Counts attempts rather than failures, because the resource being protected
 *     is an outbound verification email. The route re-sends that email when the
 *     submitted password matches an unverified account, an intentional recovery
 *     path — so without a cap on attempts, one address could be flooded
 *     indefinitely by repeating the request.
 *
 *   register, per IP, 10 ATTEMPTS per hour
 *     Registration is the expensive, email-sending path, so it is tighter than
 *     login's per-IP allowance. Ten new accounts an hour is more than a person
 *     needs and far less than a signup farm wants.
 *
 * WINDOWS ARE FIXED, NOT SLIDING. The underlying limiter resets a bucket when
 * its window elapses, so a burst can straddle a boundary and briefly exceed the
 * nominal rate. That is a documented property of lib/rateLimit.ts and acceptable
 * for this threat: everything here defends against a sustained run, not against
 * two requests that happen to land either side of a reset.
 */

import { clientKeyFrom, createFailureLimiter, createRateLimiter } from './rateLimit';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;

const LOGIN_FAILURES_PER_ACCOUNT = 10;
const LOGIN_ATTEMPTS_PER_IP = 30;
const REGISTER_ATTEMPTS_PER_EMAIL = 3;
const REGISTER_ATTEMPTS_PER_IP = 10;

/**
 * Normalises an email into a bucket key.
 *
 * Case and surrounding whitespace are folded so that `A@b.com`, `a@b.com` and
 * ` a@b.com ` share one bucket — otherwise the same address could be used to
 * obtain three times the allowance. This is a bucketing decision only; it does
 * not change what is looked up or stored, and the routes still match on the
 * submitted value exactly as before.
 */
export const accountKey = (email: unknown): string =>
  `email:${typeof email === 'string' ? email.trim().toLowerCase() : ''}`;

/**
 * A fresh, isolated set of limiters.
 *
 * Exported as a factory so tests can exercise each threshold without inheriting
 * failures from the previous case — the shared instance below carries real state
 * between requests, which is the point of it in production and a hazard in a
 * test.
 */
export const createAuthLimiters = () => ({
  loginAccount: createFailureLimiter({
    windowMs: LOGIN_WINDOW_MS,
    maxFailures: LOGIN_FAILURES_PER_ACCOUNT,
  }),
  loginIp: createRateLimiter({
    windowMs: LOGIN_WINDOW_MS,
    maxRequests: LOGIN_ATTEMPTS_PER_IP,
  }),
  registerEmail: createRateLimiter({
    windowMs: REGISTER_WINDOW_MS,
    maxRequests: REGISTER_ATTEMPTS_PER_EMAIL,
  }),
  registerIp: createRateLimiter({
    windowMs: REGISTER_WINDOW_MS,
    maxRequests: REGISTER_ATTEMPTS_PER_IP,
  }),
});

export type AuthLimiters = ReturnType<typeof createAuthLimiters>;

/** The instance both auth routes share, so one budget covers both entry points. */
export const authLimiters = createAuthLimiters();

/**
 * The message a throttled caller receives.
 *
 * Deliberately identical across both routes and every dimension. It says how
 * long to wait and nothing else: it does not distinguish "too many failures on
 * this account" from "too many from this network", and it never reveals whether
 * the account exists. A blocked responder learns only that they should stop,
 * which is information they already had.
 */
export const RATE_LIMIT_MESSAGE =
  'Too many attempts. Please wait a few minutes and try again.';

/** Retry-After for a throttled login, matching LOGIN_WINDOW_MS. */
export const LOGIN_RETRY_AFTER_SECONDS = LOGIN_WINDOW_MS / 1000;

/** Retry-After for a throttled registration, matching REGISTER_WINDOW_MS. */
export const REGISTER_RETRY_AFTER_SECONDS = REGISTER_WINDOW_MS / 1000;

/**
 * True when a login should be refused before any credential work happens.
 *
 * Called after the presence check and before the user lookup, so a throttled
 * request costs one Map lookup rather than a database round trip plus a bcrypt
 * comparison — the work is the thing being protected, not just the answer.
 */
export const isLoginThrottled = (
  request: Request,
  email: unknown,
  limiters: AuthLimiters = authLimiters,
): boolean =>
  limiters.loginIp.isRateLimited(clientKeyFrom(request)) ||
  limiters.loginAccount.isBlocked(accountKey(email));

/** True when a registration attempt should be refused. */
export const isRegisterThrottled = (
  request: Request,
  email: unknown,
  limiters: AuthLimiters = authLimiters,
): boolean =>
  limiters.registerIp.isRateLimited(clientKeyFrom(request)) ||
  limiters.registerEmail.isRateLimited(accountKey(email));
