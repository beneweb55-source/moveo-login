import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { checkAdminAccess } from '@/lib/adminAuth';
import axios from 'axios';
import { getRankFromWatchTime, RANKS } from '@/utils/ranks';

export async function GET() {
  const adminUser = await checkAdminAccess('view_stats');
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS watch_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        media_type VARCHAR(50) NOT NULL,
        media_id INTEGER NOT NULL,
        minutes_watched INTEGER DEFAULT 0,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, media_type, media_id)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS anonymous_watch_history (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(64) NOT NULL,
        media_type VARCHAR(50) NOT NULL,
        media_id INTEGER NOT NULL,
        minutes_watched INTEGER DEFAULT 0,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, media_type, media_id)
      );
    `);

    const totalUsersRes = await pool.query('SELECT COUNT(*) FROM users');
    const totalUsers = parseInt(totalUsersRes.rows[0].count);

    const totalWatchTimeRes = await pool.query(`
      SELECT 
        (SELECT COALESCE(SUM(minutes_watched), 0) FROM watch_history) + 
        (SELECT COALESCE(SUM(minutes_watched), 0) FROM anonymous_watch_history) as total_sum
    `);
    const totalWatchTime = parseInt(totalWatchTimeRes.rows[0].total_sum || '0');

    const topMoviesRes = await pool.query(`
      SELECT media_id, media_type, SUM(minutes_watched) as total_minutes, COUNT(DISTINCT viewer_key) as viewer_count
      FROM (
        SELECT media_id, media_type, minutes_watched, user_id::text as viewer_key
        FROM watch_history
        WHERE media_type != 'admin_adjustment'
        UNION ALL
        SELECT media_id, media_type, minutes_watched, session_id as viewer_key
        FROM anonymous_watch_history
        WHERE media_type != 'admin_adjustment'
      ) as combined_history
      GROUP BY media_id, media_type
      ORDER BY total_minutes DESC
      LIMIT 5
    `);
    
    const topMovies = await Promise.all(topMoviesRes.rows.map(async (movie: any) => {
      try {
        const tmdbRes = await axios.get(`https://api.themoviedb.org/3/${movie.media_type}/${movie.media_id}`, {
          headers: {
            Authorization: `Bearer ${process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY}`
          },
          params: {
            language: 'fr-FR'
          }
        });
        const data = tmdbRes.data;
        return {
          ...movie,
          title: data.title || data.name,
          poster_path: data.poster_path,
          overview: data.overview ? data.overview.substring(0, 100) + '...' : 'Pas de description',
        };
      } catch (e) {
        console.error(`Failed to fetch TMDB for ${movie.media_type}/${movie.media_id}`, e);
        return {
          ...movie,
          title: `ID: ${movie.media_id}`,
          poster_path: null,
          overview: 'Données indisponibles',
        };
      }
    }));

    const newUsersRes = await pool.query(`
      SELECT COUNT(*) FROM users 
      WHERE created_at >= NOW() - INTERVAL '7 days'
    `);
    const newUsersThisWeek = parseInt(newUsersRes.rows[0].count);

    // Fetch all users with their watch time and watched count to calculate ranks JS-side
    // This ensures consistency with the utils/ranks.ts logic
    const allUsersStatsRes = await pool.query(`
      SELECT 
        u.id, 
        COALESCE(SUM(wh.minutes_watched), 0) as total_minutes,
        (SELECT COUNT(*) FROM user_list ul WHERE ul.user_id = u.id AND ul.list_type = 'watched') as watched_count
      FROM users u
      LEFT JOIN watch_history wh ON u.id = wh.user_id
      GROUP BY u.id
    `);

    const rankCounts: Record<string, number> = {};
    
    // Initialize all ranks with 0
    RANKS.forEach(r => rankCounts[r.name] = 0);

    allUsersStatsRes.rows.forEach((user: any) => {
      const minutes = parseInt(user.total_minutes);
      const watchedCount = parseInt(user.watched_count);
      const rank = getRankFromWatchTime(minutes, watchedCount);
      if (rank) {
        rankCounts[rank.name] = (rankCounts[rank.name] || 0) + 1;
      }
    });

    return NextResponse.json({
      totalUsers,
      totalWatchTime,
      topMovies,
      newUsersThisWeek,
      usersByRank: rankCounts
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
