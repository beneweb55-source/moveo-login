import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { isCrossSiteRequest } from '@/lib/csrf';

export async function middleware(request: NextRequest) {
  // Cross-site forgery gate, run before anything else: a request made by another
  // site must not even reach the ban-check self-fetch below. The rule, and the
  // production measurement that justified it, live in lib/csrf.ts.
  if (
    isCrossSiteRequest({
      method: request.method,
      origin: request.headers.get('origin'),
      selfOrigin: request.nextUrl.origin,
    })
  ) {
    return NextResponse.json({ error: 'Cross-origin request rejected' }, { status: 403 });
  }

  const token = request.cookies.get('auth_token')?.value;

  if (token) {
    try {
      // Bounded: this self-fetch is a network hop plus a database query, and it
      // runs on every matched request for a signed-in user. Without a timeout, a
      // slow /api/auth/me stalls every page and every API response in the site.
      // On timeout we land in the catch below and continue, exactly as for any
      // other failure here: a ban check that cannot answer must not be able to
      // take the whole site down with it.
      //
      // AbortController rather than AbortSignal.timeout: if a helper were missing
      // in the edge runtime, the throw would land in that same catch and quietly
      // turn the ban check off on every request with no visible symptom.
      const banCheck = new AbortController();
      const banCheckTimer = setTimeout(() => banCheck.abort(), 3000);
      let res;
      try {
        res = await fetch(`${request.nextUrl.origin}/api/auth/me`, {
          headers: {
            Cookie: `auth_token=${token}`
          },
          signal: banCheck.signal,
        });
      } finally {
        clearTimeout(banCheckTimer);
      }

      if (res.status === 403) {
        const data = await res.json();
        if (data.banned) {
          const reason = encodeURIComponent(data.ban_reason || 'Violation des règles');
          const response = NextResponse.redirect(new URL(`/banned?reason=${reason}`, request.url));
          response.cookies.delete('auth_token');
          return response;
        }
      }
    } catch (e) {
      console.error('Error checking ban status', e);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!login|register|banned|api/auth/|_next/|favicon|logo|.*\\..*).*)',
  ],
};
