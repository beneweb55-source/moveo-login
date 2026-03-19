import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tmdb_id = searchParams.get('tmdb_id');

    if (!tmdb_id) {
      return NextResponse.json({ found: false });
    }

    const res = await pool.query(
      'SELECT vidoza_url, voe_url, lang FROM catalogue WHERE tmdb_id = $1',
      [tmdb_id]
    );

    if (res.rows.length > 0) {
      const row = res.rows[0];
      if (row.vidoza_url || row.voe_url) {
        return NextResponse.json({
          found: true,
          vidoza_url: row.vidoza_url,
          voe_url: row.voe_url,
          lang: row.lang
        });
      }
    }

    return NextResponse.json({ found: false });
  } catch (error) {
    console.error('Error fetching catalogue:', error);
    return NextResponse.json({ found: false });
  }
}
