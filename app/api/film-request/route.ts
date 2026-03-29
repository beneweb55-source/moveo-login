import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as jose from 'jose';
import { Pool } from 'pg';

const scraperPool = new Pool({
  connectionString: process.env.SCRAPER_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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

    const { tmdb_id, title, year, type, season, episode } = await request.json();

    if (!tmdb_id) {
      return NextResponse.json({ error: 'Missing tmdb_id' }, { status: 400 });
    }

    // Check if already in catalogue
    if (type === 'tv' && season && episode) {
      try {
        const seriesRes = await scraperPool.query(
          'SELECT voe_url, dood_url FROM series_catalogue WHERE series_tmdb_id = $1 AND season = $2 AND episode = $3 LIMIT 1',
          [tmdb_id, season, episode]
        );
        if (seriesRes.rows.length > 0 && (seriesRes.rows[0].voe_url || seriesRes.rows[0].dood_url)) {
          return NextResponse.json({ status: 'already_available' });
        }
      } catch (e) {
        console.error('Error checking series_catalogue', e);
      }

      try {
        const animeRes = await scraperPool.query(
          'SELECT voe_url, dood_url FROM anime_catalogue WHERE series_tmdb_id = $1 AND season = $2 AND episode = $3 LIMIT 1',
          [tmdb_id, season, episode]
        );
        if (animeRes.rows.length > 0 && (animeRes.rows[0].voe_url || animeRes.rows[0].dood_url)) {
          return NextResponse.json({ status: 'already_available' });
        }
      } catch (e) {
        console.error('Error checking anime_catalogue', e);
      }
    } else {
      try {
        const catalogueRes = await scraperPool.query(
          'SELECT voe_url, dood_url FROM catalogue WHERE tmdb_id = $1 LIMIT 1',
          [tmdb_id]
        );

        if (catalogueRes.rows.length > 0 && (catalogueRes.rows[0].voe_url || catalogueRes.rows[0].dood_url)) {
          return NextResponse.json({ status: 'already_available' });
        }
      } catch (e) {
        console.error('Error checking catalogue', e);
      }
    }

    // Determine the table to use: content_requests or film_requests
    let tableName = 'content_requests';
    let tableExists = false;
    
    try {
      const tableCheck = await scraperPool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'content_requests'
        );
      `);
      tableExists = tableCheck.rows[0].exists;
    } catch (e) {
      console.error('Error checking content_requests table', e);
    }

    if (!tableExists) {
      try {
        const tableCheck2 = await scraperPool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'film_requests'
          );
        `);
        if (tableCheck2.rows[0].exists) {
          tableName = 'film_requests';
          tableExists = true;
        }
      } catch (e) {
        console.error('Error checking film_requests table', e);
      }
    }

    if (!tableExists) {
      // If neither table exists, we can't insert.
      return NextResponse.json({ error: 'No request table found' }, { status: 503 });
    }

    // Get available columns
    const columnsRes = await scraperPool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = $1
    `, [tableName]);
    
    const availableColumns = columnsRes.rows.map(r => r.column_name);

    // Check if already requested
    try {
      let checkQuery = `SELECT status FROM ${tableName} WHERE tmdb_id = $1`;
      let checkParams: any[] = [tmdb_id];
      let paramIndex = 2;

      if (availableColumns.includes('type')) {
        checkQuery += ` AND type = $${paramIndex++}`;
        checkParams.push(type || 'movie');
      }
      if (availableColumns.includes('season')) {
        checkQuery += ` AND (season IS NULL OR season = $${paramIndex++})`;
        checkParams.push(season || null);
      }
      if (availableColumns.includes('episode')) {
        checkQuery += ` AND (episode IS NULL OR episode = $${paramIndex++})`;
        checkParams.push(episode || null);
      }
      
      checkQuery += ` LIMIT 1`;

      const requestRes = await scraperPool.query(checkQuery, checkParams);

      if (requestRes.rows.length > 0) {
        return NextResponse.json({ status: 'already_requested' });
      }
    } catch (e) {
      console.error(`Error checking existing request in ${tableName}`, e);
    }

    // Insert new request
    const insertColumns = ['tmdb_id', 'title', 'year'];
    const insertValues = [tmdb_id, title, year];
    let insertParamIndex = 4;

    if (availableColumns.includes('type')) {
      insertColumns.push('type');
      insertValues.push(type || 'movie');
    }
    if (availableColumns.includes('season')) {
      insertColumns.push('season');
      insertValues.push(season || null);
    }
    if (availableColumns.includes('episode')) {
      insertColumns.push('episode');
      insertValues.push(episode || null);
    }
    if (availableColumns.includes('requested_by')) {
      insertColumns.push('requested_by');
      insertValues.push(userId);
    }

    const placeholders = insertValues.map((_, i) => `$${i + 1}`).join(', ');
    const insertQuery = `INSERT INTO ${tableName} (${insertColumns.join(', ')}) VALUES (${placeholders})`;

    await scraperPool.query(insertQuery, insertValues);

    return NextResponse.json({ status: 'requested' });
  } catch (error) {
    console.error('Error in film-request:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
