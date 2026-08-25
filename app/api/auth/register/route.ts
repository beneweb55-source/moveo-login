import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';
import { Resend } from 'resend';
import { v4 as uuidv4 } from 'uuid';

const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_key_for_build');

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
    const { email, password, name, captchaToken } = await req.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify hCaptcha token
    const isHuman = await verifyHCaptchaToken(captchaToken || '');
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

    // Generate verification token
    const verificationToken = uuidv4();
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Insert user with default role and email_verified = FALSE
    const result = await pool.query(`
      INSERT INTO users (name, email, password, email_verified, verification_token, verification_token_expires) 
      VALUES ($1, $2, $3, FALSE, $4, $5) 
      RETURNING id, name, email
    `, [name, email, hashedPassword, verificationToken, verificationTokenExpires]);

    const user = result.rows[0];

    // Send verification email
    const appUrl = process.env.APP_URL || 'https://moveo.blog';
    const verifyLink = `${appUrl}/verify-email?token=${verificationToken}`;

    try {
      await resend.emails.send({
        from: 'Moveo <auth@moveo.blog>',
        to: email,
        subject: 'Verify your email address',
        html: `
          <h1>Welcome to Moveo!</h1>
          <p>Hi ${name},</p>
          <p>Please verify your email address by clicking the link below:</p>
          <a href="${verifyLink}">Verify Email</a>
          <p>This link will expire in 24 hours.</p>
        `,
      });
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // We still return success for registration, but maybe log the error
    }

    return NextResponse.json({ user, message: 'User registered successfully. Please check your email to verify your account.' }, { status: 201 });
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
