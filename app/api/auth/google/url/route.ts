import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  let origin = searchParams.get('origin');
  
  // Fallback to headers if origin is missing or literally the string "undefined"
  if (!origin || origin === 'undefined') {
    const protocol = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    origin = host ? `${protocol}://${host}` : 'http://localhost:3000';
  }
  
  const clientId = process.env.GOOGLE_CLIENT_ID || '630042598048-to0breshebpts9pmbke6kqnt8pth3n0l.apps.googleusercontent.com';
  const redirectUri = `${origin}/api/auth/google/callback`;
  
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
    state: origin, // Pass origin in state to use it in callback
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  return NextResponse.json({ url });
}
