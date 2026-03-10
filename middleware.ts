import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (token) {
    try {
      // Decode the JWT payload without verifying signature (just base64 decode)
      const payloadBase64 = token.split('.')[1];
      if (payloadBase64) {
        const decodedPayload = JSON.parse(atob(payloadBase64));
        
        if (decodedPayload.is_banned) {
          const reason = decodedPayload.ban_reason || '';
          const url = request.nextUrl.clone();
          url.pathname = '/banned';
          url.searchParams.set('reason', reason);
          return NextResponse.redirect(url);
        }
      }
    } catch (error) {
      console.error('Error decoding token in middleware:', error);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (API routes for authentication)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - login (login page)
     * - register (register page)
     * - banned (banned page)
     * - logo (logo images)
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|login|register|banned|logo).*)',
  ],
};
