import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Missing verification token' }, { status: 400 });
    }

    // Find user with this token
    const result = await pool.query(
      'SELECT id, verification_token_expires FROM users WHERE verification_token = $1',
      [token]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid verification token' }, { status: 400 });
    }

    const user = result.rows[0];

    // Check if token is expired
    if (new Date(user.verification_token_expires) < new Date()) {
      return NextResponse.json({ error: 'Verification token has expired' }, { status: 400 });
    }

    // Update user to verified
    await pool.query(
      'UPDATE users SET email_verified = TRUE, verification_token = NULL, verification_token_expires = NULL WHERE id = $1',
      [user.id]
    );

    return NextResponse.json({ message: 'Email verified successfully' });
  } catch (error: any) {
    console.error('Email verification error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
