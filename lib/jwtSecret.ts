/**
 * The single place the JWT signing secret is read.
 *
 * WHY THIS EXISTS
 *
 * Twenty-one modules each carried their own copy of
 *
 *   const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback_secret');
 *
 * so any deployment whose environment did not define JWT_SECRET signed and
 * verified tokens with a constant published in this repository. A constant
 * anyone can read is a constant anyone can use: `{userId: <an administrator>}`
 * signed with it would have been accepted by every one of those twenty-one
 * verifiers, because each had independently decided that "no secret has been
 * configured" means "use this known string". A verifier that cannot find its key
 * must not accept anything.
 *
 * `app/api/film-request/route.ts` spelled its fallback
 * `'fallback_secret_key_for_development_only'`, so the two halves of the app did
 * not even agree on the same public default: a token minted against one was
 * rejected by the other, and neither was safe.
 *
 * WHAT IT DOES
 *
 *  - Reads `JWT_SECRET` and caches the encoded result. The value cannot change
 *    while a serverless instance is alive, so re-encoding it on every request —
 *    which every one of those twenty-one call sites did — is pure waste.
 *  - THROWS when it is missing. Every caller already treats a thrown error as
 *    "not authenticated": the verify paths catch and return null, and the sign
 *    path answers 500 and logs. An unconfigured deployment therefore degrades to
 *    "nobody can sign in", which an operator notices immediately, instead of to
 *    "anybody can sign in as anybody", which nobody notices at all. Failing
 *    closed is the whole point.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It does not enforce a minimum length. That was considered and rejected: the
 * length of the deployed secret cannot be read from this repository, so a length
 * threshold could lock every real user out of a working deployment on the
 * strength of an assumption. The guard enforced here is the one that needs no
 * assumption — the variable must be PRESENT. A present-but-short secret is
 * reported once as a warning that an operator can act on, rather than as an
 * outage they cannot.
 */

/**
 * The length at which a secret stops being worth warning about. 32 characters is
 * the output size of a SHA-256 HMAC key, so a secret at least that long cannot be
 * the weak link in an HS256 signature.
 */
const RECOMMENDED_MIN_LENGTH = 32;

export class MissingJwtSecretError extends Error {
  constructor() {
    super(
      'JWT_SECRET is not set. Refusing to sign or verify tokens with a default ' +
        'key: a published default would let anyone mint a token for any account. ' +
        'Set JWT_SECRET in the deployment environment.',
    );
    this.name = 'MissingJwtSecretError';
  }
}

let cachedSecret: Uint8Array | null = null;
let hasWarnedAboutLength = false;

/**
 * The secret as a string, for callers that need a key rather than bytes —
 * `lib/oauthState.ts` feeds it to `createHmac`.
 *
 * @throws MissingJwtSecretError when JWT_SECRET is unset or empty.
 */
export const getJwtSecretString = (): string => {
  const value = process.env.JWT_SECRET ?? '';

  if (value === '') {
    throw new MissingJwtSecretError();
  }

  // Warned once per process, not once per request: a warning that repeats on
  // every authenticated request is a warning that gets filtered out of the logs.
  if (!hasWarnedAboutLength && value.length < RECOMMENDED_MIN_LENGTH) {
    hasWarnedAboutLength = true;
    console.warn(
      `[auth] JWT_SECRET is ${value.length} characters long. HS256 keys shorter ` +
        `than ${RECOMMENDED_MIN_LENGTH} are brute-forceable offline from a single ` +
        'captured token; rotate it to a longer random value.',
    );
  }

  return value;
};

/**
 * The secret as bytes, for jose.
 *
 * @throws MissingJwtSecretError when JWT_SECRET is unset or empty.
 */
export const getJwtSecret = (): Uint8Array => {
  if (cachedSecret === null) {
    cachedSecret = new TextEncoder().encode(getJwtSecretString());
  }
  return cachedSecret;
};

/**
 * Test seam. Lets a suite exercise the missing-secret path in both directions
 * without mutating a module-level cache it cannot reach.
 */
export const __resetJwtSecretCacheForTests = (): void => {
  cachedSecret = null;
  hasWarnedAboutLength = false;
};
