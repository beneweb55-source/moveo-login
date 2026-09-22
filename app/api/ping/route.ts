import { getJwtSecret } from '@/lib/jwtSecret';
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { v4 as uuidv4 } from 'uuid';

// Verified with `jose`, the library every other authenticated route in this app
// uses — including the two that verify this same `auth_token` cookie, so
// compatibility is not assumed here, it is already exercised in production.
//
// This route used to import `jsonwebtoken`, which is not declared in
// package.json: `npm ls jsonwebtoken --depth=0` is empty, and the package
// resolved only through `firebase-tools`, a devDependency. It was therefore
// present in a local install and absent from a production build, where the
// import would fail at module load. Its fallback literal also diverged from the
// app's 'fallback_secret', so an unset JWT_SECRET would have made this route
// reject tokens that every other route accepts.
//
// The secret now comes from lib/jwtSecret.ts, whose single reader THROWS on a
// missing JWT_SECRET rather than substituting that published constant. The read
// sits inside the token branch below and not at module scope, which matters
// here more than elsewhere: this route logs anonymous sessions, so it must keep
// answering when no secret is configured. A module-scope throw would have taken
// the whole route down — including the tokenless traffic — while an
// unconfigured deployment degrades correctly to "no session is attributed to a
// user", which is exactly what the catch below already decides.


export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    let userId: number | null = null;

    if (token) {
      try {
        const { payload } = await jwtVerify(token, getJwtSecret());
        // The same guard as lib/adminAuth.ts and /api/auth/me: a claim that is
        // not an integer identifies no user, so the request continues as the
        // anonymous session it would have been without a token at all. This
        // also stops a malformed claim from reaching the INSERT below.
        const claimed = Number(payload.userId);
        userId = Number.isInteger(claimed) ? claimed : null;
      } catch (e) {
        // Invalid token — continues as an anonymous session.
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

    if (userId) {
      // Check if user already has an active session
      const existingSession = await pool.query(
        'SELECT session_id FROM online_users WHERE user_id = $1',
        [userId]
      );

      if (existingSession.rows.length > 0) {
        // Update existing session
        await pool.query(`
          UPDATE online_users 
          SET session_id = $1, 
              last_ping = CURRENT_TIMESTAMP, 
              current_movie_id = $2, 
              current_movie_title = $3
          WHERE user_id = $4
        `, [sessionId, currentMovieId, currentMovieTitle, userId]);
      } else {
        // Insert new session (handle potential race condition with ON CONFLICT if constraint exists)
        await pool.query(`
          INSERT INTO online_users (session_id, user_id, last_ping, current_movie_id, current_movie_title)
          VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4)
          ON CONFLICT (user_id) DO UPDATE SET
            session_id = EXCLUDED.session_id,
            last_ping = CURRENT_TIMESTAMP,
            current_movie_id = EXCLUDED.current_movie_id,
            current_movie_title = EXCLUDED.current_movie_title
        `, [sessionId, userId, currentMovieId, currentMovieTitle]);
      }
    } else {
      // Anonymous user: upsert based on session_id
      await pool.query(`
        INSERT INTO online_users (session_id, user_id, last_ping, current_movie_id, current_movie_title)
        VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4)
        ON CONFLICT (session_id) DO UPDATE SET 
          user_id = EXCLUDED.user_id,
          last_ping = CURRENT_TIMESTAMP,
          current_movie_id = EXCLUDED.current_movie_id,
          current_movie_title = EXCLUDED.current_movie_title
      `, [sessionId, userId, currentMovieId, currentMovieTitle]);
    }

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
    console.error('Error in /api/ping:', error);
    // Generic on the wire. This route accepts anonymous callers by design, and
    // the driver's message carries table and column detail. Its only in-repo
    // caller (PingTracker) ignores the response body, so nothing reads this.
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
