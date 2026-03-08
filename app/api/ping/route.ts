import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    let userId = null;

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        userId = decoded.userId;
      } catch (e) {
        // Invalid token
      }
    }

    let sessionId = cookieStore.get('session_id')?.value;
    let response = NextResponse.json({ success: true });

    if (!sessionId) {
      sessionId = uuidv4();
      response.cookies.set('session_id', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 // 24 hours
      });
    }

    const { currentMovieId, currentMovieTitle, currentPath } = await req.json().catch(() => ({}));

    // Update or insert online user
    await pool.query(`
      INSERT INTO online_users (session_id, user_id, last_ping, current_movie_id, current_movie_title)
      VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4)
      ON CONFLICT (session_id) DO UPDATE SET 
        user_id = EXCLUDED.user_id,
        last_ping = CURRENT_TIMESTAMP,
        current_movie_id = EXCLUDED.current_movie_id,
        current_movie_title = EXCLUDED.current_movie_title
    `, [sessionId, userId, currentMovieId, currentMovieTitle]);

    // Append path to pages_visited if not already there
    if (currentPath) {
      await pool.query(`
        UPDATE online_users 
        SET pages_visited = COALESCE(pages_visited, '[]'::jsonb) || $1::jsonb
        WHERE session_id = $2 AND NOT (COALESCE(pages_visited, '[]'::jsonb) @> $1::jsonb)
      `, [JSON.stringify([currentPath]), sessionId]);
    }

    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
