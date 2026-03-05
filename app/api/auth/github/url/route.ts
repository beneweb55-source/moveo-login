import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const appUrl = process.env.APP_URL;
  
  if (!clientId) {
    return NextResponse.json({ error: 'GitHub Client ID not configured' }, { status: 500 });
  }

  if (!appUrl) {
    return NextResponse.json({ error: 'APP_URL environment variable is not set' }, { status: 500 });
  }
  
  const redirectUri = `${appUrl}/api/auth/github/callback`;
  
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'user:email',
  });

  const url = `https://github.com/login/oauth/authorize?${params.toString()}`;

  return NextResponse.json({ url });
}
