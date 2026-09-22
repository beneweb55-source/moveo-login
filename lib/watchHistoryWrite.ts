/**
 * The signed-in watch-history write, as one serialized unit.
 *
 * CALLERS: `app/api/watch-time/route.ts` (the signed-in branch of POST) and
 * `tests/watchHistoryConcurrency.test.ts`, which drives it against a real
 * PostgreSQL. No HTTP contract changes: same request body, same columns, same
 * response.
 *
 * SCHEMA: reads and writes `watch_history` — id, user_id, media_type, media_id,
 * minutes_watched, title, poster_path, current_time, total_duration, season,
 * episode, last_updated, UNIQUE(user_id, media_type, media_id) — as created by
 * scripts/init-new-db.ts and extended by scripts/migrate-progression.ts, AND the
 * per-episode child, `watch_history_episodes`, as declared by
 * scripts/migrate-watch-history-episodes.ts.
 *
 * THIS FILE STILL INTRODUCES NO MIGRATION, and it does not assume the child table
 * exists: the child write is guarded by a `to_regclass` probe and is SKIPPED —
 * not failed — when the table is absent, so the parent row's write behaves
 * exactly as it did before the migration is applied. Until it is applied, the
 * multi-episode model is code-complete and stores nothing; that is the honest
 * state and the report says so.
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

import {
  isComplete,
  progressionColumns,
  slotOf,
  type ProgressionFields,
} from '@/lib/progressionGuard';

/** The shape every helper here queries through, so the client and a test share it. */
type Query = (
  text: string,
  values: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;

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

/**
 * One stored row, in the shape the guard reads.
 *
 * `last_updated` arrives from `pg` as a Date; the string branch is there because
 * the driver's type mapping is a configuration detail and a timestamp that
 * arrives as text must not be read as absent.
 *
 * A value that cannot be read as a finite number is reported as ABSENT, never as
 * NaN. The distinction matters: the guard treats a missing timestamp as "this is
 * happening now", so an unreadable one is harmless, whereas NaN passes
 * `typeof === "number"` and makes every comparison false — which would refuse
 * every episode change on the account for as long as that row existed, with
 * nothing in any log to say why.
 */
const fieldsFromRow = (row: Record<string, unknown>): ProgressionFields => {
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

/** The row this TITLE already has, in the shape the guard reads. */
const readStoredProgression = async (
  query: Query,
  write: SignedInWrite,
): Promise<ProgressionFields | undefined> => {
  const existing = await query(
    `SELECT "current_time", total_duration, season, episode, last_updated
     FROM watch_history
     WHERE user_id = $1 AND media_type = $2 AND media_id = $3`,
    [write.userId, write.mediaType, write.mediaId],
  );
  const row = existing.rows[0];
  return row ? fieldsFromRow(row) : undefined;
};

/**
 * The row this EPISODE already has, in the shape the guard reads.
 *
 * A separate read against a separate table, and that separation is the point
 * rather than an implementation detail: a write for S1E4 must be decided against
 * S1E4's stored position. Judging it against the parent row — which holds S2E7
 * after an episode switch — would read the lower episode number as a rewind and
 * refuse a genuinely new episode, which is the defect §11's scenario is written
 * to catch.
 */
const readStoredEpisode = async (
  query: Query,
  write: SignedInWrite,
  slot: { season: number; episode: number },
): Promise<ProgressionFields | undefined> => {
  const existing = await query(
    `SELECT "current_time", total_duration, season, episode, last_updated
     FROM watch_history_episodes
     WHERE user_id = $1 AND media_type = $2 AND media_id = $3
       AND season = $4 AND episode = $5`,
    [write.userId, write.mediaType, write.mediaId, slot.season, slot.episode],
  );
  const row = existing.rows[0];
  return row ? fieldsFromRow(row) : undefined;
};

/**
 * Whether `watch_history_episodes` exists, asked at most until it does.
 *
 * The child write must not run before the migration does, and it must not fail
 * the parent write either. The table is created by
 * scripts/migrate-watch-history-episodes.ts, which is a DRY RUN until `--apply`
 * is passed and has not been applied (see that file's own header for the
 * production measurement behind it). `to_regclass` is a catalog lookup that
 * returns NULL when the relation does not exist — the honest answer, rather than
 * an error to catch after the fact.
 *
 * ONLY A POSITIVE ANSWER IS CACHED. Caching a negative would make the feature
 * permanently absent in a process that outlives the migration: a long-running
 * server would keep its boot-time "no table" answer after an operator applied
 * the migration, and the child rows would silently never be written — a
 * capability that appears to exist in the code and never runs. A process that
 * has SEEN the table can keep saying so, because nothing in the write path drops
 * it (the migration's rollback plan does, and a rollback is not a state a live
 * process should silently survive).
 */
let episodesTablePresent = false;

const episodesTableExists = async (query: Query): Promise<boolean> => {
  if (episodesTablePresent) return true;
  const probe = await query(
    `SELECT to_regclass('public.watch_history_episodes') AS relation`,
    [],
  );
  const relation = probe.rows[0]?.relation;
  episodesTablePresent = relation !== null && relation !== undefined;
  return episodesTablePresent;
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

      // ── the per-episode row, in the SAME transaction ──
      //
      // §16's requirement is one logical operation, and no "write A succeeded,
      // write B failed". Both rows commit together or neither does. There is no
      // second transaction and NO SECOND LOCK: the advisory lock taken above is
      // per (user, media), i.e. it already serializes every episode of this
      // title, so the property that a transaction takes exactly one lock — and
      // therefore cannot deadlock on lock ordering — is preserved rather than
      // weakened.
      //
      // WHICH SLOT: the CALLER's, never the winner's. The parent's slot may have
      // stayed where it was because the guard refused a stale observation, and
      // writing the child row under the parent's slot in that case would file an
      // observation under an episode it does not describe. The slot the caller
      // named is what the observation is about.
      //
      // A POSITION IS REQUIRED. A child row with no measured position adds
      // nothing the parent pointer does not already say, and recording one would
      // turn this table into a list of episodes that were OPENED — §13 forbids
      // treating a visit as playback. So a slot change with no measurement
      // updates the parent (which is what "you are on this episode now" means)
      // and creates no child row.
      //
      // The child write cannot resurrect a refused observation either: it runs
      // the SAME guard, against the child's own stored row, and `progressionColumns`
      // returns all-nulls when the incoming observation loses — in which case
      // nothing is written at all.
      const incoming = write.progression;
      if (incoming) {
        const slot = slotOf(incoming.season, incoming.episode);
        if (slot !== null && incoming.position !== null) {
          if (await episodesTableExists((text, values) => client.query(text, values))) {
            const storedEpisode = await readStoredEpisode(
              (text, values) => client.query(text, values),
              write,
              slot,
            );
            const child = progressionColumns(storedEpisode, incoming);

            if (child.currentTime !== null) {
              await client.query(
                `INSERT INTO watch_history_episodes (user_id, media_type, media_id, season, episode, "current_time", total_duration, completed, last_updated)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
                 ON CONFLICT (user_id, media_type, media_id, season, episode)
                 DO UPDATE SET
                   "current_time" = COALESCE($6, watch_history_episodes."current_time"),
                   total_duration = COALESCE($7, watch_history_episodes.total_duration),
                   completed = $8,
                   last_updated = CURRENT_TIMESTAMP`,
                [
                  write.userId,
                  write.mediaType,
                  write.mediaId,
                  slot.season,
                  slot.episode,
                  child.currentTime,
                  child.totalDuration,
                  // Derived from the values this write actually stored, using the
                  // guard's own ratio — never a literal, so the ratio that decides
                  // a rewatch in the browser and the one recorded here cannot
                  // drift apart.
                  isComplete(child.currentTime, child.totalDuration),
                ],
              );
            }
          }
        }
      }

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
