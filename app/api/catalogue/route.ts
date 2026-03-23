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
    const season = searchParams.get('season');
    const episode = searchParams.get('episode');

    if (!tmdb_id) {
      return NextResponse.json({ found: false });
    }

    // Si on a une saison et un épisode, c'est une série ou un anime
    if (season && episode) {
      // 1. Chercher dans series_catalogue
      try {
        const seriesRes = await scraperPool.query(
          `SELECT voe_url, lang 
           FROM series_catalogue 
           WHERE series_tmdb_id = $1 AND season = $2 AND episode = $3
           ORDER BY 
             CASE 
               WHEN lang = 'VF' THEN 1 
               WHEN lang = 'VOSTFR' THEN 2 
               WHEN lang = 'VO' THEN 3 
               ELSE 4 
             END ASC 
           LIMIT 1`,
          [tmdb_id, season, episode]
        );

        if (seriesRes.rows.length > 0) {
          const row = seriesRes.rows[0];
          if (row.voe_url) {
            return NextResponse.json({
              found: true,
              voe_url: row.voe_url,
              lang: row.lang
            });
          }
        }
      } catch (e) {
        // Erreur SQL silencieuse, on passe à la table suivante
        console.error('Error fetching from series_catalogue:', e);
      }

      // 2. Chercher dans anime_catalogue
      try {
        const animeRes = await scraperPool.query(
          `SELECT voe_url, lang 
           FROM anime_catalogue 
           WHERE series_tmdb_id = $1 AND season = $2 AND episode = $3
           ORDER BY 
             CASE 
               WHEN lang = 'VF' THEN 1 
               WHEN lang = 'VOSTFR' THEN 2 
               WHEN lang = 'VO' THEN 3 
               ELSE 4 
             END ASC 
           LIMIT 1`,
          [tmdb_id, season, episode]
        );

        if (animeRes.rows.length > 0) {
          const row = animeRes.rows[0];
          if (row.voe_url) {
            return NextResponse.json({
              found: true,
              voe_url: row.voe_url,
              lang: row.lang
            });
          }
        }
      } catch (e) {
        // Erreur SQL silencieuse
        console.error('Error fetching from anime_catalogue:', e);
      }

      // Si rien trouvé dans les deux tables
      return NextResponse.json({ found: false });
    }

    // Comportement par défaut (Films - table catalogue)
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
