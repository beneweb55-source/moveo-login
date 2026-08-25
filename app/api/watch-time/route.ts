import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import pool from '@/lib/db';

async function getUserFromToken() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;

    if (!token) return null;

    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback_secret');
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch (error) {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const user = await getUserFromToken();
    const body = await req.json();
    const { media_type, media_id, minutes, session_id, title, poster_path, current_time, total_duration, season, episode } = body;

    if (!media_type || !media_id || !minutes) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!user && !session_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user && user.userId) {
      // Upsert watch time for authenticated user — also stores progression
      await pool.query(
        `INSERT INTO watch_history (user_id, media_type, media_id, minutes_watched, title, poster_path, current_time, total_duration, season, episode, last_updated)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, media_type, media_id)
         DO UPDATE SET 
           minutes_watched = watch_history.minutes_watched + $4,
           title = COALESCE($5, watch_history.title),
           poster_path = COALESCE($6, watch_history.poster_path),
           current_time = COALESCE($7, watch_history.current_time),
           total_duration = COALESCE($8, watch_history.total_duration),
           season = COALESCE($9, watch_history.season),
           episode = COALESCE($10, watch_history.episode),
           last_updated = CURRENT_TIMESTAMP`,
        [user.userId, media_type, media_id, minutes, title || null, poster_path || null, current_time || null, total_duration || null, season || null, episode || null]
      );
    } else if (session_id) {
      // Upsert watch time for anonymous user
      await pool.query(
        `INSERT INTO anonymous_watch_history (session_id, media_type, media_id, minutes_watched, last_updated)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (session_id, media_type, media_id)
         DO UPDATE SET 
           minutes_watched = anonymous_watch_history.minutes_watched + $4,
           last_updated = CURRENT_TIMESTAMP`,
        [session_id, media_type, media_id, minutes]
      );
    }

    return NextResponse.json({ message: 'Watch time updated' }, { status: 200 });
  } catch (error: any) {
    console.error('Error updating watch time:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET — fetch user's watch progress for "Resume watching"
export async function GET(req: Request) {
  try {
    const user = await getUserFromToken();
    if (!user || !user.userId) {
      return NextResponse.json({ progress: [] }, { status: 200 });
    }

    const result = await pool.query(
      `SELECT media_type, media_id, minutes_watched, title, poster_path, 
              current_time, total_duration, season, episode, last_updated
       FROM watch_history 
       WHERE user_id = $1 
         AND media_type NOT IN ('admin_adjustment')
         AND title IS NOT NULL
       ORDER BY last_updated DESC 
       LIMIT 20`,
      [user.userId]
    );

    return NextResponse.json({ progress: result.rows }, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching watch progress:', error);
    return NextResponse.json({ progress: [] }, { status: 200 });
  }
}
