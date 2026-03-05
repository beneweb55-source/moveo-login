import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import pool from '@/lib/db';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 });
  }

  const clientId = process.env.GITHUB_CLIENT_ID || 'Iv23linYWgjf3Gy6FgOR';
  const clientSecret = process.env.GITHUB_CLIENT_SECRET || '768b52f08f2a2946491fe0a30e1f339821cc5d7b';

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      throw new Error(tokenData.error_description || 'Failed to get access token');
    }

    const accessToken = tokenData.access_token;

    // Fetch user info
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const userData = await userResponse.json();

    // Fetch user email (if private)
    const emailResponse = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    
    const emails = await emailResponse.json();
    const primaryEmail = emails.find((e: any) => e.primary && e.verified)?.email || userData.email;

    if (!primaryEmail) {
      throw new Error('No verified email found');
    }

    // Find or create user
    let user;
    const existingUser = await pool.query('SELECT * FROM users WHERE github_id = $1 OR email = $2', [userData.id.toString(), primaryEmail]);

    if (existingUser.rows.length > 0) {
      user = existingUser.rows[0];
      // Update github_id if missing (e.g. user signed up with email first)
      if (!user.github_id) {
        await pool.query('UPDATE users SET github_id = $1, avatar_url = COALESCE(avatar_url, $2) WHERE id = $3', [userData.id.toString(), userData.avatar_url, user.id]);
      }
    } else {
      // Create new user
      const result = await pool.query(
        'INSERT INTO users (name, email, github_id, avatar_url) VALUES ($1, $2, $3, $4) RETURNING *',
        [userData.name || userData.login, primaryEmail, userData.id.toString(), userData.avatar_url]
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
            window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', token: '${token}' }, '*');
            window.close();
          </script>
          <p>Authentication successful. You can close this window.</p>
        </body>
      </html>
    `;

    const response = new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' },
    });

    // Set cookie as well for server-side auth
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;

  } catch (error: any) {
    console.error('GitHub auth error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
