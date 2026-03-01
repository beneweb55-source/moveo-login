import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import pool from '@/lib/db';

async function getUserFromToken() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    if (!token) return null;
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback_secret');
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch (error) {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const user = await getUserFromToken();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tmdbId, type, list_type, title, poster_path } = await req.json();

    if (!tmdbId || !type || !list_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO user_list (user_id, media_type, media_id, list_type, title, poster_path)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, media_type, media_id, list_type) DO NOTHING
       RETURNING *`,
      [user.userId, type, tmdbId, list_type, title || '', poster_path || '']
    );

    return NextResponse.json({ message: 'Added to list', item: result.rows[0] }, { status: 201 });
  } catch (error: any) {
    console.error('Error adding to list:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
