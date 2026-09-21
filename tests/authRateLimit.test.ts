/**
 * Login and registration lost their captcha challenge, so what replaces it has
 * to be tested as behaviour, not as the absence of code.
 *
 * The substance here is the throttle: its thresholds, which dimension blocks,
 * and — most importantly — that the refusal happens BEFORE the work it exists to
 * protect. That last one is testable rather than asserted. Both routes check the
 * limiter after the presence check and before the database lookup, so a
 * throttled request answering 429 instead of 500 proves it never reached the
 * query. No database, no mocking, no network.
 *
 * Two properties are worth calling out because they are the difference between
 * a control and a footgun:
 *
 *   1. The account dimension counts FAILURES. Repeated successful sign-ins must
 *      never consume it, or the limiter becomes a way to lock a known email out
 *      of its own account.
 *   2. The tests below drive the route handlers with request bodies that do not
 *      carry a captcha token at all. A handler still requiring one could not
 *      reach the branches observed here.
 *
 * Run: node --import tsx --test tests/authRateLimit.test.ts
 */

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {readFileSync} from 'node:fs';

import {
  accountKey,
  authLimiters,
  createAuthLimiters,
  isLoginThrottled,
  isRegisterThrottled,
  RATE_LIMIT_MESSAGE,
} from '../lib/authRateLimit';

import {POST as loginPOST} from '../app/api/auth/login/route';
import {POST as registerPOST} from '../app/api/auth/register/route';

const loginRequest = (body: unknown, ip = '203.0.113.10') =>
  new Request('https://moveo.test/api/auth/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'x-forwarded-for': ip},
    body: JSON.stringify(body),
  });

const registerRequest = (body: unknown, ip = '203.0.113.20') =>
  new Request('https://moveo.test/api/auth/register', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'x-forwarded-for': ip},
    body: JSON.stringify(body),
  });

describe('accountKey', () => {
  it('folds casing and surrounding whitespace into one bucket', () => {
    // Without this the same address yields several allowances.
    assert.equal(accountKey('  A@B.com '), accountKey('a@b.com'));
  });

  it('never throws on a value that is not a string', () => {
    assert.equal(accountKey(undefined), 'email:');
    assert.equal(accountKey(null), 'email:');
    assert.equal(accountKey({}), 'email:');
  });
});

describe('the login throttle counts failures, not attempts', () => {
  it('leaves an account unblocked however many successful sign-ins occur', () => {
    const limiters = createAuthLimiters();
    const email = 'owner@moveo.test';

    // A different network each time, so the IP dimension never trips and the
    // account dimension is what is actually under test. That distinction is the
    // design, not a convenience: the IP layer counts attempts, the account layer
    // counts failures, and only the second must be immune to successes.
    for (let i = 0; i < 50; i += 1) {
      const request = loginRequest({email, password: 'correct'}, `203.0.113.${i + 1}`);
      assert.equal(
        isLoginThrottled(request, email, limiters),
        false,
        'an account with no failures was blocked',
      );
    }

    // Stated directly as well, so the property survives a refactor of the check.
    assert.equal(limiters.loginAccount.isBlocked(accountKey(email)), false);
  });

  it('blocks only once the failure allowance is spent', () => {
    const limiters = createAuthLimiters();
    const email = 'guessed@moveo.test';
    const request = loginRequest({email, password: 'wrong'});

    for (let i = 0; i < 10; i += 1) {
      assert.equal(isLoginThrottled(request, email, limiters), false, `blocked too early at ${i}`);
      limiters.loginAccount.recordFailure(accountKey(email));
    }

    assert.equal(isLoginThrottled(request, email, limiters), true, 'never blocked');
  });

  it('forgets an account once it succeeds', () => {
    const limiters = createAuthLimiters();
    const email = 'recovering@moveo.test';
    const request = loginRequest({email, password: 'wrong'});

    for (let i = 0; i < 10; i += 1) limiters.loginAccount.recordFailure(accountKey(email));
    assert.equal(isLoginThrottled(request, email, limiters), true);

    limiters.loginAccount.reset(accountKey(email));
    assert.equal(isLoginThrottled(request, email, limiters), false);
  });

  it('blocks a single IP spraying many accounts, on its own dimension', () => {
    const limiters = createAuthLimiters();
    const ip = '203.0.113.99';

    for (let i = 0; i < 30; i += 1) {
      assert.equal(
        isLoginThrottled(loginRequest({}, ip), `spray-${i}@moveo.test`, limiters),
        false,
        `blocked too early at ${i}`,
      );
    }

    assert.equal(isLoginThrottled(loginRequest({}, ip), 'spray-30@moveo.test', limiters), true);
    // A different network is untouched — one IP's run must not close the route.
    assert.equal(
      isLoginThrottled(loginRequest({}, '198.51.100.7'), 'spray-30@moveo.test', limiters),
      false,
    );
  });
});

describe('the registration throttle', () => {
  it('allows three attempts an hour for one address and refuses the fourth', () => {
    const limiters = createAuthLimiters();
    const email = 'signup@moveo.test';

    for (let i = 0; i < 3; i += 1) {
      assert.equal(
        isRegisterThrottled(registerRequest({}), email, limiters),
        false,
        `refused too early at ${i}`,
      );
    }

    assert.equal(isRegisterThrottled(registerRequest({}), email, limiters), true);
  });

  it('caps one IP independently of the address', () => {
    const limiters = createAuthLimiters();
    const ip = '198.51.100.42';

    for (let i = 0; i < 10; i += 1) {
      assert.equal(
        isRegisterThrottled(registerRequest({}, ip), `farm-${i}@moveo.test`, limiters),
        false,
        `refused too early at ${i}`,
      );
    }

    assert.equal(isRegisterThrottled(registerRequest({}, ip), 'farm-10@moveo.test', limiters), true);
  });
});

describe('POST /api/auth/login', () => {
  it('rejects an incomplete body with 400, not with a captcha refusal', async () => {
    const response = await loginPOST(loginRequest({}));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {error: 'Missing email or password'});
  });

  it('throttles a spent account with 429 and Retry-After, before the database', async () => {
    const email = 'spent-login@moveo.test';
    for (let i = 0; i < 10; i += 1) authLimiters.loginAccount.recordFailure(accountKey(email));

    // No captcha token in this body. Getting past validation as far as the
    // throttle is itself the proof that the captcha gate is gone.
    const response = await loginPOST(loginRequest({email, password: 'whatever'}));

    // 429 rather than 500: the handler returned before `pool.query`, so this
    // assertion holds with no database reachable at all.
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '900');
    assert.deepEqual(await response.json(), {error: RATE_LIMIT_MESSAGE});

    authLimiters.loginAccount.reset(accountKey(email));
  });

  it('answers with a message that does not disclose whether the account exists', async () => {
    const known = 'indistinguishable@moveo.test';
    for (let i = 0; i < 10; i += 1) authLimiters.loginAccount.recordFailure(accountKey(known));
    const knownAccount = await loginPOST(loginRequest({email: known, password: 'x'}));

    const unknown = 'never-registered@moveo.test';
    for (let i = 0; i < 10; i += 1) authLimiters.loginAccount.recordFailure(accountKey(unknown));
    const unknownAccount = await loginPOST(loginRequest({email: unknown, password: 'x'}));

    assert.equal(knownAccount.status, unknownAccount.status);
    assert.deepEqual(await knownAccount.json(), await unknownAccount.json());

    authLimiters.loginAccount.reset(accountKey(known));
    authLimiters.loginAccount.reset(accountKey(unknown));
  });
});

describe('POST /api/auth/register', () => {
  it('rejects an incomplete body with 400, not with a captcha refusal', async () => {
    const response = await registerPOST(registerRequest({email: 'a@b.test'}));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {error: 'Missing required fields'});
  });

  it('throttles a spent address with 429 and Retry-After, before the database or any email', async () => {
    const email = 'spent-signup@moveo.test';
    for (let i = 0; i < 3; i += 1) {
      authLimiters.registerEmail.isRateLimited(accountKey(email));
    }

    const response = await registerPOST(
      registerRequest({name: 'Someone', email, password: 'a-password'}),
    );

    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '3600');
    assert.deepEqual(await response.json(), {error: RATE_LIMIT_MESSAGE});
  });
});

describe('the captcha challenge stays gone from the login and registration surfaces', () => {
  // A structural guard, not a proof of behaviour — the tests above are what show
  // the gate is gone. This one exists because "remove the captcha" is a product
  // requirement, and a requirement with no guard is one refactor away from
  // quietly coming back.
  const SURFACES = [
    'app/login/page.tsx',
    'app/register/page.tsx',
    'app/api/auth/login/route.ts',
    'app/api/auth/register/route.ts',
  ];

  for (const path of SURFACES) {
    it(`${path} carries no captcha reference`, () => {
      assert.equal(
        /captcha/i.test(readFileSync(path, 'utf8')),
        false,
        `${path} mentions captcha again`,
      );
    });
  }
});
