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

    const { tmdb_id, title, year } = await req.json();

    if (!tmdb_id) {
      return NextResponse.json({ error: 'Missing tmdb_id' }, { status: 400 });
    }

    // Check if already in catalogue
    const catRes = await pool.query(
      'SELECT voe_url FROM catalogue WHERE tmdb_id = $1 LIMIT 1',
      [tmdb_id]
    );

    if (catRes.rows.length > 0 && catRes.rows[0].voe_url) {
      return NextResponse.json({ status: 'already_available' });
    }

    // Check if already requested
    const reqRes = await pool.query(
      'SELECT status FROM film_requests WHERE tmdb_id = $1 LIMIT 1',
      [tmdb_id]
    );

    if (reqRes.rows.length > 0) {
      return NextResponse.json({ 
        status: 'already_requested', 
        request_status: reqRes.rows[0].status 
      });
    }

    // Insert new request
    await pool.query(
      'INSERT INTO film_requests (tmdb_id, title, year, requested_by) VALUES ($1, $2, $3, $4)',
      [tmdb_id, title || null, year || null, user.userId]
    );

    return NextResponse.json({ status: 'requested' });
  } catch (error) {
    console.error('Error handling film request:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
