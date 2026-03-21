import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as jose from 'jose';
import pool from '@/lib/db';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback_secret_key_for_development_only'
);

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let userId;
    try {
      const { payload } = await jose.jwtVerify(token, JWT_SECRET);
      userId = payload.userId;
    } catch (err) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tmdb_id, title, year } = await request.json();

    if (!tmdb_id) {
      return NextResponse.json({ error: 'Missing tmdb_id' }, { status: 400 });
    }

    // Check if already in catalogue
    const catalogueRes = await pool.query(
      'SELECT voe_url FROM catalogue WHERE tmdb_id = $1 LIMIT 1',
      [tmdb_id]
    );

    if (catalogueRes.rows.length > 0 && catalogueRes.rows[0].voe_url) {
      return NextResponse.json({ status: 'already_available' });
    }

    // Ensure table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS film_requests (
        id SERIAL PRIMARY KEY,
        tmdb_id VARCHAR(20) UNIQUE NOT NULL,
        title VARCHAR(500),
        year CHAR(4),
        requested_by INTEGER,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP
      )
    `);

    // Check if already requested
    const requestRes = await pool.query(
      'SELECT status FROM film_requests WHERE tmdb_id = $1 LIMIT 1',
      [tmdb_id]
    );

    if (requestRes.rows.length > 0) {
      return NextResponse.json({ status: 'already_requested' });
    }

    // Insert new request
    await pool.query(
      'INSERT INTO film_requests (tmdb_id, title, year, requested_by) VALUES ($1, $2, $3, $4)',
      [tmdb_id, title, year, userId]
    );

    return NextResponse.json({ status: 'requested' });
  } catch (error) {
    console.error('Error in film-request:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
