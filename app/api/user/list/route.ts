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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const list_type = searchParams.get('list_type');

    let query = 'SELECT * FROM user_list WHERE user_id = $1';
    let params: any[] = [user.userId];

    if (list_type) {
      query += ' AND list_type = $2';
      params.push(list_type);
    }

    query += ' ORDER BY added_at DESC';

    const result = await pool.query(query, params);

    return NextResponse.json({ list: result.rows }, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching user list:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getUserFromToken();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { media_type, media_id, list_type, title, poster_path } = await req.json();

    if (!media_type || !media_id || !list_type || !title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO user_list (user_id, media_type, media_id, list_type, title, poster_path)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, media_type, media_id, list_type) DO NOTHING
       RETURNING *`,
      [user.userId, media_type, media_id, list_type, title, poster_path]
    );

    return NextResponse.json({ message: 'Added to list', item: result.rows[0] }, { status: 201 });
  } catch (error: any) {
    console.error('Error adding to list:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getUserFromToken();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const media_type = searchParams.get('media_type');
    const media_id = searchParams.get('media_id');
    const list_type = searchParams.get('list_type');

    if (!media_type || !media_id || !list_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    await pool.query(
      'DELETE FROM user_list WHERE user_id = $1 AND media_type = $2 AND media_id = $3 AND list_type = $4',
      [user.userId, media_type, media_id, list_type]
    );

    return NextResponse.json({ message: 'Removed from list' }, { status: 200 });
  } catch (error: any) {
    console.error('Error removing from list:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
