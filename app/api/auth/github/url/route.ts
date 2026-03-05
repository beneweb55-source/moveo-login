import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.GITHUB_CLIENT_ID || 'Iv23linYWgjf3Gy6FgOR';
  const redirectUri = `${process.env.APP_URL}/api/auth/github/callback`;
  
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'user:email',
  });

  const url = `https://github.com/login/oauth/authorize?${params.toString()}`;

  return NextResponse.json({ url });
}
