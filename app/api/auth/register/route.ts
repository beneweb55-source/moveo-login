import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';

async function verifyTurnstileToken(token: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn("TURNSTILE_SECRET_KEY is not set. Skipping Turnstile verification.");
    return true;
  }

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`,
  });

  const data = await res.json();
  return data.success;
}

export async function POST(req: Request) {
  try {
    const { email, password, name, turnstileToken } = await req.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify Turnstile token
    const isHuman = await verifyTurnstileToken(turnstileToken || '');
    if (!isHuman) {
      return NextResponse.json({ error: 'Invalid captcha. Please try again.' }, { status: 403 });
    }

    // Check if user already exists
    const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      const existingUser = userCheck.rows[0];
      if (existingUser.is_banned) {
        return NextResponse.json({ error: 'ACCOUNT_BANNED', ban_reason: existingUser.ban_reason || '' }, { status: 403 });
      }
      return NextResponse.json({ error: 'User already exists' }, { status: 409 });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert user with default role
    const result = await pool.query(`
      INSERT INTO users (name, email, password, email_verified, role_id) 
      VALUES ($1, $2, $3, TRUE, (SELECT id FROM roles WHERE name = 'User' LIMIT 1)) 
      RETURNING id, name, email
    `, [name, email, hashedPassword]);

    const user = result.rows[0];

    return NextResponse.json({ user, message: 'User registered successfully.' }, { status: 201 });
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
