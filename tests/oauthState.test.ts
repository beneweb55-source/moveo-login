/**
 * Tests for the Google OAuth `state` helpers.
 *
 * These assert the two properties the callback actually relies on:
 *   - a state we did not sign, or that has expired, is rejected (null);
 *   - `matchesCookie` fails closed — a missing cookie never passes.
 *
 * The property that makes login CSRF impossible is the cookie match, so the
 * negative cases below (absent, empty, different) are the important ones.
 *
 * Run: node --import tsx --test tests/oauthState.test.ts
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {
  OAUTH_STATE_TTL_MS,
  createOAuthState,
  matchesCookie,
  verifyOAuthState,
} from '../lib/oauthState';

const ORIGIN = 'https://www.moveo.blog';

/** Re-encode a payload while keeping the original (now invalid) signature. */
const tamper = (state: string, change: (payload: any) => any): string => {
  const [payload, signature] = state.split('.');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  const forged = Buffer.from(JSON.stringify(change(decoded))).toString('base64url');
  return `${forged}.${signature}`;
};

describe('createOAuthState', () => {
  it('round-trips the origin through verifyOAuthState', () => {
    const state = createOAuthState(ORIGIN);
    const verified = verifyOAuthState(state);

    assert.ok(verified, 'a freshly created state must verify');
    assert.equal(verified.origin, ORIGIN);
  });

  it('sets an expiry one TTL into the future', () => {
    const now = 1_700_000_000_000;
    const verified = verifyOAuthState(createOAuthState(ORIGIN, now), now);

    assert.ok(verified);
    assert.equal(verified.expiresAt, now + OAUTH_STATE_TTL_MS);
  });

  it('is different every time, so it cannot be predicted', () => {
    // The old implementation was `state: origin` — a constant. Two calls in the
    // same millisecond must still differ, which is what the nonce is for.
    assert.notEqual(createOAuthState(ORIGIN), createOAuthState(ORIGIN));
  });
});

describe('verifyOAuthState rejects', () => {
  it('the old `state: origin` value the route used to send', () => {
    // The pre-fix implementation was `state: origin`, so this exact string is
    // what the callback used to receive and trust. If it ever verifies again,
    // the CSRF gate has been undone — hence this being the first case.
    assert.equal(verifyOAuthState(ORIGIN), null);
    // ...and the signature check is load-bearing: on its own, an exact cookie
    // match would accept that same constant, so the callback needs both.
    assert.equal(matchesCookie(ORIGIN, ORIGIN), true);
  });

  it('a forged origin under a real signature', () => {
    // The attack the signature exists to stop: swap the origin for someone
    // else's, then rely on the callback using it as the redirect_uri base.
    const forged = tamper(createOAuthState(ORIGIN), (payload) => ({
      ...payload,
      o: 'https://evil.example',
    }));

    assert.equal(verifyOAuthState(forged), null);
  });

  it('a payload whose signature has been altered', () => {
    const [payload] = createOAuthState(ORIGIN).split('.');

    assert.equal(verifyOAuthState(`${payload}.AAAA`), null);
  });

  it('an unsigned payload', () => {
    const payload = Buffer.from(
      JSON.stringify({o: ORIGIN, n: 'x', e: Date.now() + 60_000}),
    ).toString('base64url');

    assert.equal(verifyOAuthState(payload), null);
  });

  it('an expired state', () => {
    const now = 1_700_000_000_000;
    const state = createOAuthState(ORIGIN, now);

    assert.ok(verifyOAuthState(state, now + OAUTH_STATE_TTL_MS - 1), 'valid until the last ms');
    assert.equal(verifyOAuthState(state, now + OAUTH_STATE_TTL_MS), null);
  });

  it('malformed, empty and absent values', () => {
    for (const value of ['', '   ', 'no-dot', 'a.b.c', '..', null, undefined]) {
      assert.equal(verifyOAuthState(value as any), null, `expected null for ${JSON.stringify(value)}`);
    }
  });

  it('a signed payload that is not an object with the expected fields', () => {
    // Signs a well-formed envelope around junk, so only the field checks can
    // reject it — proving the signature alone is not treated as enough.
    const now = Date.now();
    const signature = createOAuthState(ORIGIN).split('.')[1];
    for (const body of [
      JSON.stringify([1, 2, 3]),
      JSON.stringify({o: 42, n: 'x', e: now + 1000}),
      JSON.stringify({n: 'x', e: now + 1000}),
    ]) {
      const payload = Buffer.from(body).toString('base64url');
      assert.equal(verifyOAuthState(`${payload}.${signature}`), null, `expected null for body ${body}`);
    }
  });
});

describe('matchesCookie', () => {
  it('accepts only the exact value this browser was given', () => {
    const state = createOAuthState(ORIGIN);

    assert.equal(matchesCookie(state, state), true);
    assert.equal(matchesCookie(state, createOAuthState(ORIGIN)), false);
    assert.equal(matchesCookie('tampered', state), false);
  });

  it('fails closed when the cookie is missing or empty', () => {
    const state = createOAuthState(ORIGIN);

    assert.equal(matchesCookie(state, undefined), false);
    assert.equal(matchesCookie(state, null), false);
    assert.equal(matchesCookie(state, ''), false);
    assert.equal(matchesCookie(undefined, state), false);
    assert.equal(matchesCookie(null, null), false);
    assert.equal(matchesCookie('', ''), false);
  });
});
