import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';
import { SignJWT } from 'jose';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Missing email or password' }, { status: 400 });
    }

    // Find user
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const user = result.rows[0];

    // Check if email is verified
    if (!user.email_verified) {
      return NextResponse.json({ error: 'Please verify your email address before logging in' }, { status: 403 });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Create JWT
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback_secret');
    const token = await new SignJWT({ userId: user.id, email: user.email, name: user.name })
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
