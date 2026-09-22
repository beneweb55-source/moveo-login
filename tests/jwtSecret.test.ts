/**
 * The JWT secret, and the fallback that must never come back.
 *
 * Twenty-one modules each carried their own
 * `process.env.JWT_SECRET || 'fallback_secret'`, so a deployment without the
 * variable signed and verified tokens with a constant published in this
 * repository. A constant anyone can read is a constant anyone can use:
 * `SignJWT({userId: <an administrator>})` signed with it would have been accepted
 * by every one of those twenty-one verifiers.
 *
 * These are not mock tests. The last three cases sign and verify a REAL token
 * with jose — the same library and the same call the routes use — because the
 * claim being made is not "the function throws" but "a token minted from the
 * published literal no longer opens anything, while a token minted from the
 * configured secret still does". The first two are the vulnerability; the third
 * is the regression that must not be introduced by fixing it.
 *
 * Run: node --import tsx --test tests/jwtSecret.test.ts
 */

import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';
import {SignJWT, jwtVerify} from 'jose';

import {
  MissingJwtSecretError,
  __resetJwtSecretCacheForTests,
  getJwtSecret,
  getJwtSecretString,
} from '../lib/jwtSecret';

/** The literal that used to be every module's default. */
const PUBLISHED_FALLBACK = 'fallback_secret';

/** The divergent literal from app/api/film-request/route.ts, which is why the
 *  two halves of the app did not even accept each other's tokens. */
const DIVERGENT_FALLBACK = 'fallback_secret_key_for_development_only';

const REAL_SECRET = 'a-real-deployment-secret-of-sufficient-length';

const withEnv = (value: string | undefined): void => {
  if (value === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = value;
  }
};

const signWith = (key: string, claims: Record<string, unknown>): Promise<string> =>
  new SignJWT(claims)
    .setProtectedHeader({alg: 'HS256'})
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(new TextEncoder().encode(key));

let originalSecret: string | undefined;

beforeEach(() => {
  originalSecret = process.env.JWT_SECRET;
  __resetJwtSecretCacheForTests();
});

afterEach(() => {
  withEnv(originalSecret);
  __resetJwtSecretCacheForTests();
});

describe('getJwtSecretString', () => {
  it('throws MissingJwtSecretError when JWT_SECRET is not set', () => {
    withEnv(undefined);
    assert.throws(() => getJwtSecretString(), MissingJwtSecretError);
  });

  it('throws when JWT_SECRET is present but empty', () => {
    // An empty variable is the shape a misconfigured deployment actually has:
    // present enough to pass a "is it defined" check, and worth nothing. The
    // guard must treat it the same as absent, not as a one-character key.
    withEnv('');
    assert.throws(() => getJwtSecretString(), MissingJwtSecretError);
  });

  it('names the error so callers can tell it apart from any other failure', () => {
    withEnv(undefined);
    const error = (() => {
      try {
        getJwtSecretString();
        return null;
      } catch (caught) {
        return caught as Error;
      }
    })();

    assert.ok(error instanceof Error);
    assert.equal(error.name, 'MissingJwtSecretError');
    // The message has to be actionable by whoever is reading the logs at 2am:
    // it must name the variable, not describe the symptom.
    assert.match(error.message, /JWT_SECRET/);
  });

  it('returns the configured value unchanged', () => {
    withEnv(REAL_SECRET);
    assert.equal(getJwtSecretString(), REAL_SECRET);
  });

  it('accepts a secret shorter than the recommended length, and warns once', () => {
    // The decision recorded in lib/jwtSecret.ts is to WARN and not to enforce:
    // the deployed secret's length cannot be read from this repository, so a
    // threshold could lock every real user out on the strength of an assumption.
    // The test pins that decision, including the once-per-process part, because a
    // warning that repeats on every authenticated request is a warning that gets
    // filtered out of the logs by the time anyone looks for it.
    withEnv('short');

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    };

    try {
      assert.equal(getJwtSecretString(), 'short');
      assert.equal(getJwtSecretString(), 'short');
      assert.equal(getJwtSecretString(), 'short');
    } finally {
      console.warn = originalWarn;
    }

    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /JWT_SECRET is 5 characters/);
  });

  it('does not warn about a secret at the recommended length', () => {
    withEnv('x'.repeat(32));

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    };

    try {
      getJwtSecretString();
    } finally {
      console.warn = originalWarn;
    }

    assert.deepEqual(warnings, []);
  });
});

describe('getJwtSecret', () => {
  it('throws MissingJwtSecretError when JWT_SECRET is not set', () => {
    withEnv(undefined);
    assert.throws(() => getJwtSecret(), MissingJwtSecretError);
  });

  it('returns the secret as the bytes jose signs with', () => {
    withEnv(REAL_SECRET);
    assert.deepEqual(getJwtSecret(), new TextEncoder().encode(REAL_SECRET));
  });

  it('caches, so the encoder does not run on every request', () => {
    withEnv(REAL_SECRET);
    assert.equal(getJwtSecret(), getJwtSecret());

    // And the cache is really a cache rather than a coincidence: if the env
    // changes under a live instance the cached value must WIN, because that is
    // what "the value cannot change while the process is alive" means. The seam
    // then proves the cache can be cleared for a suite like this one.
    withEnv('a-different-secret-entirely');
    assert.deepEqual(getJwtSecret(), new TextEncoder().encode(REAL_SECRET));

    __resetJwtSecretCacheForTests();
    assert.deepEqual(getJwtSecret(), new TextEncoder().encode('a-different-secret-entirely'));
  });
});

describe('the vulnerability this replaces', () => {
  it('rejects a token signed with the published fallback', async () => {
    // The attack the fix closes, executed: mint a token for an administrator
    // using the constant that was in the repository, then hand it to a verifier
    // reading a configured secret.
    const forged = await signWith(PUBLISHED_FALLBACK, {
      userId: 1,
      email: 'admin@example.com',
    });

    withEnv(REAL_SECRET);

    await assert.rejects(() => jwtVerify(forged, getJwtSecret()));
  });

  it('rejects a token signed with the divergent fallback', async () => {
    // The second literal, from app/api/film-request/route.ts. It mattered that
    // the two were different — but not that either was safe.
    const forged = await signWith(DIVERGENT_FALLBACK, {userId: 1});

    withEnv(REAL_SECRET);

    await assert.rejects(() => jwtVerify(forged, getJwtSecret()));
  });

  it('still accepts a token signed with the configured secret', async () => {
    // The regression guard. Fail-closed must not mean fail-always: a real
    // deployment's own tokens have to keep verifying, or the fix has replaced an
    // authentication bypass with an authentication outage.
    withEnv(REAL_SECRET);

    const genuine = await signWith(REAL_SECRET, {userId: 7, email: 'viewer@example.com'});
    const {payload} = await jwtVerify(genuine, getJwtSecret());

    assert.equal(payload.userId, 7);
    assert.equal(payload.email, 'viewer@example.com');
  });
});
