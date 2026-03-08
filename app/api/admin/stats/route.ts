import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { checkAdminAccess } from '@/lib/adminAuth';

export async function GET() {
  const adminUser = await checkAdminAccess('view_stats');
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const totalUsersRes = await pool.query('SELECT COUNT(*) FROM users');
    const totalUsers = parseInt(totalUsersRes.rows[0].count);

    const totalWatchTimeRes = await pool.query('SELECT SUM(minutes_watched) FROM watch_history');
    const totalWatchTime = parseInt(totalWatchTimeRes.rows[0].sum || '0');

    const topMoviesRes = await pool.query(`
      SELECT media_id, media_type, SUM(minutes_watched) as total_minutes
      FROM watch_history
      GROUP BY media_id, media_type
      ORDER BY total_minutes DESC
      LIMIT 5
    `);
    const topMovies = topMoviesRes.rows;

    const newUsersRes = await pool.query(`
      SELECT COUNT(*) FROM users 
      WHERE created_at >= NOW() - INTERVAL '7 days'
    `);
    const newUsersThisWeek = parseInt(newUsersRes.rows[0].count);

    const usersByRankRes = await pool.query(`
      WITH UserWatchTime AS (
        SELECT user_id, SUM(minutes_watched) as total_minutes
        FROM watch_history
        GROUP BY user_id
      )
      SELECT 
        CASE 
          WHEN total_minutes < 600 THEN 'Novice'
          WHEN total_minutes < 3000 THEN 'Amateur'
          WHEN total_minutes < 12000 THEN 'Cinephile'
          WHEN total_minutes < 30000 THEN 'Expert'
          ELSE 'Master'
        END as rank,
        COUNT(*) as count
      FROM UserWatchTime
      GROUP BY rank
    `);
    
    const usersByRank = usersByRankRes.rows.reduce((acc: any, row: any) => {
      acc[row.rank] = parseInt(row.count);
      return acc;
    }, {});

    return NextResponse.json({
      totalUsers,
      totalWatchTime,
      topMovies,
      newUsersThisWeek,
      usersByRank
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
