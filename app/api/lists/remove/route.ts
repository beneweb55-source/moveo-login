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

    const { id, type, list_type } = await req.json();

    if (!id || !type || !list_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    await pool.query(
      'DELETE FROM user_list WHERE user_id = $1 AND media_type = $2 AND media_id = $3 AND list_type = $4',
      [user.userId, type, id, list_type]
    );

    return NextResponse.json({ message: 'Removed from list' }, { status: 200 });
  } catch (error: any) {
    console.error('Error removing from list:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
