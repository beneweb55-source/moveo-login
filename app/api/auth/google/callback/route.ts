import { NextResponse, NextRequest } from 'next/server';
import { SignJWT } from 'jose';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code) {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || '630042598048-to0breshebpts9pmbke6kqnt8pth3n0l.apps.googleusercontent.com';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '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';
  
  // Use the origin passed in the state parameter, or fallback to request headers
  let origin = state;
  if (!origin || origin === 'undefined') {
    const protocol = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    origin = host ? `${protocol}://${host}` : 'http://localhost:3000';
  }
  
  const redirectUri = `${origin}/api/auth/google/callback`;

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      throw new Error(tokenData.error_description || 'Failed to get access token');
    }

    const accessToken = tokenData.access_token;

    // Fetch user info
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const userData = await userResponse.json();

    if (!userData.email) {
      throw new Error('No email found in Google profile');
    }

    // Find or create user
    let user;
    const existingUser = await pool.query('SELECT * FROM users WHERE google_id = $1 OR email = $2', [userData.id, userData.email]);

    if (existingUser.rows.length > 0) {
      user = existingUser.rows[0];
      // Update google_id if missing and set email_verified to true since Google verified it
      await pool.query('UPDATE users SET google_id = $1, avatar_url = COALESCE(avatar_url, $2), email_verified = TRUE WHERE id = $3', [userData.id, userData.picture, user.id]);
    } else {
      // Create new user
      const result = await pool.query(
        'INSERT INTO users (name, email, google_id, avatar_url, email_verified) VALUES ($1, $2, $3, $4, TRUE) RETURNING *',
        [userData.name, userData.email, userData.id, userData.picture]
      );
      user = result.rows[0];
    }

    // Create JWT
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback_secret');
    const token = await new SignJWT({ userId: user.id, email: user.email, name: user.name })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret);

    // Return HTML to close popup and notify opener
    const html = `
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. This window should close automatically.</p>
        </body>
      </html>
    `;

    const response = new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' },
    });

    // Set cookie as well for server-side auth
    // MUST use SameSite=None and Secure=True for cross-origin iframe support
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: true, // Required for SameSite=None
      sameSite: 'none', // Required for cross-origin iframe
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;

  } catch (error: any) {
    console.error('Google auth error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
