import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';
import { SignJWT } from 'jose';

async function verifyHCaptchaToken(token: string) {
  const secret = process.env.HCAPTCHA_SECRET || 'ES_8ca47c0d4e43453491a3c18d81c5f9af';
  if (!secret) {
    console.warn("HCAPTCHA_SECRET is not set. Skipping hCaptcha verification.");
    return true;
  }

  const res = await fetch('https://hcaptcha.com/siteverify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      secret,
      response: token,
    }).toString(),
  });

  const data = await res.json();
  return data.success;
}

export async function POST(req: Request) {
  try {
    const { email, password, captchaToken } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Missing email or password' }, { status: 400 });
    }

    // Verify hCaptcha token
    const isHuman = await verifyHCaptchaToken(captchaToken || '');
    if (!isHuman) {
      return NextResponse.json({ error: 'Invalid captcha. Please try again.' }, { status: 403 });
    }

    // Find user
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const user = result.rows[0];

    // Check if user is banned
    if (user.is_banned) {
      return NextResponse.json(
        { error: 'ACCOUNT_BANNED', ban_reason: user.ban_reason || '' },
        { status: 403 }
      );
    }

    // Check if email is verified
    if (!user.email_verified) {
      return NextResponse.json(
        { error: 'Please verify your email address before logging in.' },
        { status: 403 }
      );
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Create JWT
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback_secret');
    const token = await new SignJWT({ 
      userId: user.id, 
      email: user.email, 
      name: user.name,
      is_banned: user.is_banned,
      ban_reason: user.ban_reason
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret);

    // Set cookie
    const response = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email }, message: 'Logged in successfully' }, { status: 200 });
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
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
