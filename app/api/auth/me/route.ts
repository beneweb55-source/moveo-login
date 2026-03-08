import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import pool from '@/lib/db';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback_secret');
    const { payload } = await jwtVerify(token, secret);

    // Fetch fresh user data from database with role info
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.bio, u.avatar_url, u.banner_url, 
        u.created_at, u.twitter_url, u.instagram_url, u.website_url,
        u.role_id, r.name as role_name, r.permissions, r.priority
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.id = $1
    `, [payload.userId]);

    if (result.rows.length === 0) {
      return NextResponse.json({ user: null }, { status: 404 });
    }

    return NextResponse.json({ user: result.rows[0] }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
}
