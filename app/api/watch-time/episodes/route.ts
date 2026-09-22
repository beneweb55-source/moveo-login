/**
 * GET — the STARTED EPISODES of one series, for the viewer who is looking.
 *
 * WHY THIS IS A SEPARATE ROUTE. `GET /api/watch-time` answers "what is this
 * viewer in the middle of" — one row per TITLE, ordered by recency, capped at 20.
 * That is the Continue Watching list, and §18 asks for it to stay simple. This
 * route answers the other question — "which episodes of THIS series have I
 * started" — from `watch_history_episodes`, where one row per
 * (title, season, episode) lives. Merging the two would mean changing the shape
 * of the Continue Watching payload, which every existing consumer reads.
 *
 * AUTHENTICATION IS THE SAME AS THE WRITE PATH, and the row filter is the same
 * rule: `user_id = $1` comes from the verified `auth_token` cookie and from
 * nothing else. There is no `session_id` parameter and no `user_id` parameter —
 * a caller-named key would let one visitor read another visitor's episodes (§23).
 *
 * A GUEST GETS `{ episodes: [], available: false }` with a 200, exactly as the
 * sibling route answers `{ progress: [] }`. A guest's episodes live in
 * localStorage; there is no server copy to read, and that is a normal answer
 * rather than an error.
 *
 * `available` IS NOT DECORATION. The table is created by
 * scripts/migrate-watch-history-episodes.ts, which is a DRY RUN until `--apply`
 * is passed and has not been applied. So "no rows" and "no table" are different
 * facts, and the interface must be able to say "not available" instead of
 * rendering an empty list that reads as "you have started nothing" — an invented
 * empty state is the same class of untruth as an invented number.
 */

import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import pool from '@/lib/db';
import { getJwtSecret } from '@/lib/jwtSecret';

async function getUserFromToken() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    if (!token) return null;
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

/** How many episodes one series may return. Enough for a long back catalogue. */
const LIMIT = 60;

export async function GET(req: Request) {
  try {
    const user = await getUserFromToken();
    if (!user || !user.userId) {
      return NextResponse.json({ episodes: [], available: false }, { status: 200 });
    }

    const { searchParams } = new URL(req.url);
    const media_type = searchParams.get('media_type');
    const media_id = searchParams.get('media_id');

    // The allowlist is the same one the write path enforces, and for the same
    // reason: the media type is half of a row's identity. `admin_adjustment` is
    // not a title and has no episodes, so it is not reachable here.
    if (media_type !== 'tv') {
      return NextResponse.json({ episodes: [], available: true }, { status: 200 });
    }
    if (!media_id || media_id.length > 32) {
      return NextResponse.json({ error: 'Invalid media_id' }, { status: 400 });
    }

    // Does the child table exist yet? `to_regclass` is a catalog lookup and
    // answers NULL when it does not, which is the honest "not available" rather
    // than an error to be caught and mislabelled.
    const probe = await pool.query(
      `SELECT to_regclass('public.watch_history_episodes') AS relation`,
    );
    if (probe.rows[0]?.relation === null || probe.rows[0]?.relation === undefined) {
      return NextResponse.json({ episodes: [], available: false }, { status: 200 });
    }

    // `"current_time"` is quoted because it is a RESERVED word in PostgreSQL:
    // unquoted in a SELECT list it parses as the SQL value function `CURRENT_TIME`
    // — the server's time of day — and the stored position is silently replaced by
    // a clock string. Measured on PostgreSQL 18.4; recorded in
    // docs/watch-history-audit-2026-09-22.md.
    const result = await pool.query(
      `SELECT season, episode, "current_time", total_duration, completed, last_updated
       FROM watch_history_episodes
       WHERE user_id = $1 AND media_type = $2 AND media_id = $3
       ORDER BY last_updated DESC
       LIMIT ${LIMIT}`,
      [user.userId, media_type, media_id],
    );

    return NextResponse.json(
      { episodes: result.rows, available: true },
      { status: 200 },
    );
  } catch (error) {
    console.error('Error fetching episode history:', error);
    return NextResponse.json({ episodes: [], available: false }, { status: 200 });
  }
}
