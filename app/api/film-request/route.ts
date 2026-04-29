import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as jose from 'jose';
import { scraperPool } from '@/lib/db';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback_secret_key_for_development_only'
);

async function logAndNotify(
  action: 'reçu' | 'déjà disponible' | 'déjà en file' | 'ajoutée à content_requests' | 'ajoutée à film_requests' | 'queue indisponible' | 'erreur interne',
  data: { tmdb_id?: string; title?: string; year?: string; type?: string; season?: string; episode?: string; userId?: string; errorMsg?: string }
) {
  const isTv = data.type === 'tv';
  const typeTag = isTv ? '[TV]' : '[FILM]';
  const targetLabel = isTv && data.season && data.episode ? `S${String(data.season).padStart(2, '0')}E${String(data.episode).padStart(2, '0')} ` : '';
  const titleStr = data.title ? `«${data.title}»` : '';
  const yearStr = data.year ? `(${data.year})` : '';
  const userStr = data.userId ? ` user=${data.userId}` : '';
  const tmdbStr = data.tmdb_id ? ` tmdb=${data.tmdb_id}` : '';
  
  let logMsg = `[film-request] ${action}`;
  if (action === 'erreur interne') {
    logMsg += `: ${data.errorMsg}`;
  } else {
    logMsg += ` ${typeTag}${tmdbStr} ${targetLabel}${titleStr} ${yearStr}`.trim();
    if (action === 'reçu') {
      logMsg += userStr;
    }
  }
  
  logMsg = logMsg.replace(/\s+/g, ' ').trim();
  console.log(logMsg);

  if (action === 'reçu') return;

  let status: 'requested' | 'already_requested' | 'already_available' | 'queue_unavailable' | 'error' = 'error';
  if (action === 'ajoutée à content_requests' || action === 'ajoutée à film_requests') status = 'requested';
  else if (action === 'déjà en file') status = 'already_requested';
  else if (action === 'déjà disponible') status = 'already_available';
  else if (action === 'queue indisponible') status = 'queue_unavailable';
  else if (action === 'erreur interne') status = 'error';

  const webhookUrl = isTv ? process.env.DISCORD_WEBHOOK_SERIES : process.env.DISCORD_WEBHOOK_FILMS;
  if (!webhookUrl) return;

  let color = 0;
  let statusTitle = '';
  
  switch (status) {
    case 'requested':
      color = 0x2ecc71; // Green
      statusTitle = 'Nouvelle demande ajoutée';
      break;
    case 'already_requested':
      color = 0xf1c40f; // Yellow
      statusTitle = 'Demande déjà en file d\'attente';
      break;
    case 'already_available':
      color = 0x3498db; // Blue
      statusTitle = 'Contenu déjà disponible';
      break;
    case 'queue_unavailable':
      color = 0xe67e22; // Orange
      statusTitle = 'Queue scraper indisponible';
      break;
    case 'error':
      color = 0xe74c3c; // Red
      statusTitle = 'Erreur interne';
      break;
  }

  const embed = {
    title: `${typeTag} ${statusTitle}`,
    description: `**Titre:** ${targetLabel}${titleStr} ${yearStr}\n**TMDB ID:** ${data.tmdb_id || 'N/A'}${data.userId ? `\n**User:** ${data.userId}` : ''}${data.errorMsg ? `\n**Erreur:** ${data.errorMsg}` : ''}`,
    color: color,
    timestamp: new Date().toISOString(),
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (e) {
    console.error('Failed to send Discord webhook', e);
  }
}

export async function POST(request: Request) {
  let reqData: any = {};
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

    const body = await request.json();
    const { tmdb_id, title, year, type, season, episode } = body;
    reqData = { tmdb_id, title, year, type, season, episode, userId };

    if (!tmdb_id) {
      return NextResponse.json({ error: 'Missing tmdb_id' }, { status: 400 });
    }

    await logAndNotify('reçu', reqData);

    // Check if already in catalogue
    if (type === 'tv' && season && episode) {
      try {
        const seriesRes = await scraperPool.query(
          'SELECT voe_url, dood_url FROM series_catalogue WHERE series_tmdb_id = $1 AND season = $2 AND episode = $3 LIMIT 1',
          [tmdb_id, season, episode]
        );
        if (seriesRes.rows.length > 0 && (seriesRes.rows[0].voe_url || seriesRes.rows[0].dood_url)) {
          await logAndNotify('déjà disponible', reqData);
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
          await logAndNotify('déjà disponible', reqData);
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
          await logAndNotify('déjà disponible', reqData);
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
      await logAndNotify('queue indisponible', reqData);
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
        await logAndNotify('déjà en file', reqData);
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

    if (tableName === 'content_requests') {
      await logAndNotify('ajoutée à content_requests', reqData);
    } else {
      await logAndNotify('ajoutée à film_requests', reqData);
    }

    return NextResponse.json({ status: 'requested' });
  } catch (error) {
    console.error('Error in film-request:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    await logAndNotify('erreur interne', { ...reqData, errorMsg });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
