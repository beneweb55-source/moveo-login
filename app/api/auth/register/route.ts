import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { sendVerificationEmail } from '@/lib/email';

export async function POST(req: Request) {
  try {
    const { email, password, name } = await req.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check if user already exists
    const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      const existingUser = userCheck.rows[0];
      
      // If user exists but is not verified, resend the verification email
      if (!existingUser.email_verified) {
        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Generate new verification token
        const verificationToken = uuidv4();
        const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        
        // Update user with new token and password
        await pool.query(
          'UPDATE users SET password = $1, verification_token = $2, verification_token_expires = $3 WHERE id = $4',
          [hashedPassword, verificationToken, verificationTokenExpires, existingUser.id]
        );
        
        // Send verification email
        await sendVerificationEmail(email, verificationToken);
        
        return NextResponse.json({ 
          message: 'Account already exists but is not verified. A new verification email has been sent.' 
        }, { status: 200 });
      }
      
      return NextResponse.json({ error: 'User already exists' }, { status: 409 });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate verification token
    const verificationToken = uuidv4();
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Insert user
    const result = await pool.query(
      'INSERT INTO users (name, email, password, verification_token, verification_token_expires) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email',
      [name, email, hashedPassword, verificationToken, verificationTokenExpires]
    );

    const user = result.rows[0];

    // Send verification email
    await sendVerificationEmail(email, verificationToken);

    return NextResponse.json({ user, message: 'User registered successfully. Please check your email to verify your account.' }, { status: 201 });
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
