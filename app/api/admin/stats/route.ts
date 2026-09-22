import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { checkAdminAccess } from '@/lib/adminAuth';
import axios from 'axios';
import { getRankFromWatchTime, RANKS } from '@/utils/ranks';

/**
 * THE ONE MEDIA TYPE THAT IS NOT VIEWING TIME.
 *
 * `/api/admin/watch-time` credits a user with minutes they did not watch by
 * writing a `watch_history` row at `(user_id, 'admin_adjustment', 0)`, and it
 * does that deliberately: the row lands in the same SUM the rank calculation
 * reads, which is how an admin compensates a user whose real progress was lost.
 * It is a real feature and real data.
 *
 * What it is NOT is time anyone spent watching, and the two cannot be added
 * into one number and still mean anything. This constant is declared once so
 * that every query on this page draws the same line — before it existed,
 * `totalWatchTime` summed adjustments while the queries below it excluded them,
 * so the page could disagree with itself: the headline could be raised by hand
 * and the titles-watched count could not.
 */
const ADMIN_ADJUSTMENT = 'admin_adjustment';

/**
 * A COUNT or SUM from Postgres as a number, and never `NaN`.
 *
 * `parseInt(undefined)` is `NaN`, and `NaN` reaches the dashboard as the literal
 * text "NaN" in a stat card — a displayed value that is not a value. Zero is the
 * honest reading of "the query returned nothing countable", and the surrounding
 * data is what tells the admin whether zero means "no activity" or "something is
 * wrong"; the card does not need to invent a third possibility.
 */
const toNumber = (value: unknown): number => {
  const parsed = Number.parseInt(String(value ?? '0'), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function GET() {
  const adminUser = await checkAdminAccess('view_stats');
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const totalUsersRes = await pool.query('SELECT COUNT(*) FROM users');
    const totalUsers = toNumber(totalUsersRes.rows[0].count);

    // ─── VIEWING TIME, AND THE CREDIT THAT IS NOT VIEWING TIME ──────────────
    //
    // Both halves are returned, and the split IS the fix: the card prints the
    // observed total and, when it is not zero, names the adjustment beside it.
    // A single blended figure is a number an admin cannot audit — they can see
    // 400h and cannot tell how much of it a colleague typed in.
    const watchTimeRes = await pool.query(`
      SELECT
        (SELECT COALESCE(SUM(minutes_watched), 0) FROM watch_history
          WHERE media_type <> $1) +
        (SELECT COALESCE(SUM(minutes_watched), 0) FROM anonymous_watch_history
          WHERE media_type <> $1) as total_sum,
        (SELECT COALESCE(SUM(minutes_watched), 0) FROM watch_history
          WHERE media_type = $1) as adjusted_sum
    `, [ADMIN_ADJUSTMENT]);
    const totalWatchTime = toNumber(watchTimeRes.rows[0].total_sum);
    const adjustedWatchTime = toNumber(watchTimeRes.rows[0].adjusted_sum);

    // Distinct TITLES, and distinct on `(media_type, media_id)` rather than on
    // `media_id`. TMDB ids are namespaced per type — film 1399 and series 1399
    // are different works — so counting the id alone silently counts a film and
    // a series that happen to share a number as one title. `UNION` deduplicates
    // the PAIR, which is what a title is.
    //
    // The field is named `totalTitlesWatched` and not `totalMoviesWatched`
    // because this counts films AND series; the card printed "Films Regardés"
    // while including every episode of every series in the number.
    const totalTitlesWatchedRes = await pool.query(`
      SELECT COUNT(*) as count
      FROM (
        SELECT media_type, media_id FROM watch_history WHERE media_type <> $1
        UNION
        SELECT media_type, media_id FROM anonymous_watch_history WHERE media_type <> $1
      ) as all_media
    `, [ADMIN_ADJUSTMENT]);
    const totalTitlesWatched = toNumber(totalTitlesWatchedRes.rows[0].count);

    const topMoviesRes = await pool.query(`
      SELECT media_id, media_type, SUM(minutes_watched) as total_minutes, COUNT(DISTINCT viewer_key) as viewer_count
      FROM (
        SELECT media_id, media_type, minutes_watched, user_id::text as viewer_key
        FROM watch_history
        WHERE media_type <> $1
        UNION ALL
        SELECT media_id, media_type, minutes_watched, session_id as viewer_key
        FROM anonymous_watch_history
        WHERE media_type <> $1
      ) as combined_history
      GROUP BY media_id, media_type
      ORDER BY total_minutes DESC
      LIMIT 5
    `, [ADMIN_ADJUSTMENT]);
    
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
    const newUsersThisWeek = toNumber(newUsersRes.rows[0].count);

    // Fetch all users with their watch time and watched count to calculate ranks JS-side
    //
    // THIS SUM INCLUDES `admin_adjustment`, and it is the one place where that is
    // correct: a rank is a statement about a user's CREDITED total, and the whole
    // purpose of an adjustment is to be credited. It is not viewing time, which
    // is why the headline card above excludes it — the two numbers answer two
    // different questions and neither is the other's rounding error.
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

    // Initialize all ranks with 0, so a rank with nobody in it reads "0" and not
    // as a rank that does not exist.
    RANKS.forEach(r => rankCounts[r.name] = 0);

    allUsersStatsRes.rows.forEach((user: any) => {
      const minutes = toNumber(user.total_minutes);
      const watchedCount = toNumber(user.watched_count);
      const rank = getRankFromWatchTime(minutes, watchedCount);
      if (rank) {
        rankCounts[rank.name] = (rankCounts[rank.name] || 0) + 1;
      }
    });

    return NextResponse.json({
      totalUsers,
      totalWatchTime,
      adjustedWatchTime,
      totalTitlesWatched,
      topMovies,
      newUsersThisWeek,
      usersByRank: rankCounts
    });
  } catch (error) {
    // The message goes to the server log. Returning `error.message` to the
    // caller put raw database text — table names, constraint names, sometimes a
    // fragment of a query — into an HTTP response, and the admin who needs the
    // detail is the admin reading the log.
    console.error('[admin/stats] GET failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
