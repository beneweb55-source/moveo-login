import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as jose from 'jose';

import { buildProviderUrl, getProvider, type MediaType } from '@/lib/providers';

/**
 * Session check, mirroring the pattern used by the other authenticated routes
 * (cookie `auth_token`, verified with jose). A probe is a diagnostic that should
 * not be reachable anonymously, so an unauthenticated caller gets 401 and
 * nothing is fetched on their behalf.
 *
 * NOTE ON THE SECRET: `fallback_secret` is the repo-wide default used by every
 * other route in this app. It is a known weakness, deliberately NOT fixed here —
 * changing the secret contract is a separate, cross-cutting change. This route
 * introduces nothing new; it matches the others so a token issued by
 * /api/auth/login verifies here too.
 */
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback_secret');

const hasValidSession = async (): Promise<boolean> => {
  try {
    const token = (await cookies()).get('auth_token')?.value;
    if (!token) return false;
    await jose.jwtVerify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
};

/**
 * Bounded provider reachability probe.
 *
 * WHAT CHANGED AND WHY
 *
 * This route used to accept `?url=<any URL>` and fetch it server-side, with one
 * caller (the player) using the result to decide whether a provider was
 * available. That had two problems:
 *
 *   1. It was a request-forgery primitive. Any string could be fetched by our
 *      server with a browser-like User-Agent, so the endpoint could be aimed at
 *      internal addresses or third-party hosts.
 *   2. It was wrong in principle. A datacenter fetch of a provider page does
 *      not tell you whether a user's browser can play video there. Providers
 *      serve anti-bot challenges, geo-vary, and block datacenter IPs — this
 *      probe returned failures for providers that work fine in a browser.
 *
 * So the player no longer consults it at all: it renders the selected provider
 * immediately and lets the browser try. This route is retained only as an
 * explicitly bounded diagnostic, and the URL is now BUILT HERE from the
 * provider allowlist in lib/providers.ts. A caller can choose which configured
 * provider to probe; a caller cannot choose what we fetch.
 *
 * It is deliberately NOT an authority on availability, and nothing in the app
 * acts on its output.
 *
 * The controls a retained probe is expected to have, and where each is enforced:
 *   - verified provider allowlist — the target URL is built below from
 *     lib/providers.ts; a caller can pick a configured provider, never a URL.
 *   - authenticated caller — hasValidSession() below; 401 otherwise.
 *   - rate limited — isRateLimited() per client, before any crypto or fetch.
 *   - never overrides a manual selection — nothing reads the result, and the
 *     player no longer calls this route at all.
 */

/** Beyond this, the body is not read into memory. */
const MAX_RESPONSE_BYTES = 512 * 1024;

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;

/**
 * Process-local rate limit. In a single-instance deployment this is the whole
 * picture; behind multiple instances each instance limits independently, which
 * still bounds abuse per instance. A shared store would be the next step.
 *
 * TRUST ASSUMPTION, stated because it is load-bearing: the key is the first
 * `x-forwarded-for` entry, which is CLIENT-SUPPLIED unless a trusted proxy
 * overwrites that header. Where the edge appends rather than replaces it — and
 * for any request reaching the origin directly — a caller can rotate the header
 * and obtain a fresh bucket per request. This limiter is therefore best-effort
 * abuse friction, NOT an access control, and it must not be the only thing
 * between this route and load. Making it trustworthy is a proxy-configuration
 * change (overwrite the header, then read only the trusted hop).
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

const isRateLimited = (key: string): boolean => {
  const now = Date.now();

  // Keep the map from growing without bound.
  if (buckets.size > 1000) {
    for (const [existingKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(existingKey);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX_REQUESTS;
};

const clientKey = (request: Request): string => {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first && first !== '' ? first : 'unknown';
};

/**
 * Reads at most `maxBytes` of a response body into memory.
 *
 * The previous bound compared only the `content-length` HEADER, which is absent
 * on a chunked response (`Number(null) === 0`) and describes the COMPRESSED
 * length when the body is gzipped — so the cap could be skipped entirely and
 * `text()` would buffer the whole decoded body. This reads through the stream and
 * stops at the limit, so the bound applies to what is actually held.
 *
 * A truncated body is acceptable here: the soft-404 scan below is best-effort,
 * and the alternative is unbounded memory growth driven by a third-party
 * response.
 */
const readBoundedText = async (response: Response, maxBytes: number): Promise<string> => {
  const body = response.body;
  if (!body) return '';

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        break;
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch {
    return text;
  }
};

/** Soft-404 markers observed in provider HTML. A content check, not a status code. */
const SOFT_FAILURE_MARKERS = [
  '404 - not found',
  'file not found',
  'file was deleted',
  'video not found',
  'the server can not find the requested resource',
  'file is being converted',
  'encoding in progress',
  'processing video',
];

export async function GET(request: Request) {
  if (isRateLimited(clientKey(request))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  // Authenticated diagnostics only. Rate limiting runs first so an
  // unauthenticated flood cannot make us perform signature verification.
  if (!(await hasValidSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const server = searchParams.get('server');
  const provider = server ? getProvider(server) : undefined;

  if (!provider) {
    // The name must be one of ours. This is what stops the route being used to
    // fetch an arbitrary target.
    return NextResponse.json({ error: 'Unknown server' }, { status: 400 });
  }

  const typeParam = searchParams.get('type');
  const type: MediaType = typeParam === 'tv' ? 'tv' : 'movie';
  const id = searchParams.get('id');

  const toNumber = (value: string | null): number | undefined => {
    if (value === null || value.trim() === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  let targetUrl: string;
  if (id) {
    const built = buildProviderUrl(provider.name, {
      type,
      id,
      season: toNumber(searchParams.get('season')),
      episode: toNumber(searchParams.get('episode')),
    });
    if (!built) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }
    targetUrl = built;
  } else {
    // No id: probe the provider entry point only, still from our own list.
    // frameOrigins[0] is the origin of the URL buildUrl() generates — the entry
    // point. Later entries are redirect targets and are not where a probe
    // should start.
    targetUrl = provider.frameOrigins[0];
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
      // Do NOT follow redirects. The request target is built from our own
      // allowlist, but the PROVIDER still chooses its own Location header — so
      // following one would let a provider open redirect aim this server at an
      // internal address and turn the JSON status into a reachability oracle for
      // it. A 3xx is reported as a failed probe instead (handled below).
      redirect: 'manual',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (response.status >= 300 && response.status < 400) {
      return NextResponse.json(
        { status: 'error', code: response.status, reason: 'Redirect not followed' },
        { status: 404 },
      );
    }

    const text = await readBoundedText(response, MAX_RESPONSE_BYTES);
    const lowerText = text.toLowerCase();

    if (
      response.status === 404 ||
      SOFT_FAILURE_MARKERS.some((marker) => lowerText.includes(marker))
    ) {
      return NextResponse.json(
        { status: 'error', code: 404, reason: 'Soft 404 or encoding detected in content' },
        { status: 404 },
      );
    }

    // VOE sits behind DDoS-Guard and other hosts behind Cloudflare; both answer
    // a datacenter fetch with 403/503 even when the page is fine in a browser.
    // Reported as "assumed valid" so the reason string does not overstate what
    // was actually established.
    if (
      (response.status === 403 || response.status === 503) &&
      (lowerText.includes('ddos-guard') || lowerText.includes('cloudflare'))
    ) {
      return NextResponse.json({
        status: 'ok',
        code: 200,
        reason: 'Anti-bot challenge (assumed valid)',
      });
    }

    if (response.ok) {
      if (text.length < 500 && !targetUrl.includes('vidsrc')) {
        return NextResponse.json(
          { status: 'error', code: response.status, reason: 'Content too small' },
          { status: 404 },
        );
      }
      return NextResponse.json({ status: 'ok', code: response.status });
    }

    return NextResponse.json({ status: 'error', code: response.status }, { status: 404 });
  } catch (error) {
    // Logged server-side, never returned: an error string can carry internal
    // hostnames and network details.
    console.error('[check-server] probe failed', error);
    return NextResponse.json({ error: 'Probe failed' }, { status: 502 });
  } finally {
    clearTimeout(timeoutId);
  }
}
