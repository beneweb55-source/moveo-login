import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';
import { Resend } from 'resend';
import { v4 as uuidv4 } from 'uuid';
import {
  RATE_LIMIT_MESSAGE,
  REGISTER_RETRY_AFTER_SECONDS,
  isRegisterThrottled,
} from '@/lib/authRateLimit';

/**
 * The refusal a throttled caller gets.
 *
 * Returned before the duplicate check and before any email is sent, so a
 * throttled request neither reveals whether the address is already registered
 * nor costs an outbound message.
 */
const throttled = () =>
  NextResponse.json(
    { error: RATE_LIMIT_MESSAGE },
    { status: 429, headers: { 'Retry-After': String(REGISTER_RETRY_AFTER_SECONDS) } }
  );

const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_key_for_build');

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Sends a verification link and THROWS if it could not be sent.
 *
 * The caller must surface that failure. Swallowing it is what made the lockout
 * silent: login rejects unverified accounts outright, so an account whose
 * verification email never arrived is unreachable, and the user is told the
 * registration succeeded.
 */
async function sendVerificationEmail(email: string, name: string, token: string) {
  const appUrl = process.env.APP_URL || 'https://moveo.blog';
  const verifyLink = `${appUrl}/verify-email?token=${token}`;

  const { error } = await resend.emails.send({
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

  if (error) {
    throw new Error(error.message || 'Resend rejected the verification email');
  }
}

/** Mints a new token, stores it against the user, and returns it. */
async function issueVerificationToken(userId: string | number) {
  const token = uuidv4();

  await pool.query(
    'UPDATE users SET verification_token = $1, verification_token_expires = $2 WHERE id = $3',
    [token, new Date(Date.now() + VERIFICATION_TTL_MS), userId]
  );

  return token;
}

export async function POST(req: Request) {
  try {
    const { email, password, name } = await req.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (isRegisterThrottled(req, email)) {
      return throttled();
    }

    // Check if user already exists
    const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      const existingUser = userCheck.rows[0];
      if (existingUser.is_banned) {
        return NextResponse.json({ error: 'ACCOUNT_BANNED', ban_reason: existingUser.ban_reason || '' }, { status: 403 });
      }

      // Recovery path for an unverified account.
      //
      // This used to be a flat 409. Combined with the hard block on unverified
      // logins and the absence of any resend endpoint, that left the account
      // permanently unreachable: a link that never arrived, or one the user
      // opened after the 24h expiry, was an unrecoverable dead end.
      //
      // Re-issuing the link here restores that path. It is gated on the password,
      // so it is not an address-enumeration or email-spam oracle: without the
      // right password this behaves exactly as before.
      if (!existingUser.email_verified) {
        const passwordMatches = existingUser.password
          ? await bcrypt.compare(password, existingUser.password)
          : false;

        if (passwordMatches) {
          const token = await issueVerificationToken(existingUser.id);

          try {
            await sendVerificationEmail(existingUser.email, existingUser.name, token);
          } catch (emailError) {
            console.error('Failed to resend verification email:', emailError);
            return NextResponse.json({ error: 'VERIFICATION_EMAIL_FAILED' }, { status: 502 });
          }

          return NextResponse.json(
            { user: { id: existingUser.id, name: existingUser.name, email: existingUser.email }, emailSent: true },
            { status: 200 }
          );
        }
      }

      return NextResponse.json({ error: 'User already exists' }, { status: 409 });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate verification token
    const verificationToken = uuidv4();
    const verificationTokenExpires = new Date(Date.now() + VERIFICATION_TTL_MS);

    // Insert user with default role and email_verified = FALSE
    const result = await pool.query(`
      INSERT INTO users (name, email, password, email_verified, verification_token, verification_token_expires)
      VALUES ($1, $2, $3, FALSE, $4, $5)
      RETURNING id, name, email
    `, [name, email, hashedPassword, verificationToken, verificationTokenExpires]);

    const user = result.rows[0];

    try {
      await sendVerificationEmail(user.email, user.name, verificationToken);
    } catch (emailError) {
      // The row now exists but is unverified, so it cannot be signed into until a
      // link arrives. Reporting 201 here is what hid the problem; failing loudly
      // is safe because the retry lands on the recovery path above, which issues
      // a fresh link — the account is never stranded.
      console.error('Failed to send verification email:', emailError);
      return NextResponse.json({ error: 'VERIFICATION_EMAIL_FAILED' }, { status: 502 });
    }

    return NextResponse.json(
      { user, emailSent: true, message: 'User registered successfully. Please check your email to verify your account.' },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
