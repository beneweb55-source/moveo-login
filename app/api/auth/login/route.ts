import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';
import { SignJWT } from 'jose';
import {
  LOGIN_RETRY_AFTER_SECONDS,
  RATE_LIMIT_MESSAGE,
  accountKey,
  authLimiters,
  isLoginThrottled,
} from '@/lib/authRateLimit';

/** The refusal a throttled caller gets, before any credential work. */
const throttled = () =>
  NextResponse.json(
    { error: RATE_LIMIT_MESSAGE },
    { status: 429, headers: { 'Retry-After': String(LOGIN_RETRY_AFTER_SECONDS) } }
  );

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Missing email or password' }, { status: 400 });
    }

    // Checked before the lookup and the bcrypt comparison, so a throttled request
    // never reaches the work this exists to protect.
    if (isLoginThrottled(req, email)) {
      return throttled();
    }

    // Find user
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      // Counted as a failure: an unknown address is still a guess, and leaving it
      // free would make the account limiter blind to enumeration.
      authLimiters.loginAccount.recordFailure(accountKey(email));
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
      authLimiters.loginAccount.recordFailure(accountKey(email));
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // The credentials were right, so whatever this account had accumulated is no
    // longer evidence of a guessing run.
    authLimiters.loginAccount.reset(accountKey(email));

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
