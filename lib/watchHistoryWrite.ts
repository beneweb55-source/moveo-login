/**
 * The signed-in watch-history write, as one serialized unit.
 *
 * CALLERS: `app/api/watch-time/route.ts` (the signed-in branch of POST) and
 * `tests/watchHistoryConcurrency.test.ts`, which drives it against a real
 * PostgreSQL. No HTTP contract changes: same request body, same columns, same
 * response.
 *
 * SCHEMA: reads and writes `watch_history` only — id, user_id, media_type,
 * media_id, minutes_watched, title, poster_path, current_time, total_duration,
 * season, episode, last_updated, UNIQUE(user_id, media_type, media_id) — as
 * created by scripts/init-new-db.ts and extended by scripts/migrate-progression.ts.
 * No migration is introduced.
 *
 * `"current_time"` IS ALWAYS QUOTED, and that is load-bearing rather than
 * stylistic. `CURRENT_TIME` is a RESERVED word in PostgreSQL (`pg_get_keywords`
 * catcode `R`), so an unquoted `current_time` is not an identifier there:
 *
 *  - in an INSERT column list or an `ON CONFLICT … SET` target it is a SYNTAX
 *    ERROR — `42601`, measured on PostgreSQL 18.4 while building this module's
 *    test fixture. The write threw on every call, so nothing was ever stored;
 *  - in a SELECT list it parses and SILENTLY READS THE WRONG THING — the SQL
 *    value function `CURRENT_TIME`, i.e. the server's time of day, returned as
 *    text such as `"13:36:54.602569+01"`. A stored position read through it comes
 *    back as a time of day, which numeric coercion turns into NaN, which the
 *    guard then reads as "no stored position" while the column holds one.
 *
 * Both halves are recorded, with the measurements, in
 * docs/watch-history-audit-2026-09-22.md. `tests/watchTime.test.ts` pins the
 * quoting as a source-level assertion so the mistake cannot return silently on a
 * machine with no database to fail against.
 *
 * WHY THIS MODULE EXISTS (audit finding F6). The write was a SELECT followed by
 * an INSERT … ON CONFLICT in a route, with nothing between them. Two writers —
 * a player in one tab, a guest-history merge in another — could therefore both
 * read the row before either had written it, and each would decide against a
 * snapshot that was already out of date. When no row existed yet, BOTH took the
 * "this is the first observation" branch, and the row's final state was decided
 * by which request happened to land last rather than by the progression rule.
 * A month-old guest entry landing last rewound an account that had since reached
 * a later episode — §9's named case — and nothing in the row or in any log said
 * a decision had been skipped.
 *
 * The remedy is an advisory lock taken INSIDE a transaction, before the read:
 *
 *   BEGIN
 *   SELECT pg_advisory_xact_lock(hashtext(user:type:id))
 *   SELECT … the stored row
 *   decision (lib/progressionGuard)
 *   INSERT … ON CONFLICT DO UPDATE
 *   COMMIT
 *
 * WHY NOT `SELECT … FOR UPDATE`, which is the obvious answer: it cannot lock a
 * row that does not exist yet, which is exactly the case that loses the
 * decision. And `ON CONFLICT` alone does not help either — by the time it
 * arbitrates, both writers have already chosen their values from a stale read.
 * The lock has to come first, so the second writer's SELECT sees the first
 * writer's committed row and applies the rule to it.
 *
 * The lock is transaction-scoped, so it is released by COMMIT or ROLLBACK with
 * no cleanup path to get wrong. Each transaction takes exactly ONE lock, so no
 * lock-ordering deadlock is possible. The cost is that writers for the same
 * (user, media) are serialized: writes are two short statements on a single
 * row, and the lock is per title, not global.
 *
 * STATED TRADE-OFF: `pg_advisory_xact_lock` waits indefinitely. A writer that
 * hangs inside this transaction blocks other writes for the SAME title until
 * its connection dies. The alternative, `pg_try_advisory_xact_lock` with a
 * retry budget, would trade that for dropped progress updates — which is the
 * wrong direction for a value the viewer expects to find on their next visit.
 *
 * And the wait happens while holding a POOLED CLIENT (`lib/db.ts` sets no `max`
 * and no `connectionTimeoutMillis`, so `pg`'s defaults apply: ten clients, and a
 * request for an eleventh waits for one indefinitely). The previous
 * two-statement write held a client too, but never waited on a lock, so a hang
 * could not hold a client open. What keeps this small is that the transaction is
 * two short statements on one row, one lock per transaction, and `release()` in
 * a `finally`; the residual risk is a transaction that hangs, and it is recorded
 * in docs/watch-history-audit-2026-09-22.md §5.2 rather than left implicit.
 */

import type { Pool } from 'pg';

import { progressionColumns, type ProgressionFields } from '@/lib/progressionGuard';

export interface SignedInWrite {
  userId: number | string;
  mediaType: string;
  mediaId: number | string;
  minutes: number;
  title?: string | null;
  posterPath?: string | null;
  /**
   * Where the viewer is, or `null` when the caller sent no progression at all.
   *
   * `null` is not "no values": it is "this request has nothing to say about where
   * the viewer is", which is what a WatchTimer minute tick sends. Those requests
   * skip the read, the decision and the lock, and only add minutes.
   *
   * The shape is the guard's own `ProgressionFields`, so what the caller hands in
   * is what the rule reads with no translation step that could reorder or drop a
   * field in between.
   */
  progression: ProgressionFields | null;
}

/** The row this title already has, in the shape the guard reads. */
const readStoredProgression = async (
  query: (text: string, values: unknown[]) => Promise<{rows: Record<string, unknown>[]}>,
  write: SignedInWrite,
) => {
  const existing = await query(
    `SELECT "current_time", total_duration, season, episode, last_updated
     FROM watch_history
     WHERE user_id = $1 AND media_type = $2 AND media_id = $3`,
    [write.userId, write.mediaType, write.mediaId],
  );
  const row = existing.rows[0];
  if (!row) return undefined;

  // `last_updated` arrives from `pg` as a Date; the string branch is there
  // because the driver's type mapping is a configuration detail and a timestamp
  // that arrives as text must not be read as absent.
  //
  // A value that cannot be read as a finite number is reported as ABSENT, never
  // as NaN. The distinction matters: the guard treats a missing timestamp as
  // "this is happening now", so an unreadable one is harmless, whereas NaN
  // passes `typeof === "number"` and makes every comparison false — which would
  // refuse every episode change on the account for as long as that row existed,
  // with nothing in any log to say why.
  const raw = row.last_updated;
  const ms =
    raw instanceof Date
      ? raw.getTime()
      : typeof raw === 'string'
        ? Date.parse(raw)
        : Number.NaN;

  return {
    position: row.current_time === null ? null : Number(row.current_time),
    duration: row.total_duration === null ? null : Number(row.total_duration),
    season: row.season === null ? null : Number(row.season),
    episode: row.episode === null ? null : Number(row.episode),
    observedAt: Number.isFinite(ms) ? ms : null,
  };
};

/**
 * Adds minutes and (when the caller sent a progression) moves the stored
 * position and slot according to the no-regression rule.
 *
 * `pool` is injected rather than imported so this can be driven by a test
 * against a real database, which is the only way the race above can be shown to
 * be gone rather than assumed to be.
 */
export const writeSignedInProgress = async (
  pool: Pool,
  write: SignedInWrite,
): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    try {
      let writeCurrentTime: number | null = null;
      let writeTotalDuration: number | null = null;
      let writeSeason: number | null = null;
      let writeEpisode: number | null = null;

      if (write.progression) {
        // Taken BEFORE the read, so the read cannot be stale. A single key for
        // the whole (user, media) row; `hashtext` collisions only mean two
        // unrelated titles serialize, which is harmless.
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [
          `${write.userId}:${write.mediaType}:${write.mediaId}`,
        ]);

        const storedFields = await readStoredProgression(
          (text, values) => client.query(text, values),
          write,
        );

        // The winner and the columns it implies, in one call. The rule itself is
        // in lib/progressionGuard.ts — the same function the browser calls — so
        // the two cannot drift apart.
        const columns = progressionColumns(storedFields, write.progression);

        writeCurrentTime = columns.currentTime;
        writeTotalDuration = columns.totalDuration;
        writeSeason = columns.season;
        writeEpisode = columns.episode;
      }

      // Every progression column is `null` unless the observation that won the
      // guard supplied it, because a null here means "leave the stored value
      // alone" and the losing observation has nothing to say about this row.
      //
      // `??` and not `||` for the numeric fields: 0 is a real value for every one
      // of them. Season 0 is how TMDB spells SPECIALS, and a position of 0 is the
      // start of the video — `||` turned both into "no value", so COALESCE kept
      // the stale value instead of storing what was sent. The string fields keep
      // `||`, where an empty string genuinely means "nothing to store".
      await client.query(
        `INSERT INTO watch_history (user_id, media_type, media_id, minutes_watched, title, poster_path, "current_time", total_duration, season, episode, last_updated)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, media_type, media_id)
         DO UPDATE SET
           minutes_watched = watch_history.minutes_watched + $4,
           title = COALESCE($5, watch_history.title),
           poster_path = COALESCE($6, watch_history.poster_path),
           "current_time" = COALESCE($7, watch_history."current_time"),
           total_duration = COALESCE($8, watch_history.total_duration),
           season = COALESCE($9, watch_history.season),
           episode = COALESCE($10, watch_history.episode),
           last_updated = CURRENT_TIMESTAMP`,
        [
          write.userId,
          write.mediaType,
          write.mediaId,
          write.minutes,
          write.title || null,
          write.posterPath || null,
          writeCurrentTime,
          writeTotalDuration,
          writeSeason,
          writeEpisode,
        ],
      );

      await client.query('COMMIT');
    } catch (error) {
      // The transaction is abandoned whole. A half-applied write here would be a
      // row whose position and slot came from different observations — the
      // contradiction `progressionColumns` exists to make unrepresentable.
      try {
        await client.query('ROLLBACK');
      } catch {
        /* the connection is already unusable; the original error matters more */
      }
      throw error;
    }
  } finally {
    client.release();
  }
};
