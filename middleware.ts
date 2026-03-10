import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (token) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      if (payload.is_banned) {
        const reason = encodeURIComponent(payload.ban_reason || 'Violation des règles');
        return NextResponse.redirect(new URL(`/banned?reason=${reason}`, request.url));
      }
    } catch (e) {
      console.error('Error decoding token', e);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!login|register|banned|api/auth/|_next/|favicon|logo|.*\\..*).*)',
  ],
};
