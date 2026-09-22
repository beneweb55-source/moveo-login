import { getJwtSecret } from '@/lib/jwtSecret';
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import pool from '@/lib/db';
import { progressionColumns } from '@/lib/progressionGuard';

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
      // ── Progression, when the caller actually sent any ──
      //
      // Only a NUMERIC season/episode/position counts as "the caller is telling
      // me where the viewer is". A `null` means "not applicable" — a film has no
      // season — and must not be read as an instruction to erase what is stored.
      // This distinction is what keeps WatchTimer's minute ticks, which carry no
      // progression at all, from wiping a position they know nothing about:
      // they simply skip this block.
      const progressionSent =
        typeof current_time === 'number' ||
        typeof total_duration === 'number' ||
        typeof season === 'number' ||
        typeof episode === 'number';

      // Values actually written to the progression columns. `null` here means
      // "leave the stored value alone" — the ON CONFLICT below COALESCEs — and
      // that is now the answer for EVERY column the losing observation carried,
      // not just the position.
      let writeCurrentTime: number | null = null;
      let writeTotalDuration: number | null = null;
      // The season and episode are written here rather than taken from the
      // request body directly, and that is the fix for a row that contradicted
      // itself. They used to be `COALESCE($9, watch_history.season)` fed from the
      // raw body, so a refused observation still moved the slot: a stale entry
      // lost the position comparison and kept the season/episode, which left the
      // row reading "S2E7 · 32:14" — or, when the loser was the newer entry, kept
      // the newer position under the older episode's number. The slot now moves
      // only together with the observation that won it, so the position and the
      // episode number always describe the same thing.
      let writeSeason: number | null = null;
      let writeEpisode: number | null = null;

      if (progressionSent) {
        // What is already stored for THIS title, so the no-regression rule has
        // something to compare against. One extra SELECT per write, and it buys
        // the §9 guarantee that a write from a second device can never rewind a
        // position a first device already recorded. The comparison itself lives
        // in lib/progressionGuard.ts — the same function the browser calls — so
        // the two rules cannot drift apart.
        //
        // `last_updated` is read for the ordering question and for nothing else.
        // It is the only time the server knows for the stored observation, and
        // the guard needs it to tell a current episode change from a guest's
        // month-old entry arriving late in a merge (§9).
        const existing = await pool.query(
          `SELECT current_time, total_duration, season, episode, last_updated
           FROM watch_history
           WHERE user_id = $1 AND media_type = $2 AND media_id = $3`,
          [user.userId, media_type, media_id]
        );
        const row = existing.rows[0];

        // `last_updated` arrives from `pg` as a Date; the string branch is there
        // because the driver's type mapping is a configuration detail and a
        // timestamp that arrives as text must not be read as absent.
        //
        // A value that cannot be read as a finite number is reported as ABSENT,
        // never as NaN. The distinction matters: the guard treats a missing
        // timestamp as "this is happening now", so an unreadable one is harmless,
        // whereas NaN passes `typeof === 'number'` and makes every comparison
        // false — which would refuse every episode change on the account for as
        // long as that row existed, with nothing in any log to say why.
        const storedObservedAt = (() => {
          const raw = row?.last_updated;
          const ms =
            raw instanceof Date
              ? raw.getTime()
              : typeof raw === 'string'
                ? Date.parse(raw)
                : Number.NaN;
          return Number.isFinite(ms) ? ms : null;
        })();

        const storedFields = row
          ? {
              position: row.current_time === null ? null : Number(row.current_time),
              duration: row.total_duration === null ? null : Number(row.total_duration),
              season: row.season === null ? null : Number(row.season),
              episode: row.episode === null ? null : Number(row.episode),
              observedAt: storedObservedAt,
            }
          : undefined;
        const incomingFields = {
          position: typeof current_time === 'number' ? current_time : null,
          duration: typeof total_duration === 'number' ? total_duration : null,
          season: typeof season === 'number' ? season : null,
          episode: typeof episode === 'number' ? episode : null,
          // Advisory, and self-scoped: it orders this account's own observations
          // against each other and can therefore only reorder rows belonging to
          // the caller. A non-finite value is discarded as absent rather than
          // rejected, because a client that cannot compute a timestamp should
          // still be able to save its position.
          observedAt: typeof observed_at === 'number' && Number.isFinite(observed_at)
            ? observed_at
            : null,
        };

        // The winner and the columns it implies, in one call. The rule itself is
        // in lib/progressionGuard.ts, tested there, because a decision made
        // inline here cannot be reached by any test that does not have a
        // database — and that is how the contradictions this fixes went unnoticed.
        const columns = progressionColumns(storedFields, incomingFields);

        writeCurrentTime = columns.currentTime;
        writeTotalDuration = columns.totalDuration;
        writeSeason = columns.season;
        writeEpisode = columns.episode;
        // Every other outcome leaves ALL of the stored columns as they are. The
        // branch that used to NULL the position here is gone on purpose: it fired
        // when the stored observation won a slot change, which is exactly the
        // case where the position it was about to erase was the only correct
        // record in the row — a viewer at 32:14 who clicked the next episode in a
        // list lost the position, and R3-F2 is that defect. The situation it was
        // written for (a null position being read as the new episode's) can no
        // longer arise, because a slot now moves only with a measured position.
      }

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
        // Every progression column is `null` unless the observation that won the
        // guard supplied it, because a null here means "leave the stored value
        // alone" and the losing observation has nothing to say about this row.
        //
        // `??` and not `||` for the numeric fields: 0 is a real value for every one
        // of them. Season 0 is how TMDB spells SPECIALS, and a position of 0 is the
        // start of the video — `||` turned both into "no value", so COALESCE kept
        // the stale value instead of storing what was sent. The string fields keep
        // `||`, where an empty string genuinely means "nothing to store".
        [user.userId, media_type, media_id, minutesValue, title || null, poster_path || null, writeCurrentTime, writeTotalDuration, writeSeason, writeEpisode]
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
