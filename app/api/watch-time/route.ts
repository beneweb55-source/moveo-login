import { getJwtSecret } from '@/lib/jwtSecret';
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import pool from '@/lib/db';
import { writeSignedInProgress } from '@/lib/watchHistoryWrite';

async function getUserFromToken() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;

    if (!token) return null;

    const secret = getJwtSecret();
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
    const { media_type, media_id, minutes, session_id, title, poster_path, current_time, total_duration, season, episode, observed_at } = body;

    // `minutes` may legitimately be 0. historyManager sends a progression-only
    // update — `minutes: 0, // Progression update only, no time increment` — and
    // `!minutes` is `!0` is `true`, so every one of those calls was answered with
    // 400 and progression (current_time / season / episode) was never persisted.
    // The intent is "no time increment", not "malformed": validate the TYPE and
    // the SIGN, never the magnitude. Absent, null, NaN, Infinity and negatives
    // are still rejected.
    const minutesProvided =
      typeof minutes === 'number' || (typeof minutes === 'string' && minutes.trim() !== '');
    const minutesValue = minutesProvided ? Number(minutes) : Number.NaN;

    if (!media_type || !media_id || !minutesProvided || !Number.isFinite(minutesValue) || minutesValue < 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!user && !session_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user && user.userId) {
      // The id the write is attributed to comes from the verified token and from
      // nowhere else (`user_id = $1` is what makes it impossible for one account
      // to write another's row). It is NARROWED here rather than cast, because
      // `getUserFromToken` returns jose's `JWTPayload`, whose values are
      // `unknown`: a token whose `userId` is not an id is a token this route
      // cannot attribute a write to, and 401 is what it already answers a
      // request with no usable session. Both sign-in routes put `user.id` — a
      // number from `users.id` — into this claim, so no real token is refused.
      const userId = user.userId;
      if (typeof userId !== 'number' && typeof userId !== 'string') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // ── Progression, when the caller actually sent any ──
      //
      // Only a NUMERIC season/episode/position counts as "the caller is telling
      // me where the viewer is". A `null` means "not applicable" — a film has no
      // season — and must not be read as an instruction to erase what is stored.
      // This distinction is what keeps WatchTimer's minute ticks, which carry no
      // progression at all, from wiping a position they know nothing about:
      // they simply skip the progression half of the write.
      const progressionSent =
        typeof current_time === 'number' ||
        typeof total_duration === 'number' ||
        typeof season === 'number' ||
        typeof episode === 'number';

      // The write is one serialized transaction. It used to be a SELECT then an
      // INSERT … ON CONFLICT issued separately, with nothing between them, so two
      // writers could each decide against a row the other had already replaced
      // and the final state was decided by arrival order rather than by the
      // no-regression rule. See lib/watchHistoryWrite.ts for what the lock is,
      // why `FOR UPDATE` would not have been enough, and the trade-off it makes.
      await writeSignedInProgress(pool, {
        userId,
        mediaType: media_type,
        mediaId: media_id,
        minutes: minutesValue,
        title,
        posterPath: poster_path,
        progression: progressionSent
          ? {
              position: typeof current_time === 'number' ? current_time : null,
              // Only meaningful alongside a position: a duration with no
              // position is a runtime, not a place in the video.
              duration: typeof total_duration === 'number' ? total_duration : null,
              season: typeof season === 'number' ? season : null,
              episode: typeof episode === 'number' ? episode : null,
              // Advisory, and self-scoped: it orders this account's own
              // observations against each other and can therefore only reorder
              // rows belonging to the caller. A non-finite value is discarded as
              // absent rather than rejected, because a client that cannot compute
              // a timestamp should still be able to save its position.
              observedAt:
                typeof observed_at === 'number' && Number.isFinite(observed_at)
                  ? observed_at
                  : null,
            }
          : null,
      });
    } else if (session_id) {
      // Upsert watch time for anonymous user
      await pool.query(
        `INSERT INTO anonymous_watch_history (session_id, media_type, media_id, minutes_watched, last_updated)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (session_id, media_type, media_id)
         DO UPDATE SET 
           minutes_watched = anonymous_watch_history.minutes_watched + $4,
           last_updated = CURRENT_TIMESTAMP`,
        [session_id, media_type, media_id, minutesValue]
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

    // `"current_time"` is quoted because it is a RESERVED word in PostgreSQL.
    // Unquoted it parses here, but as the SQL value function `CURRENT_TIME` —
    // the server's time of day — rather than as the stored position, so every
    // row came back with a text clock in that field and the viewer's position
    // was silently dropped by the numeric coercion on the client. Measured on
    // PostgreSQL 18.4; see docs/watch-history-audit-2026-09-22.md.
    const result = await pool.query(
      `SELECT media_type, media_id, minutes_watched, title, poster_path,
              "current_time", total_duration, season, episode, last_updated
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

/**
 * DELETE — remove one title from the signed-in viewer's own history.
 *
 * §15 asks the interface to let a viewer delete an entry. Without this, deleting
 * only the localStorage copy left the server row to be read back on the next
 * page load and the entry reappeared, so the control was not doing what it said.
 *
 * WHY THE VALIDATION IS THIS NARROW
 *
 *  - `media_type` must be exactly `movie` or `tv`. That is not a formatting
 *    preference: it also makes the admin bookkeeping rows unwritable from here.
 *    The GET above has to exclude `admin_adjustment` by name, which is the shape
 *    of a table where any caller can name its own row type.
 *  - `media_id` must be a non-empty string of at most 32 characters. Postgres
 *    infers the parameter's type from `media_id INTEGER`, so a value it cannot
 *    read as an integer is rejected by the database rather than by a regex here;
 *    the bound is only there to stop an unbounded body being handed to it.
 *  - The row is matched by `user_id` AND `media_type` AND `media_id`. The
 *    `user_id = $1` comes from the verified token and is never taken from the
 *    request, which is what makes it impossible for one account to delete
 *    another's entry (§23), and what stops a caller-named `session_id` from
 *    being used to reach anonymous rows at all.
 *
 * A guest gets 401, exactly as the write path gives. The client treats that as
 * "no account behind this", removes the local copy and does not retry.
 */
export async function DELETE(req: Request) {
  try {
    const user = await getUserFromToken();
    if (!user || !user.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const media_type = searchParams.get('media_type');
    const media_id = searchParams.get('media_id');

    if (media_type !== 'movie' && media_type !== 'tv') {
      return NextResponse.json({ error: 'Invalid media_type' }, { status: 400 });
    }
    if (!media_id || media_id.length > 32) {
      return NextResponse.json({ error: 'Invalid media_id' }, { status: 400 });
    }

    const result = await pool.query(
      `DELETE FROM watch_history
       WHERE user_id = $1 AND media_type = $2 AND media_id = $3`,
      [user.userId, media_type, media_id]
    );

    return NextResponse.json({ deleted: result.rowCount ?? 0 }, { status: 200 });
  } catch (error: any) {
    console.error('Error deleting watch history entry:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
