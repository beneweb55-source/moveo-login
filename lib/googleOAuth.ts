/**
 * Makes a compromised Google OAuth client visible in the logs.
 *
 * THE FINDING
 *
 * `app/api/auth/google/url/route.ts` and `app/api/auth/google/callback/route.ts`
 * each read their credentials as
 *
 *   process.env.GOOGLE_CLIENT_ID || '<a client id committed to this repository>'
 *   process.env.GOOGLE_CLIENT_SECRET || '<a client secret committed to this repository>'
 *
 * A client secret is worth exactly as much as its confidentiality, and this one
 * has been in version control since the commit that introduced it. Deleting the
 * literals now would be a gesture, not a fix: the value is already in every clone
 * and every backup. The remedy is for an operator to ROTATE the client at Google,
 * delete the old one, set both variables, and only then remove the fallbacks —
 * and that is their action, not something this repository can perform or pretend
 * to have performed.
 *
 * WHY THIS FUNCTION DOES NOT TOUCH THE VALUES
 *
 * It deliberately contains no credential of any kind, so it cannot leak one, and
 * centralising the literals into a new module was rejected for the opposite
 * reason — it would have copied a live secret into a third file and produced a
 * third place to clean up after rotation, for no gain in safety.
 *
 * WHY THE FALLBACKS ARE NOT REMOVED EITHER
 *
 * Whether the two variables are defined in the production environment cannot be
 * read from this repository: there is no `.env.local` here and a deployment's
 * variables are invisible from a local checkout. Removing the fallbacks would be
 * a change whose effect on real sign-ins is unknown — if the variables are not
 * set in production, every Google login would break the moment it deploys, which
 * trades a latent exposure for an outage. The brief's own rule applies: do not
 * destroy a working user-facing function for a security gesture of illusory
 * benefit.
 *
 * So the values stay reachable and the situation becomes LOUD instead of silent.
 * A deployment relying on the committed client now says so in its logs, once,
 * naming both variables and the rotation that is owed. That was the part missing.
 */

let hasWarnedAboutFallback = false;

/**
 * Called once per request on the two Google routes. Warns once per process: a
 * warning that repeats on every sign-in attempt is a warning that gets filtered
 * out of the logs before anyone looks for it — the same reasoning as the length
 * warning in lib/jwtSecret.ts.
 *
 * Presence only. Neither value is read, compared or logged.
 */
export const warnIfGoogleClientIsUnconfigured = (): void => {
  if (hasWarnedAboutFallback) return;
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) return;

  hasWarnedAboutFallback = true;
  console.warn(
    '[auth] GOOGLE_CLIENT_ID and/or GOOGLE_CLIENT_SECRET are not set in this ' +
      'environment, so Google sign-in is running on the client committed to the ' +
      'repository. That client is public and must be treated as compromised: ' +
      'rotate it at Google, set both variables, and delete the fallback literals ' +
      'from app/api/auth/google/url/route.ts and ' +
      'app/api/auth/google/callback/route.ts.',
  );
};

/** Test seam: lets a suite observe the once-per-process behaviour. */
export const __resetGoogleOAuthWarningForTests = (): void => {
  hasWarnedAboutFallback = false;
};
