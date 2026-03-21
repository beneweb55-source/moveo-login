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

    if (!tmdb_id) {
      return NextResponse.json({ found: false });
    }

    const res = await scraperPool.query(
      `SELECT vidoza_url, voe_url, lang 
       FROM catalogue 
       WHERE tmdb_id = $1 
       ORDER BY 
         CASE 
           WHEN lang = 'VF' THEN 1 
           WHEN lang = 'VOSTFR' THEN 2 
           WHEN lang = 'VO' THEN 3 
           ELSE 4 
         END ASC 
       LIMIT 1`,
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
