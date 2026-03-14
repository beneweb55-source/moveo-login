import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (token) {
    try {
      const res = await fetch(`${request.nextUrl.origin}/api/auth/me`, {
        headers: {
          Cookie: `auth_token=${token}`
        }
      });
      
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
