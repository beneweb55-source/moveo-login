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

export async function GET(req: Request) {
  try {
    const user = await getUserFromToken();
    if (!user) {
      return NextResponse.json({ lists: [] }, { status: 200 });
    }

    const { searchParams } = new URL(req.url);
    const media_type = searchParams.get('media_type');
    const media_id = searchParams.get('media_id');

    if (!media_type || !media_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const result = await pool.query(
      'SELECT list_type FROM user_list WHERE user_id = $1 AND media_type = $2 AND media_id = $3',
      [user.userId, media_type, media_id]
    );

    const lists = result.rows.map(row => row.list_type);

    return NextResponse.json({ lists }, { status: 200 });
  } catch (error: any) {
    console.error('Error checking list status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
