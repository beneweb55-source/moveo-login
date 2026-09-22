/**
 * The watch-history write under concurrency, against a REAL PostgreSQL.
 *
 * §7 of the audit brief asks for a reproducible concurrency test — two writers,
 * the same account and title, different positions — and asks whether an older
 * position can replace a newer one. This suite answers that by running the actual
 * SQL against an actual database, because the defect it is about lives in the
 * gap between two statements and no mock can hold a gap open.
 *
 * Two implementations are exercised, and both are needed:
 *
 *  - `writeSignedInProgress` — the shipped function (lib/watchHistoryWrite.ts).
 *  - `planLegacyWrite` / `applyLegacyWrite` — the write path as it stood BEFORE
 *    that function existed, split at the seam the race lives on. This is the
 *    counter-example: an assertion that only ever sees the fixed code cannot be
 *    shown to be capable of failing, so the racy shape is run here and the suite
 *    asserts it produces a DIFFERENT row. If a future change reintroduced the
 *    race, these assertions fail.
 *
 * SKIPPED unless TEST_DATABASE_URL is set, so `npm test` stays green on a
 * machine with no PostgreSQL. Nothing here touches production data: the suite
 * creates its own schema, its own user and its own row, and drops the schema
 * afterwards.
 *
 * Run: TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/db \
 *      node --import tsx --test tests/watchHistoryConcurrency.test.ts
 *
 * WHAT THIS DOES NOT ESTABLISH. It runs two connections against one database.
 * That is the mechanism the defect is about, but it is not a deployment: how the
 * lock behaves with many simultaneous writers, under connection-pool exhaustion,
 * or with a writer that never commits is argued in the module's docstring and is
 * not measured here. And one case is deliberately NOT asserted as fixed — when
 * two observations of DIFFERENT slots are equally current, arrival order decides
 * which one wins. The lock removes the lost decision; it does not overrule the
 * tie-break, and the last test states that rather than hiding it.
 */

import assert from 'node:assert/strict';
import {after, before, beforeEach, describe, it} from 'node:test';

import {Pool} from 'pg';

import {progressionColumns} from '../lib/progressionGuard';
import {writeSignedInProgress, type SignedInWrite} from '../lib/watchHistoryWrite';

const CONNECTION = process.env.TEST_DATABASE_URL;

/**
 * Everything this suite creates lives in here and in nothing else.
 *
 * A dedicated schema rather than `public`: the SQL below uses unqualified table
 * names, so if an operator ever pointed TEST_DATABASE_URL at a database that
 * already had a `watch_history`, `CREATE TABLE IF NOT EXISTS` would silently
 * adopt the real table and the suite would then read and delete real rows. In its
 * own schema it cannot reach anything that was there before it.
 */
const SCHEMA = 'wh_concurrency';

const USER = {id: 4242, name: 'Concurrency Probe', email: 'concurrency-probe@example.invalid'};
const MEDIA_TYPE = 'tv';
const MEDIA_ID = 1429;

const DAY_MS = 24 * 60 * 60 * 1000;

describe(
  'watch-history write concurrency (real PostgreSQL)',
  {
    skip: CONNECTION
      ? false
      : 'TEST_DATABASE_URL is not set — this suite needs a real PostgreSQL and is skipped without one',
  },
  () => {
    let pool: Pool;
    let admin: Pool;

    before(async () => {
      // `admin` connects with the default search_path so it can create the
      // schema; `pool` is the one under test and resolves unqualified names
      // inside it.
      admin = new Pool({connectionString: CONNECTION});
      await admin.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
      await admin.query(`DROP TABLE IF EXISTS ${SCHEMA}.watch_history`);
      await admin.query(`DROP TABLE IF EXISTS ${SCHEMA}.users`);

      // The DDL below is the DEPLOYED shape: the base table from
      // scripts/init-new-db.ts, then the progression columns that
      // scripts/migrate-progression.ts adds.
      //
      // `"current_time"` is quoted because it is a RESERVED word in PostgreSQL
      // (`pg_get_keywords` catcode `R`). Unquoted, `ADD COLUMN … current_time
      // FLOAT` is a syntax error — measured on PostgreSQL 18.4 during this
      // audit, and the script's catch only tolerates `42701` (duplicate column),
      // so the run aborted on that column. The script now quotes it, and so does
      // this fixture; the finding is recorded in
      // docs/watch-history-audit-2026-09-22.md.
      await admin.query(`
        CREATE TABLE ${SCHEMA}.users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255),
          role VARCHAR(50) DEFAULT 'Membre',
          is_banned BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await admin.query(`
        CREATE TABLE ${SCHEMA}.watch_history (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES ${SCHEMA}.users(id) ON DELETE CASCADE,
          media_type VARCHAR(50) NOT NULL,
          media_id INTEGER NOT NULL,
          minutes_watched INTEGER DEFAULT 0,
          last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, media_type, media_id)
        );
      `);
      for (const [name, type] of [
        ['title', 'VARCHAR(500)'],
        ['poster_path', 'VARCHAR(500)'],
        // Quoted because `current_time` is a reserved word — see above.
        ['"current_time"', 'FLOAT'],
        ['total_duration', 'FLOAT'],
        ['season', 'INTEGER'],
        ['episode', 'INTEGER'],
      ]) {
        await admin.query(
          `ALTER TABLE ${SCHEMA}.watch_history ADD COLUMN IF NOT EXISTS ${name} ${type}`,
        );
      }

      pool = new Pool({
        connectionString: CONNECTION,
        options: `-c search_path=${SCHEMA}`,
      });

      await admin.query(
        `INSERT INTO ${SCHEMA}.users (id, name, email) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING`,
        [USER.id, USER.name, USER.email],
      );
    });

    after(async () => {
      await pool?.end();
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
        await admin.end();
      }
    });

    beforeEach(async () => {
      await pool.query('DELETE FROM watch_history WHERE user_id = $1', [USER.id]);
    });

    // ── helpers ────────────────────────────────────────────────────────────

    const readRow = async () => {
      const result = await pool.query(
        `SELECT "current_time", total_duration, season, episode, minutes_watched
         FROM watch_history WHERE user_id = $1 AND media_type = $2 AND media_id = $3`,
        [USER.id, MEDIA_TYPE, MEDIA_ID],
      );
      return result.rows[0] ?? null;
    };

    /**
     * The OLD write path's first statement: read the row, decide, HOLD the
     * decision. Byte-for-byte what `POST /api/watch-time` did before
     * lib/watchHistoryWrite.ts existed.
     *
     * Splitting it in two is what makes the race reproducible rather than
     * probabilistic. In production there is nothing between the two statements
     * and nothing serializes them, so "both reads land before either write" is an
     * interleaving that CAN happen; here it is an interleaving that is arranged,
     * so the assertions below cannot pass by luck.
     */
    const planLegacyWrite = async (write: SignedInWrite) => {
      let currentTime: number | null = null;
      let totalDuration: number | null = null;
      let season: number | null = null;
      let episode: number | null = null;

      if (write.progression) {
        const existing = await pool.query(
          `SELECT "current_time", total_duration, season, episode, last_updated
           FROM watch_history WHERE user_id = $1 AND media_type = $2 AND media_id = $3`,
          [write.userId, write.mediaType, write.mediaId],
        );
        const row = existing.rows[0];
        const raw = row?.last_updated;
        const ms =
          raw instanceof Date
            ? raw.getTime()
            : typeof raw === 'string'
              ? Date.parse(raw)
              : Number.NaN;

        const columns = progressionColumns(
          row
            ? {
                position: row.current_time === null ? null : Number(row.current_time),
                duration: row.total_duration === null ? null : Number(row.total_duration),
                season: row.season === null ? null : Number(row.season),
                episode: row.episode === null ? null : Number(row.episode),
                observedAt: Number.isFinite(ms) ? ms : null,
              }
            : undefined,
          write.progression,
        );

        currentTime = columns.currentTime;
        totalDuration = columns.totalDuration;
        season = columns.season;
        episode = columns.episode;
      }

      return {currentTime, totalDuration, season, episode};
    };

    /** The OLD write path's second statement, unchanged. */
    const applyLegacyWrite = async (
      write: SignedInWrite,
      plan: Awaited<ReturnType<typeof planLegacyWrite>>,
    ) => {
      await pool.query(
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
          plan.currentTime,
          plan.totalDuration,
          plan.season,
          plan.episode,
        ],
      );
    };

    /**
     * The two writers §7 names: one carrying a guest's month-old stored entry,
     * one carrying what the account is watching now. Different slots, different
     * positions, different observation times.
     */
    const staleGuestMerge = (observedAt: number): SignedInWrite => ({
      userId: USER.id,
      mediaType: MEDIA_TYPE,
      mediaId: MEDIA_ID,
      minutes: 1,
      progression: {position: 40, duration: 1439.2, season: 1, episode: 1, observedAt},
    });

    const currentPlay = (observedAt: number): SignedInWrite => ({
      userId: USER.id,
      mediaType: MEDIA_TYPE,
      mediaId: MEDIA_ID,
      minutes: 2,
      progression: {position: 1934, duration: 2830, season: 2, episode: 7, observedAt},
    });

    const at = (offsetMs: number) => Date.now() + offsetMs;

    const position = (row: Record<string, unknown>) => ({
      current_time: Number(row.current_time),
      season: Number(row.season),
      episode: Number(row.episode),
    });

    /** The row every arrival order has to agree on, or the order decided it. */
    const WATCHING_NOW = {current_time: 1934, season: 2, episode: 7};

    const clearRow = () => pool.query('DELETE FROM watch_history WHERE user_id = $1', [USER.id]);

    // ── the race, as it was ────────────────────────────────────────────────

    it('the pre-fix path lets a stale guest entry rewind the account, if it lands second', async () => {
      const now = at(0);
      const stale = at(-30 * DAY_MS);

      // Both reads taken before either write — the interleaving the missing
      // transaction allows.
      const currentPlan = await planLegacyWrite(currentPlay(now));
      const stalePlan = await planLegacyWrite(staleGuestMerge(stale));
      // The current play lands first, the month-old entry second.
      await applyLegacyWrite(currentPlay(now), currentPlan);
      await applyLegacyWrite(staleGuestMerge(stale), stalePlan);

      const row = await readRow();
      assert.ok(row, 'the write must have created a row');
      assert.equal(
        Number(row.current_time),
        40,
        'this is the defect: the account was rewound to S1E1 at 0:40 by a month-old entry',
      );
      assert.equal(Number(row.season), 1);
      assert.equal(Number(row.episode), 1);
    });

    it('the pre-fix path stores the OPPOSITE row when the same two writers land the other way round', async () => {
      const now = at(0);
      const stale = at(-30 * DAY_MS);

      const stalePlan = await planLegacyWrite(staleGuestMerge(stale));
      const currentPlan = await planLegacyWrite(currentPlay(now));
      await applyLegacyWrite(staleGuestMerge(stale), stalePlan);
      await applyLegacyWrite(currentPlay(now), currentPlan);

      const row = await readRow();
      assert.ok(row);
      // Not asserted as "correct" — asserted as DIFFERENT from the other order.
      // The same pair of writes produced two different rows and the only thing
      // that differed was which one landed last.
      assert.deepEqual(position(row), WATCHING_NOW);
    });

    // ── the race, as it is now ─────────────────────────────────────────────

    it('the shipped write stores the SAME row whichever writer arrives first', async () => {
      const now = at(0);

      // Order 1: the stale entry arrives first.
      await writeSignedInProgress(pool, staleGuestMerge(at(-30 * DAY_MS)));
      await writeSignedInProgress(pool, currentPlay(now));
      const staleFirst = await readRow();

      // Order 2: the current play arrives first.
      await clearRow();
      await writeSignedInProgress(pool, currentPlay(now));
      await writeSignedInProgress(pool, staleGuestMerge(at(-30 * DAY_MS)));
      const currentFirst = await readRow();

      assert.ok(staleFirst && currentFirst);
      assert.deepEqual(position(staleFirst), WATCHING_NOW);
      assert.deepEqual(position(currentFirst), WATCHING_NOW);
      assert.deepEqual(
        position(staleFirst),
        position(currentFirst),
        'the outcome must not depend on which writer arrived first',
      );
    });

    it('a newer position in the same slot survives an older one racing it', async () => {
      const now = at(0);
      const earlier = (observedAt: number): SignedInWrite => ({
        userId: USER.id,
        mediaType: MEDIA_TYPE,
        mediaId: MEDIA_ID,
        minutes: 1,
        progression: {position: 134, duration: 2830, season: 2, episode: 7, observedAt},
      });

      // Same slot, so this is purely the position rule: an older write must not
      // replace a newer one (§7's question, in its narrowest form).
      await writeSignedInProgress(pool, currentPlay(now));
      await writeSignedInProgress(pool, earlier(at(-10_000)));
      const row = await readRow();
      assert.ok(row);
      assert.equal(Number(row.current_time), 1934, 'the newer position must survive');

      // And the counter-example, for the same reason as above.
      await clearRow();
      const newerPlan = await planLegacyWrite(currentPlay(now));
      const olderPlan = await planLegacyWrite(earlier(at(-10_000)));
      await applyLegacyWrite(currentPlay(now), newerPlan);
      await applyLegacyWrite(earlier(at(-10_000)), olderPlan);
      const legacy = await readRow();
      assert.ok(legacy);
      assert.equal(Number(legacy.current_time), 134, 'the pre-fix path replaced the newer position');
    });

    /**
     * Genuine concurrency, un-arranged: two connections, no ordering imposed.
     *
     * Stated plainly because it decides how much this proves: without a lock two
     * `Promise.all` writes may or may not interleave, so this asserts an
     * invariant that must hold under EVERY interleaving rather than one that only
     * holds under a particular one. The deterministic orders above are the
     * load-bearing assertions; this one is here so the suite also exercises the
     * real concurrency the lock exists for.
     */
    it('holds under unordered concurrency as well', async () => {
      const now = at(0);
      await Promise.all([
        writeSignedInProgress(pool, staleGuestMerge(at(-30 * DAY_MS))),
        writeSignedInProgress(pool, currentPlay(now)),
      ]);

      const row = await readRow();
      assert.ok(row);
      assert.deepEqual(position(row), WATCHING_NOW);
    });

    it('the lock changes nothing about how watch time is added', async () => {
      // The minutes half was already atomic (`minutes_watched + $4`), and the
      // transaction must not turn two increments into one: 1 + 2 = 3.
      await Promise.all([
        writeSignedInProgress(pool, staleGuestMerge(at(-30 * DAY_MS))),
        writeSignedInProgress(pool, currentPlay(at(0))),
      ]);

      const row = await readRow();
      assert.ok(row);
      assert.equal(Number(row.minutes_watched), 3);
    });

    it('a write that carries no progression leaves the stored position alone', async () => {
      // WatchTimer's minute tick: it knows nothing about the position and must
      // not erase one. This is the R3-F2 shape, checked here because the
      // transaction is new code on the same path.
      await writeSignedInProgress(pool, currentPlay(at(0)));
      await writeSignedInProgress(pool, {
        userId: USER.id,
        mediaType: MEDIA_TYPE,
        mediaId: MEDIA_ID,
        minutes: 5,
        progression: null,
      });

      const row = await readRow();
      assert.ok(row);
      assert.equal(Number(row.current_time), 1934);
      assert.equal(Number(row.season), 2);
      assert.equal(Number(row.episode), 7);
      assert.equal(Number(row.minutes_watched), 2 + 5);
    });

    /**
     * The limit, pinned rather than papered over.
     *
     * Two observations of DIFFERENT slots that are equally current both carry a
     * measured position and both pass the ordering test, so the guard has no
     * grounds to prefer either and the second arrival wins. That is a real
     * order-dependence and the lock does not remove it — the lock's job is to
     * stop a decision being taken against a stale row, not to invent a rule where
     * the rule itself says "either". What is asserted is the property that
     * matters regardless: the row is always ONE WHOLE observation, never a
     * position from one and a slot from the other.
     */
    it('never stores a row that mixes two observations', async () => {
      const now = at(0);
      const otherSlot = (observedAt: number): SignedInWrite => ({
        userId: USER.id,
        mediaType: MEDIA_TYPE,
        mediaId: MEDIA_ID,
        minutes: 0,
        progression: {position: 40, duration: 1439.2, season: 1, episode: 1, observedAt},
      });

      await Promise.all([
        writeSignedInProgress(pool, otherSlot(now)),
        writeSignedInProgress(pool, currentPlay(now)),
      ]);

      const row = await readRow();
      assert.ok(row);
      const stored = position(row);
      const isWholeObservation =
        (stored.current_time === 40 && stored.season === 1 && stored.episode === 1) ||
        (stored.current_time === 1934 && stored.season === 2 && stored.episode === 7);
      assert.ok(
        isWholeObservation,
        `the row must be one whole observation, got ${JSON.stringify(stored)}`,
      );
    });
  },
);
