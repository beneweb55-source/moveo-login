/**
 * Process-local, per-key request limiter.
 *
 * WHY PROCESS-LOCAL, STATED SO IT IS NOT MISTAKEN FOR MORE: this deployment has
 * no shared store (no Redis, no KV, no database table used for this), so a
 * limiter that holds across instances does not exist here. Each instance counts
 * independently, which bounds abuse per instance rather than globally. A shared
 * store is the next step if this ever needs to be a control rather than
 * friction.
 *
 * TRUST ASSUMPTION, load-bearing and deliberately repeated from the inline copy
 * in app/api/check-server/route.ts: the key is normally the first
 * `x-forwarded-for` entry, which is CLIENT-SUPPLIED unless a trusted proxy
 * overwrites that header. Where the edge appends rather than replaces it — and
 * for any request reaching the origin directly — a caller can rotate the header
 * and obtain a fresh bucket per request. This is therefore best-effort abuse
 * friction, NOT an access control, and it must not be the only thing between a
 * route and load.
 *
 * NOTE ON DUPLICATION: app/api/check-server/route.ts carries its own inline
 * copy of this same algorithm with the same caveat. It is left untouched here
 * on purpose — it is a hardened, documented route and rewriting it for no
 * behavioural gain is churn. Consolidating the two is a candidate, not taken.
 */

export interface RateLimitOptions {
  /** Length of the counting window, in milliseconds. */
  windowMs: number;
  /** Requests allowed per key per window; the next one is refused. */
  maxRequests: number;
  /** Above this many tracked keys, expired buckets are swept. */
  maxKeys?: number;
}

export interface RateLimiter {
  /** True when this key has exceeded its allowance for the current window. */
  isRateLimited(key: string): boolean;
}

export const createRateLimiter = ({
  windowMs,
  maxRequests,
  maxKeys = 1000,
}: RateLimitOptions): RateLimiter => {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return {
    isRateLimited(key: string): boolean {
      const now = Date.now();

      // Keep the map from growing without bound.
      if (buckets.size > maxKeys) {
        for (const [existingKey, bucket] of buckets) {
          if (bucket.resetAt <= now) buckets.delete(existingKey);
        }
      }

      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return false;
      }
      bucket.count += 1;
      return bucket.count > maxRequests;
    },
  };
};

/** Options for {@link createFailureLimiter}. */
export interface FailureLimitOptions {
  /** Length of the counting window, in milliseconds. */
  windowMs: number;
  /** Failures tolerated per key per window; the next one blocks. */
  maxFailures: number;
  /** Above this many tracked keys, expired buckets are swept. */
  maxKeys?: number;
}

/**
 * A limiter that counts FAILURES rather than requests.
 *
 * The difference is load-bearing for authentication. Counting every attempt
 * against an account — successes included — lets anyone who knows a victim's
 * email spend that account's whole allowance with deliberately wrong passwords,
 * which turns the limiter into a denial-of-service tool aimed at the very user
 * it exists to protect. Counting only failures removes that: a legitimate
 * session never records one, so only an actual guessing run can trip it.
 *
 * `isBlocked` is deliberately read-only and `recordFailure` is a separate call,
 * because only the calling route knows whether an attempt failed.
 *
 * Shares the key-trust assumption documented at the top of this file.
 */
export interface FailureLimiter {
  /** True when this key has already met or exceeded its failure allowance. */
  isBlocked(key: string): boolean;
  /** Records one failed attempt against this key. */
  recordFailure(key: string): void;
  /** Forgets a key, for a caller that has since succeeded. */
  reset(key: string): void;
}

export const createFailureLimiter = ({
  windowMs,
  maxFailures,
  maxKeys = 1000,
}: FailureLimitOptions): FailureLimiter => {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return {
    isBlocked(key: string): boolean {
      const now = Date.now();

      if (buckets.size > maxKeys) {
        for (const [existingKey, bucket] of buckets) {
          if (bucket.resetAt <= now) buckets.delete(existingKey);
        }
      }

      const bucket = buckets.get(key);
      return !!bucket && bucket.resetAt > now && bucket.count >= maxFailures;
    },

    recordFailure(key: string): void {
      const now = Date.now();
      const bucket = buckets.get(key);

      if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return;
      }
      bucket.count += 1;
    },

    reset(key: string): void {
      buckets.delete(key);
    },
  };
};

/**
 * The client identity to bucket on — the first `x-forwarded-for` entry, which is
 * the caller as seen by the nearest proxy. Returns a constant for requests with
 * no usable header, so those share one bucket rather than escaping measurement.
 * See the trust assumption above before treating this as an identity.
 */
export const clientKeyFrom = (request: Request): string =>
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
