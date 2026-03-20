import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const scraperPool = new Pool({
  connectionString: process.env.SCRAPER_DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tmdb_id = searchParams.get('tmdb_id');
    const season = searchParams.get('season') || '0';
    const episode = searchParams.get('episode') || '0';

    if (!tmdb_id) {
      return NextResponse.json({ found: false });
    }

    const res = await scraperPool.query(
      'SELECT vidoza_url, voe_url, lang FROM catalogue WHERE tmdb_id = $1 AND season = $2 AND episode = $3 ORDER BY CASE WHEN lang = \'FR\' THEN 0 ELSE 1 END',
      [tmdb_id, season, episode]
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
