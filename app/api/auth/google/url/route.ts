import { NextResponse } from 'next/server';
import { OAUTH_STATE_COOKIE, OAUTH_STATE_TTL_MS, createOAuthState } from '@/lib/oauthState';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  let origin = searchParams.get('origin');
  
  // Use APP_URL if available, otherwise fallback to request headers
  if (process.env.APP_URL) {
    origin = process.env.APP_URL;
  } else if (!origin || origin === 'undefined') {
    const protocol = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    origin = host ? `${protocol}://${host}` : 'https://moveo.blog';
  }
  
  // Normalise to a bare origin. This value is signed into the state and reused as
  // the redirect_uri base, so a path or query in it would build a callback URL
  // that Google refuses.
  let originBase: string;
  try {
    originBase = new URL(origin as string).origin;
  } catch {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 400 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || '630042598048-to0breshebpts9pmbke6kqnt8pth3n0l.apps.googleusercontent.com';
  const redirectUri = `${originBase}/api/auth/google/callback`;
  const oauthState = createOAuthState(originBase);
  
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
    // Signed, random, and mirrored into a cookie below. It used to be the bare
    // origin — a constant the callback read but never checked, which is what made
    // login CSRF possible.
    state: oauthState,
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  const response = NextResponse.json({ url });

  // Bind the state to THIS browser: the callback refuses to continue unless the
  // value Google hands back matches this cookie, which is what makes a captured
  // authorization code useless to an attacker. httpOnly so no script can read it,
  // and SameSite=None/Secure to match the auth_token cookie this same flow sets
  // for cross-origin iframe support (see callback/route.ts).
  response.cookies.set(OAUTH_STATE_COOKIE, oauthState, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: Math.floor(OAUTH_STATE_TTL_MS / 1000),
    path: '/',
  });

  return response;
}
