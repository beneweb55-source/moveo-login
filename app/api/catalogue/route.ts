import { NextResponse } from 'next/server';
import { scraperPool } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tmdb_id = searchParams.get('tmdb_id');
    const season = searchParams.get('season');
    const episode = searchParams.get('episode');

    if (!tmdb_id) {
      return NextResponse.json({ found: false });
    }

    const reqType = (season && episode) ? 'TV/ANIME' : 'MOVIE';
    console.log(`[API Catalogue] 🔍 Demande reçue: type=${reqType}, tmdb_id=${tmdb_id}, season=${season || 'N/A'}, episode=${episode || 'N/A'}`);

    if (season && episode) {
      // For TV/ANIME, we search both catalogues concurrently just in case of misclassifications,
      // and also because we don't know for sure based on TMDB ID alone which table it might reside in.

      // Search in series_catalogue
      const seriesPromise = scraperPool.query(
        `SELECT voe_url, dood_url, lang 
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

      // Search in anime_catalogue
      const animePromise = scraperPool.query(
        `SELECT voe_url, dood_url, lang 
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

      // Wait for both queries. If the DB fails completely, this will throw and be caught by the outer catch,
      // which properly logs the error and returns a 500 or handles it (Fixing Bug #2).
      const [seriesRes, animeRes] = await Promise.all([seriesPromise, animePromise]);

      if (seriesRes.rows.length > 0) {
        const row = seriesRes.rows[0];
        if (row.voe_url || row.dood_url) {
          console.log(`[API Catalogue] ✅ Trouvé dans series_catalogue: voe=${row.voe_url || 'N/A'}, dood=${row.dood_url || 'N/A'}, lang=${row.lang}`);
          return NextResponse.json({ found: true, voe_url: row.voe_url, dood_url: row.dood_url, lang: row.lang });
        }
      }

      if (animeRes.rows.length > 0) {
        const row = animeRes.rows[0];
        if (row.voe_url || row.dood_url) {
          console.log(`[API Catalogue] ✅ Trouvé dans anime_catalogue: voe=${row.voe_url || 'N/A'}, dood=${row.dood_url || 'N/A'}, lang=${row.lang}`);
          return NextResponse.json({ found: true, voe_url: row.voe_url, dood_url: row.dood_url, lang: row.lang });
        }
      }

      console.log(`[API Catalogue] ❌ Introuvable pour TV/ANIME: tmdb_id=${tmdb_id}, S${season}E${episode}`);
      return NextResponse.json({ found: false });
    }

    // Comportement par défaut (Films)
    const res = await scraperPool.query(
      `SELECT vidoza_url, voe_url, dood_url, lang 
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
      if (res.rows[0].vidoza_url || row.voe_url || row.dood_url) {
        console.log(`[API Catalogue] ✅ Trouvé dans catalogue (FILM): voe=${row.voe_url || 'N/A'}, dood=${row.dood_url || 'N/A'}, lang=${row.lang}`);
        return NextResponse.json({ found: true, vidoza_url: row.vidoza_url, voe_url: row.voe_url, dood_url: row.dood_url, lang: row.lang });
      }
    }

    console.log(`[API Catalogue] ❌ Introuvable pour FILM: tmdb_id=${tmdb_id}`);
    return NextResponse.json({ found: false });
  } catch (error) {
    console.error('Error fetching catalogue:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
