/**
 * The per-episode store, and the schema that has to exist for it to be written.
 *
 * WHY THIS FILE EXISTS AT ALL. `watch_history` has
 * `UNIQUE(user_id, media_type, media_id)` — ONE ROW PER TITLE. So a series could
 * remember S2E7 at 32:14 and could not also remember S1E4 at 05:00: the second
 * observation overwrote the first one's slot and timecode, and §7's requirement
 * ("plusieurs épisodes d'une même série conservés séparément") was simply not
 * satisfiable by that table. The second store is the answer, and this file pins
 * the property §11 asks for directly — two episodes of one series, each keeping
 * its own position, neither one clobbering the other.
 *
 * The second half pins the MIGRATION as source text, because the alternative is
 * to pin nothing: `TEST_DATABASE_URL` is unset in this environment, so any test
 * that applied the statements would report SKIPPED rather than passed, and a
 * skipped test is not evidence. Source assertions are weaker than execution and
 * they are stated as such here — what they can prove is that the statements are
 * additive and cannot destroy a row, which is the property §15 asks about and
 * the one a reviewer cannot check by reading 200 lines of SQL.
 *
 * `"current_time"` IS QUOTED IN EVERY STATEMENT, and it is pinned because the
 * unquoted form is not a cosmetic mistake: `CURRENT_TIME` is a RESERVED word in
 * PostgreSQL, so as a column definition it is `42601` — and in a SELECT list it
 * SILENTLY evaluates to the server's time of day. Both halves are recorded in
 * docs/watch-history-audit-2026-09-22.md.
 */

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';

import {
  MAX_EPISODES_PER_TITLE,
  asEpisodeEntry,
  capPerTitle,
  episodeKeyOf,
  episodeSlotOf,
  findEpisodeEntry,
  otherStartedEpisodes,
  upsertEpisodeEntry,
  type EpisodeEntry,
} from '../lib/episodeHistory';
import {
  ADD_PROGRESSION_COLUMNS,
  BACKFILL_EPISODES,
  CREATE_EPISODES_TABLE,
  MIGRATION,
} from '../scripts/migrate-watch-history-episodes';

/** An entry with everything a per-episode record needs, overridable per case. */
const entry = (over: Partial<EpisodeEntry> & {season: number; episode: number}): EpisodeEntry => ({
  id: '1399',
  type: 'tv',
  title: 'A Series',
  poster_path: '/poster.jpg',
  provider: 'vidlink',
  last_watched: 1_700_000_000_000,
  ...over,
});

describe('two episodes of one series are two records, not one', () => {
  it('keeps S2E7 at 32:14 and S1E4 at 05:00 at the same time', () => {
    // The §11 scenario, in order, with a re-read of the first episode in the
    // middle — because the defect was never "the second write is lost", it was
    // "the first write is overwritten and then cannot be recovered".
    let store: EpisodeEntry[] = [];

    store = upsertEpisodeEntry(store, entry({season: 2, episode: 7, timestamp: 1934, last_watched: 1_700_000_000_000}));
    store = upsertEpisodeEntry(store, entry({season: 1, episode: 4, timestamp: 300, last_watched: 1_700_000_100_000}));

    assert.equal(store.length, 2, 'watching a second episode must not replace the first');

    const first = findEpisodeEntry(store, 'tv', '1399', 1, 4);
    const second = findEpisodeEntry(store, 'tv', '1399', 2, 7);
    assert.equal(first?.timestamp, 300, 'S1E4 keeps its own position');
    assert.equal(second?.timestamp, 1934, 'S2E7 keeps its own position');

    // A later observation of S2E7, as the player's periodic save would produce.
    store = upsertEpisodeEntry(store, entry({season: 2, episode: 7, timestamp: 1950, last_watched: 1_700_000_200_000}));

    assert.equal(findEpisodeEntry(store, 'tv', '1399', 1, 4)?.timestamp, 300, 'S1E4 is untouched by an S2E7 write');
    assert.equal(findEpisodeEntry(store, 'tv', '1399', 2, 7)?.timestamp, 1950, 'S2E7 moved forward');

    // And the other direction, which is the one a "one slot per title" model
    // cannot survive: an observation of the EARLIER episode after the later one.
    store = upsertEpisodeEntry(store, entry({season: 1, episode: 4, timestamp: 360, last_watched: 1_700_000_300_000}));
    assert.equal(findEpisodeEntry(store, 'tv', '1399', 1, 4)?.timestamp, 360);
    assert.equal(findEpisodeEntry(store, 'tv', '1399', 2, 7)?.timestamp, 1950, 'S2E7 is still 32:30');
  });

  it('keys a slot on BOTH numbers, which is the whole point', () => {
    assert.notEqual(
      episodeKeyOf({type: 'tv', id: '1399', season: 1, episode: 1}),
      episodeKeyOf({type: 'tv', id: '1399', season: 2, episode: 7}),
    );
    // …and on the title, so two series cannot share a slot record.
    assert.notEqual(
      episodeKeyOf({type: 'tv', id: '1399', season: 1, episode: 1}),
      episodeKeyOf({type: 'tv', id: '1400', season: 1, episode: 1}),
    );
  });

  it('refuses a rewind inside one episode, because a rewind is not an observation', () => {
    // The same rule the parent row and the server apply: an older position in
    // the same slot does not displace a newer one, so a stale guest record
    // arriving late cannot rewind an episode the viewer has moved past (§9).
    let store: EpisodeEntry[] = [];
    store = upsertEpisodeEntry(store, entry({season: 1, episode: 4, timestamp: 900, last_watched: 1_700_000_100_000}));
    store = upsertEpisodeEntry(store, entry({season: 1, episode: 4, timestamp: 120, last_watched: 1_700_000_000_000}));
    assert.equal(findEpisodeEntry(store, 'tv', '1399', 1, 4)?.timestamp, 900);
  });

  it('does not let an observation that measured nothing displace a measured one', () => {
    let store: EpisodeEntry[] = [];
    store = upsertEpisodeEntry(store, entry({season: 1, episode: 4, timestamp: 900, last_watched: 1_700_000_100_000}));
    store = upsertEpisodeEntry(store, entry({season: 1, episode: 4, timestamp: undefined, last_watched: 1_700_000_200_000}));
    assert.equal(
      findEpisodeEntry(store, 'tv', '1399', 1, 4)?.timestamp,
      900,
      'opening an episode is not watching it (§13)',
    );
  });
});

describe('a slot is a slot only when it is real', () => {
  it('treats season 0 as TMDB SPECIALS and not as "no season"', () => {
    assert.deepEqual(episodeSlotOf({type: 'tv', season: 0, episode: 3}), {season: 0, episode: 3});
    // …and a zero season is distinguishable from a missing one, which is what
    // `||` in place of `??` used to destroy.
    assert.notDeepEqual(episodeSlotOf({type: 'tv', season: 0, episode: 3}), episodeSlotOf({type: 'tv', season: 1, episode: 3}));
  });

  it('produces no episode record for a film', () => {
    assert.equal(episodeSlotOf({type: 'movie', season: 1, episode: 1}), null);
    assert.equal(asEpisodeEntry(entry({type: 'movie' as unknown as 'tv', season: 1, episode: 1})), null);
  });

  it('refuses a fractional or negative slot before it reaches an INTEGER column', () => {
    // The database columns are INTEGER: a fractional parameter is `22P02` and
    // would abort the enclosing transaction, taking the PARENT row's write with
    // it. Refusing here means the slot is simply not recorded.
    assert.equal(episodeSlotOf({type: 'tv', season: 1.5, episode: 3}), null);
    assert.equal(episodeSlotOf({type: 'tv', season: 1, episode: 3.25}), null);
    assert.equal(episodeSlotOf({type: 'tv', season: -1, episode: 3}), null);
    assert.equal(episodeSlotOf({type: 'tv', season: 1, episode: -3}), null);
    assert.equal(episodeSlotOf({type: 'tv', season: '1', episode: 3}), null);
    assert.equal(episodeSlotOf({type: 'tv', season: 1}), null);
  });
});

describe('the store is bounded without dropping the episodes a viewer is working through', () => {
  it('trims the LEAST recent when one title fills its cap', () => {
    // Written through `upsertEpisodeEntry` and not `capPerTitle`, because the
    // ORDER is the caller's responsibility: `capPerTitle` trims the tail of the
    // array it is handed, and only `upsertEpisodeEntry` sorts
    // most-recently-observed first before calling it. Handing `capPerTitle` an
    // ascending list and expecting the newest kept would be testing a contract it
    // never made — and the production order is the one that matters, so that is
    // the one pinned here.
    let store: EpisodeEntry[] = [];
    for (let index = 0; index < MAX_EPISODES_PER_TITLE + 5; index += 1) {
      store = upsertEpisodeEntry(
        store,
        entry({season: 1, episode: index + 1, last_watched: 1_700_000_000_000 + index}),
      );
    }

    assert.equal(store.length, MAX_EPISODES_PER_TITLE);
    assert.ok(
      store.some((row) => row.episode === MAX_EPISODES_PER_TITLE + 5),
      'the most recently watched episode must survive',
    );
    assert.ok(!store.some((row) => row.episode === 1), 'the least recent is the one trimmed');
  });

  it('keeps the head of the list it is given, which is the contract it does make', () => {
    const rows: EpisodeEntry[] = Array.from({length: MAX_EPISODES_PER_TITLE + 3}, (_, index) =>
      entry({season: 1, episode: index + 1, last_watched: 1_700_000_000_000 - index}),
    );
    const capped = capPerTitle(rows, 'tv', '1399');
    assert.equal(capped.length, MAX_EPISODES_PER_TITLE);
    assert.deepEqual(
      capped.map((row) => row.episode),
      Array.from({length: MAX_EPISODES_PER_TITLE}, (_, index) => index + 1),
    );
  });

  it('leaves other titles alone when one title is capped', () => {
    const rows: EpisodeEntry[] = [
      ...Array.from({length: MAX_EPISODES_PER_TITLE + 2}, (_, index) =>
        entry({season: 1, episode: index + 1, id: '1399', last_watched: 1_700_000_000_000 + index}),
      ),
      entry({season: 1, episode: 1, id: '1400', last_watched: 1_600_000_000_000}),
    ];
    const capped = capPerTitle(rows, 'tv', '1399');
    assert.ok(capped.some((row) => row.id === '1400'), 'another series is not collateral');
  });
});

describe('the strip excludes the episode the player is already on', () => {
  it('returns the other started episodes, most recent first', () => {
    const rows: EpisodeEntry[] = [
      entry({season: 1, episode: 4, timestamp: 300, last_watched: 1_700_000_100_000}),
      entry({season: 2, episode: 7, timestamp: 1934, last_watched: 1_700_000_200_000}),
    ];
    const others = otherStartedEpisodes(rows, {type: 'tv', id: '1399', season: 2, episode: 7});
    assert.deepEqual(others.map((row) => `${row.season}:${row.episode}`), ['1:4']);
  });

  it('excludes it by SLOT and not by position, so a rewatch still hides the current episode', () => {
    const rows: EpisodeEntry[] = [entry({season: 2, episode: 7, timestamp: 1, last_watched: 1_700_000_200_000})];
    assert.equal(otherStartedEpisodes(rows, {type: 'tv', id: '1399', season: 2, episode: 7}).length, 0);
  });

  it('shows everything when the page names no slot', () => {
    const rows: EpisodeEntry[] = [
      entry({season: 1, episode: 4, last_watched: 1_700_000_100_000}),
      entry({season: 2, episode: 7, last_watched: 1_700_000_200_000}),
    ];
    assert.equal(otherStartedEpisodes(rows, {type: 'tv', id: '1399'}).length, 2);
  });
});

describe('the migration is additive, and the source says so', () => {
  const migrationSource = readFileSync(
    path.join(process.cwd(), 'scripts', 'migrate-watch-history-episodes.ts'),
    'utf8',
  );

  it('contains no statement that can destroy a row', () => {
    // The only statement this migration makes that touches data is an INSERT.
    // A DROP, TRUNCATE, `DELETE FROM` or `UPDATE … SET` would be a change to
    // existing rows, and §15's contract for this script is "adds columns and a
    // table and touches no existing row".
    //
    // `ON DELETE CASCADE` is excluded, and it is not an oversight: it is a
    // REFERENTIAL ACTION on a foreign key — it says what happens to this table's
    // rows when a USER row is deleted, at some future point and by someone else's
    // statement. It deletes nothing here, and it is exactly what §15 wants (an
    // account's episodes must not outlive the account).
    for (const statement of MIGRATION) {
      const body = statement.sql.replace(/ON DELETE CASCADE/gi, '').toUpperCase();
      assert.doesNotMatch(
        body,
        /\b(DROP|TRUNCATE)\b|\bDELETE\s+FROM\b|\bUPDATE\s+\w+\s+SET\b/,
        `${statement.label} must not destroy or rewrite a row`,
      );
    }
    assert.doesNotMatch(migrationSource, /DROP\s+TABLE\s+watch_history\b/i);
    assert.doesNotMatch(migrationSource, /DELETE\s+FROM\s+watch_history\b/i);
  });

  it('is idempotent: every statement is IF NOT EXISTS, or an ON CONFLICT DO NOTHING', () => {
    for (const statement of MIGRATION) {
      // `[\s\S]*` and not `.*` with the `s` flag: this project targets ES2017,
      // where `dotAll` does not exist.
      assert.match(
        statement.sql,
        /IF NOT EXISTS|ON CONFLICT [\s\S]* DO NOTHING/,
        `${statement.label} must be safe to run twice`,
      );
    }
  });

  it('creates the child table under the key the writers upsert against', () => {
    const create = CREATE_EPISODES_TABLE.map((statement) => statement.sql).join('\n');
    assert.match(create, /UNIQUE \(user_id, media_type, media_id, season, episode\)/);
    // ON DELETE CASCADE, so deleting an account cannot leave its episodes behind.
    assert.match(create, /REFERENCES users\(id\) ON DELETE CASCADE/);
  });

  it('quotes every occurrence of current_time, in the migration and in the writers', () => {
    for (const statement of [...ADD_PROGRESSION_COLUMNS, ...CREATE_EPISODES_TABLE, ...BACKFILL_EPISODES]) {
      // `"current_time"` is fine; a bare `current_time` is not. Lookbehind is
      // avoided deliberately — it needs an ES2018 target and this project is on
      // ES2017 — so the same property is stated by removing the quoted form and
      // asserting that no unquoted one remains. The `\b` on both sides is what
      // keeps `CURRENT_TIMESTAMP`, a different and entirely legitimate identifier
      // used by the DEFAULT clauses, out of the match.
      assert.doesNotMatch(
        statement.sql.split('"current_time"').join(''),
        /\bcurrent_time\b/i,
        `${statement.label} must quote the reserved identifier`,
      );
    }
  });

  it('derives `completed` from the guard\'s ratio rather than a literal', () => {
    // Asserted on the SOURCE, not on the exported statements: `COMPLETION_RATIO`
    // is interpolated into the template, so `statement.sql` necessarily contains
    // the number — that is the mechanism working. What must not exist is a
    // literal in the script, which is the form that drifts away from the ratio
    // the browser and the server actually apply.
    assert.match(migrationSource, /COMPLETION_RATIO/);
    assert.doesNotMatch(migrationSource, /0\.95/);
  });

  it('backfills only rows that name a slot', () => {
    const backfill = BACKFILL_EPISODES.map((statement) => statement.sql).join('\n');
    assert.match(backfill, /media_type = 'tv'/);
    assert.match(backfill, /season IS NOT NULL/);
    assert.match(backfill, /episode IS NOT NULL/);
  });
});

describe('the signed-in writer files an episode row without risking the parent row', () => {
  const writerSource = readFileSync(
    path.join(process.cwd(), 'lib', 'watchHistoryWrite.ts'),
    'utf8',
  );

  it('writes the child row inside the SAME transaction, before COMMIT', () => {
    const childInsert = writerSource.indexOf('INSERT INTO watch_history_episodes');
    const commit = writerSource.indexOf("await client.query('COMMIT')");
    assert.ok(childInsert > -1, 'the child write must exist');
    assert.ok(commit > childInsert, 'the child write must not open its own transaction');
  });

  it('is guarded, so a database without the table writes the parent row as before', () => {
    assert.match(writerSource, /to_regclass\('public\.watch_history_episodes'\)/);
    // Only a POSITIVE answer may be cached: a cached "no" would make the feature
    // permanently absent in a process that outlives the migration.
    assert.match(writerSource, /if \(episodesTablePresent\) return true;/);
    assert.doesNotMatch(writerSource, /if \(!episodesTablePresent\) return false;/);
  });

  it('judges an episode write against that EPISODE\'s row, never the parent\'s', () => {
    // Reading the parent row would compare S1E4 against S2E7's position and read
    // a lower episode number as a rewind, refusing a genuinely new episode.
    assert.match(writerSource, /readStoredEpisode/);
    assert.match(writerSource, /FROM watch_history_episodes[\s\S]*?season = \$4 AND episode = \$5/);
  });

  it('takes the caller\'s slot and not the guard winner\'s', () => {
    assert.match(writerSource, /const slot = slotOf\(incoming\.season, incoming\.episode\)/);
  });

  it('requires a measured position, so a visit is not recorded as playback', () => {
    assert.match(writerSource, /slot !== null && incoming\.position !== null/);
  });
});
