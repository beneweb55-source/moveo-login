# Watch history audit — 2026-09-22

This file records the watch-history half of the audit brief: what was found, what was
changed, and — separately — what was **not** changed and why. It follows the rule
`docs/player-validation-2026-09-21.md` sets for itself: **a claim is recorded only when
something was observed**, and a fix is recorded as a fix only after the suite that pins it
runs.

Findings are labelled with the identifiers used while working: `F1`–`F6` for the history
defects, `R3-*` for the regressions introduced and found in this same diff.

**State at time of writing:** 334 tests / 70 suites / 0 failures. `tsc --noEmit` clean,
`npm run build` succeeds. `eslint .` reports 2 errors, 0 warnings — both pre-existing
`react-hooks/set-state-in-effect` errors in `components/VideoPlayer.tsx`, in code this work
does not touch. Those 334 are what `npm test` runs on any machine;
`tests/watchHistoryConcurrency.test.ts` adds 8 more and is **skipped** unless
`TEST_DATABASE_URL` is set, so it is not in that number — run it with a PostgreSQL available
and it is 8/8 green (§5.2).

**Claims below are marked with what they rest on:** a unit-test result, a source-level fact, a
measurement taken in a real browser on production, or a measurement taken against a real
PostgreSQL. §5.2, §5.3 and §5.5 are the sections whose central findings are measured; §7
lists what none of them establishes, and §8 is the security re-pass over the diff that shipped.

---

## 1. The defect that started it: a watch position going backwards

Measured on VidLink: when its player mounts it emits its progress envelope with
`watched: 0`, and the real position only appears as playback advances. Taking the newest
value blindly therefore **reset a position to zero on every page load** — a viewer at 21
minutes was returned to the start.

The no-regression rule that answers this already existed in `lib/progressionGuard.ts`, and
`utils/historyManager.ts` (browser) and `app/api/watch-time/route.ts` (server) both called
it. The module's docstring claimed the two could not drift apart.

## 2. F4 / R3-F2 — they already had drifted, and the guarantee was false

**The claim was false.** The guard owned the *position* rule but not the question of which
of two **different episodes** was current. The browser answered that itself, by comparing
`last_watched`; the server took the incoming value unconditionally. So the one rule §9 is
about — "a merge must never arbitrarily overwrite a correct progression" — was enforced in
two places by two different rules, which is not enforcement.

**What that cost.** A guest's stored history is merged into the account at sign-in. The
merge replays each entry through the ordinary write path, and the server's rule let the
entry's slot win regardless of age. A month-old "S1E1 at 0:40" therefore rewound an account
that had since reached "S2E7 at 32:14" — the exact case §9 names.

**A second face of the same defect, in the same route.** The winner of the guard gated only
the position columns. `season` and `episode` were written from the **raw request body**
(`COALESCE($9, watch_history.season)`), so a *refused* observation still moved the slot.
The row was then left contradicting itself: the newer position under the older episode's
number, or "S2E7 · 32:14". No test could reach this, because the decision lived inside a
route wrapped in a database call.

**And a third, which is `R3-F2`.** A click on an episode in a list writes an entry with no
position (§13: opening something is not watching it). The route answered that by **NULLing
the stored position** — so a viewer at 32:14 who glanced at the next episode came back to
"no position to resume". This one is a regression introduced in this same diff, found by
review of the diff and confirmed by `git diff` showing the tv-page write effect as new.

### 2.1 The fix, and why it is in the guard

Ordering now lives in the guard, next to the position rule, so there is one rule again:

- `ProgressionFields.observedAt` — when the observation was made. **Maps to no database
  column.** In the browser it is the two entries' own `last_watched`; on the server it is
  the client's `last_watched` against `watch_history.last_updated`.
- It orders observations of **different slots only**. Within one slot a later observation is
  still not a reason to rewind — that is the measured VidLink rule and it is unchanged.
- A **slot moves only together with a measured position.** An observation that measured
  nothing never displaces one that did.

The persistence step was then extracted as `progressionColumns`, returning position and slot
**in one value** so that a caller cannot write one without the other. That is what makes the
contradiction unrepresentable rather than merely fixed, and it is what makes the behaviour
testable at all: `tests/progressionGuard.test.ts` now pins "writes nothing when the stored
observation wins", "writes the position and the slot together when the incoming one wins",
and an invariant test asserting the two observations are never mixed.

The route's `clearProgression` branch is **deleted**, not disabled. It fired when the stored
observation won a slot change — the one case where the position it was about to erase was
the only correct record in the row. The situation it was written for cannot arise now,
because a slot moves only with a position.

## 3. F1 / F2 / F3 — the guest → account merge, `components/GuestHistorySync.tsx`

**F1: the merge could not run where sign-in happens.** The component probed `/api/auth/me`
at most once per tab and recorded the attempt in `sessionStorage` **before** the answer was
known. That flag survived reloads and client-side navigation, and the component is mounted
by the layout, so signing in on a page never remounted it. The merge therefore could not run
in the tab where the sign-in occurred — the only scenario §9 is about — and took effect only
for a new tab or a full reload.

The replacement is a probe on mount and on every **pathname change**. This was validated
against the real login path rather than assumed: `app/login/page.tsx:89` does
`router.push('/')`, a genuine pathname change, so the probe fires at the moment of sign-in
in the same tab.

**Cost, stated rather than hidden:** a guest with local history spends one lightweight
`GET /api/auth/me` per navigation — a cookie read that answers 401 for a visitor with no
session. Two guards bound it: no local history means no request at all, and a signed-in
visitor asks once per page load. §9 ("do not lose their history") outranks the constant, and
§14's concern is a request per second or per frame, not one per navigation.

**F2: the write path stayed latched off.** A guest's first 401 latches server sync off. The
latch was cleared only on sign-out, so the session in which the account was created could
not write: every later observation went to localStorage alone while the server row stayed
behind. The latch is now cleared as soon as `/api/auth/me` proves a session, and not inside
the merge — the merge is skipped once the per-account marker exists, so a reset placed there
would not run on the second visit.

**F3: a partial merge was permanent.** The merge fired un-awaited writes and returned
synchronously, so the marker was written before the writes resolved; entries that failed
were never retried. `pushLocalHistoryToAccount` is now sequential and awaited, returning
`{total, allSynced}`, and the marker is written **only** when `allSynced`. Sequential
rather than `Promise.all` also removes this caller's contribution to concurrent
read-modify-write on the same row: the route reads the row before it writes it, and twenty
of those pairs at once invite interleaving.

## 4. R3-F3 — a season response outliving its season

`app/tv/[id]/page.tsx` fetched a season's episodes with no cancellation. Changing season
starts a second request while the first is in flight, and the response cannot tell which
season is on screen when it lands. Whichever resolved last won: the abandoned season's
episode list was written under the new season's heading, its count replaced the new season's,
and the clamp that keeps the player off a non-existent episode ran against a list the viewer
was not on. Nothing about that failure is visible in the UI.

Fixed with the standard cancellation flag, checked before any state is written — and the
`finally` deliberately does **not** clear the loading flag when cancelled, because a newer
request is in flight and owns it.

## 5. Findings recorded during this work — what was fixed and what was not

Each entry below is a real finding with a real remedy. Three of the six were left
unchanged and the reason is in the entry rather than left to the reader; the other three
were waiting on a measurement that was then taken, and are fixed — `R3-F1` (§5.3), `F6`
(§5.2) and the reserved-word defect the concurrency work uncovered (§5.5). What is still
NOT proven about each fix is stated next to it rather than collected at the end, because a
fix recorded without its limits is the kind of claim this document exists to avoid.

### 5.1 F5 — the `isComplete` escape hatch is unreachable through any measured path

`resolveProgression` lets a stored position rewind when the stored position was already
complete (a rewatch). The concern was that an episode's *mount* envelope could read as
"complete" and let a position rewind. It cannot, on the measured evidence: the media-level
`progress` field (`{watched: 0, duration: 1439.2}`) is one `readMediaData` deliberately
ignores for series; the per-episode slot that series actually use tracks real progress
(`show_progress.s1e1.progress.watched = 21.206035`). **Changing it would break the rewatch
allowance, which is deliberate.** Recorded, not changed.

### 5.2 F6 — no transaction and no row lock in the write path. MEASURED, THEN FIXED

**Was.** `POST /api/watch-time` did SELECT-then-UPSERT with no transaction and no
`FOR UPDATE`, so two writers — a player in one tab, a merge in another — could each decide
against a row the other had already replaced, and the final state was decided by which
request happened to land last rather than by the no-regression rule.

**The measurement §7 asked for was taken, against a real PostgreSQL.** No `DATABASE_URL` is
available to this session, so one was built: `embedded-postgres` installed with `--no-save`
(so `package.json` is untouched) and booted as **PostgreSQL 18.4, port 55432**, with
`tests/watchHistoryConcurrency.test.ts` running the real SQL against it. The suite is skipped
unless `TEST_DATABASE_URL` is set, so `npm test` stays green everywhere else, and it creates
its own schema and its own probe user and drops them afterwards — no production data is
reached (§24).

**The race reproduces, deterministically.** The suite keeps the pre-fix write as
`planLegacyWrite` / `applyLegacyWrite` — the two statements split at the seam the race lives
on — and runs the same pair of writers in both arrival orders:

- current play (S2E7 at 1934 s) first, month-old guest entry (S1E1 at 0:40) second →
  the account ends at **S1E1 · 0:40**;
- the same two writers the other way round → **S2E7 · 1934 s**.

Two different rows from the same pair of writes, differing only in which landed last. The
first of those is §9's named case. Keeping the racy path in the suite is deliberate: an
assertion that has only ever seen the fixed code cannot be shown to be capable of failing.

**The fix.** The signed-in write is now `writeSignedInProgress` in `lib/watchHistoryWrite.ts`:
`BEGIN` → `pg_advisory_xact_lock(hashtext(user:type:id))` → the stored-row SELECT →
`progressionColumns` → the same `INSERT … ON CONFLICT … DO UPDATE` → `COMMIT`, with `ROLLBACK`
on error and `client.release()` in `finally`. `app/api/watch-time/route.ts` calls it; nothing
else about the route changed.

**Why the lock and not `FOR UPDATE`.** `SELECT … FOR UPDATE` cannot lock a row that does not
exist yet, and the first write of a title is exactly where the decision is lost. `ON CONFLICT`
alone does not help either: by the time it arbitrates, both writers have already chosen their
values from a stale read. So the lock is taken **before** the SELECT, and the second writer's
read then sees the first writer's committed row and applies the rule to it.

**Result, measured:** both arrival orders now produce the same row — `S2E7 · 1934 s` — and the
unordered, genuinely concurrent `Promise.all` case produces it too. The same-slot case is
order-independent as well (a newer 1934 s position survives an older 134 s one, where the
pre-fix path stored 134). Watch-time addition is unaffected (1 + 2 = 3 across a concurrent
pair), and a write carrying no progression still leaves the stored position alone (the R3-F2
shape, re-checked because the transaction is new code on the same path).

**Stated trade-off.** `pg_advisory_xact_lock` waits indefinitely; a writer that hangs inside
the transaction blocks writes for the SAME title until its connection dies. The alternative,
`pg_try_advisory_xact_lock` with a retry budget, would trade that for dropped progress
updates, which is the wrong direction. Each transaction takes exactly one lock, so no
lock-ordering deadlock is possible, and writers are serialized per title rather than globally.

**Availability, re-examined afterwards (§17).** One property of this fix is new in kind, so it
is stated with its numbers rather than left to the docstring. The write now holds a **pooled
client** for the length of its transaction and waits on a lock inside it. `lib/db.ts` sets no
`max`, no `connectionTimeoutMillis` and no `statement_timeout`, so `pg`'s defaults apply — ten
clients, and a request for an eleventh waits for one indefinitely. What keeps the exposure
small: the transaction is two short statements on a single row, the lock is per title rather
than global, each transaction takes exactly one lock, and `client.release()` is in a `finally`.
The residual risk is the one the old two-statement write could not have had — a transaction
that **hangs** holds a client *and* that title's lock until its connection dies, and ten such
hangs on ten distinct titles would starve every other database call in the application, which
shares this pool. No `lock_timeout` was added: bounding the wait converts a hang into a failed
write (500, position dropped) and nothing here measures which of the two is better. The choice
is recorded rather than made silently.

**What is NOT proven about this fix.**

- **Two connections is not a deployment.** Pool exhaustion, a writer that never commits, and
  behaviour under many simultaneous writers are argued in the module's docstring and are not
  measured.
- **One case stays order-dependent on purpose.** Two observations of DIFFERENT slots that are
  equally current both carry a measured position and both pass the ordering test, so the guard
  has no grounds to prefer either and the second arrival wins. The lock removes the *lost
  decision*; it does not invent a rule where the rule says "either". The suite pins the
  property that does hold regardless — the stored row is always ONE WHOLE observation, never a
  position from one and a slot from the other.
- **The lock never ran in production**, because the statement it wraps could not execute at
  all. See §5.5.

### 5.3 R3-F1 — a mount envelope was treated as evidence of playback. MEASURED, THEN FIXED

**Was.** `lib/playerMessages.ts` recognised three shapes: `event === "timeupdate"`,
`type === "timeupdate"` (both **live events**), and `type === "MEDIA_DATA"` (**the provider's
stored snapshot**, including at mount). `components/VideoPlayer.tsx` marked playback observed
on **any** verified position, so a mount envelope — the provider's remembered position —
marked the signal before anything had played, and `WatchTimer` accrued minutes on a page where
the viewer never pressed play.

**The measurement it was waiting for was taken, on production, in a real Chrome.**

1. **No `timeupdate` ever arrives.** Across 25 messages from VidLink on
   `https://www.moveo.blog/movie/969681`, every shape enumerated, in every state reachable:
   `{"type":"sr"}`-family payloads, one `{"data":{"type":"initToParent",…}}`, and `MEDIA_DATA`.
   **Neither `event === "timeupdate"` nor `type === "timeupdate"` was ever sent.** This matches
   the repo's own record (no `timeupdate` in `docs/`) and settles the question the previous
   version of this entry left open. The proposed remedy — gate playback on a live event — was
   therefore **not shipped**, because on this evidence it would have made watch time
   permanently zero for the only provider that reports a position at all.
2. **The snapshot is a repeating memory.** Ten consecutive `MEDIA_DATA` envelopes for the
   mounted title arrived at gaps of 1996–2003 ms, each carrying
   `{watched: 0, duration: 8678}` — the provider's stored state, re-sent on a timer, with
   nothing playing.
3. **The write is caused by the mount envelope, demonstrated rather than deduced.**
   `localStorage.watch_history` was cleared to `null` (verified in the same call), the VidLink
   source was selected, and **no other interaction was made**. The entry came back:
   `{"id":"969681","type":"movie","title":"Spider-Man : Brand New Day","provider":"VidLink",
   "timestamp":0,"duration":8678,"completed":false}`. Nothing played; the position is `0` — the
   §4-forbidden "0:00 because a screen was opened". The same block then calls
   `markPlaybackObserved`, so the watch-time signal started on the same evidence. The entry is
   also **rewritten roughly every five seconds** while the page stays open, which is why it
   survived an earlier manual deletion.

4. **The mount write happens on the MOVIE branch and not the SERIES branch, and the reason
   is the asymmetry, not the zero.** Measured the same day on `/tv/1429` S1E1 with VidLink
   mounted: four consecutive envelopes each carried `show_progress.s1e1.progress = {watched:
   0, duration: 0}` and the media-level `progress = {watched: 0, duration: 1439.2}`. The
   per-episode `duration: 0` is rejected by the existing `duration > 0` check, so **the series
   page stored nothing** — verified by reading `localStorage.watch_history` across a 12 s
   window with the frame mounted (`same: true`). The movie branch reads the media-level
   `progress`, which carries a **real runtime**, so its zero position survives every check and
   is written. That is the precise shape of the defect: not "a zero is read", but "a branch
   that reads a field carrying a real runtime will accept a stored zero".

**The fix: SNAPSHOT ≠ PLAYBACK EVENT.** `extractPositionFields` now tags each read position
with its `source` (`"event"` or `"snapshot"`), and `observePosition` decides whether the
reading counts as viewing. A snapshot counts only when the **same slot** was read before with
a **strictly greater** position (`SNAPSHOT_ADVANCE_EPSILON_S = 0.5`): a stored value cannot
advance on its own, so two readings that moved are viewing having happened between them, while
a mount baseline, an identical repeat, a backwards move and an episode change count for
nothing. The policy is a pure function in `lib/playerMessages.ts`, not inline in the component,
so it is reachable by a test that does not mount a browser.

**And the rule was checked against the live wire, not only against fixtures:** the ten
measured envelopes are **byte-identical in position** (`allEqual: true`). Under the rule the
first is a baseline and the other nine are repeats, so the entry quoted in point 3 above
**cannot be written by the fixed code**. That is the fix's premise confirmed on the real
provider rather than on a hand-made payload.

**Why this direction and not a harder block:** nothing about the iframe, the provider URLs,
the CSP or the playback path changed (§17). The only thing that changed is what counts as
evidence.

#### 5.3.1 What is still NOT proven about this fix

- **An advance was never observed by me.** Playback could not be started: VidLink's embed
  route timed out from here (`code=000` at 15.01 s while its root answered 200), so the
  "snapshot advances during playback" half rests on the repo's earlier measurement
  (`providers.ts`: `watched` advanced in step with the media element, 21.206035 while the
  element read 22 s) rather than on a re-measurement in this session. That is a real gap and
  it is the one that decides whether watch time is earned on VidLink at all.
- **The fix does not run in production.** It is committed locally; production served the
  previous revision throughout these measurements. The defect was measured **there**; the
  fix was verified by unit test plus the live-wire premise check above, **not** by observing a
  deployed page that no longer writes.
- **A provider that stops repeating its envelope during playback** would earn no watch time
  under this rule. The cadence above was measured **at rest**; whether the repetition
  continues while playing is unverified. The failure direction is deliberate (no minutes
  rather than invented minutes), but it is a failure direction and it is stated.

### 5.4 `Number(null) === 0` in the roles PATCH — a comment, not a behaviour

An audit note claimed a code path relied on `Number(null) === 0`. The behaviour is unaffected
by this work; only the comment's accuracy is in question. Left for the roles pass rather than
churned here.

### 5.5 NEW MEASUREMENT — `current_time` is a reserved word, and the SQL naming it never ran

This one was not in the brief and was not suspected. It was found while building the fixture
for §5.2, because the fixture would not create the schema.

**What was measured**, on the PostgreSQL 18.4 instance §5.2 describes, statement by statement:

| Statement, as shipped | Result |
| --- | --- |
| `INSERT INTO watch_history (… current_time …)` | `42601` **syntax error at or near "current_time"** |
| `ON CONFLICT … DO UPDATE SET current_time = …` | `42601` **syntax error** |
| `ALTER TABLE … ADD COLUMN IF NOT EXISTS current_time FLOAT` | `42601` **syntax error** |
| `SELECT current_time, total_duration, … FROM watch_history` | **parses** — and returns `"13:36:54.602569+01"`, the *server's time of day* |
| `SELECT "current_time" …` / `watch_history."current_time"` | the stored `1934`, as intended |

The cause is one row of `pg_get_keywords()`: `current_time`, catcode `R` — **reserved**. So
outside a quoted identifier it is not a column name at all. In an INSERT column list or an
`ON CONFLICT … SET` target PostgreSQL refuses to parse it; in a SELECT list it parses as the
SQL value function `CURRENT_TIME`, which is a *different expression that means something
else*, so nothing errors and the wrong value is returned. That second form is the dangerous
one, because it is silent.

**Consequences, each of which follows from the table above.**

1. **The signed-in write could never execute.** The route's INSERT named `current_time`
   unquoted, so every `POST /api/watch-time` from a signed-in user threw, and the route's
   catch turned it into `500 Internal server error`. No server-side watch time and no
   server-side progression has ever been stored through this route for an account.
2. **The read returned a clock instead of a position, silently.** `GET /api/watch-time`
   selected the same name, so each row came back with `current_time` set to a time of day.
   `utils/historyManager.ts` coerces that field with `toFiniteOrUndefined`, and
   `Number("13:36:54.602569+01")` is `NaN` — measured, not assumed — so the field became
   `undefined` and the entry was normalised with **no position at all**. Server-side history
   could not offer a resume point even when a position was stored.
3. **`scripts/migrate-progression.ts` cannot have created the column.** Its `ALTER` names
   `current_time` unquoted too, and its catch tolerates only `42701` (duplicate column), so a
   syntax error aborts the run — on the third of six columns, after `title` and
   `poster_path`. Production evidently *has* the column (the application reads it), so
   something else created it. **Which script or hand-run did is not established here.**

**The fix**, in all three files: quote the identifier (`"current_time"`) in the write module,
in the route's `GET`, and in the migration's interpolation. Nothing else changed — no column
renamed, no migration run, no API field renamed, so the request and response shapes are
identical and no client is affected.

**And it is pinned twice, because the two pins catch different things.**
`tests/watchHistoryConcurrency.test.ts` runs the real statements against a real server, so
the unquoted form fails loudly there — but that suite is skipped without `TEST_DATABASE_URL`,
which is exactly how a defect like this survives on a machine with no database.
`tests/watchTime.test.ts` therefore also asserts the rule at the source level: every SQL
statement in the write module and the route must name `current_time` quoted, the migration
must quote what it interpolates, and the scan is proved capable of failing by running it over
the three pre-fix statements.

**What is NOT proven about this finding.**

- **The version is one version.** All of it is measured on PostgreSQL 18.4. `CURRENT_TIME` is
  a reserved word in the SQL standard and has been reserved in PostgreSQL for many major
  versions, so this is not a new-version quirk, but I did not re-measure on another version
  and do not claim I did.
- **Production's 500 is inferred, not observed.** I could not authenticate, so I could not
  make the deployed endpoint take the signed-in branch. What is measured is the *code*: the
  route's own call, against a real server, threw `42601`. That the deployment behaves as its
  code does is the one step left to a credentialed check, and it belongs in §7's list.
- **`F2`/`F3` may have had this as their root cause, and that is unresolved.** Those fixes —
  the latch cleared on a proven session, the merge made awaited and all-or-nothing — are
  correct on their own terms and are kept. But the observable symptom they were written for
  ("the server row stayed behind", "entries that failed were never retried") is also exactly
  what a write path that always threw would produce. I have not separated the two, and I am
  not going to claim the earlier fixes were what repaired the symptom.

## 6. A validation claim found to be false, and made true

`lib/playbackSignal.ts:4` stated "Tested in tests/playbackSignal.test.ts". **That file did
not exist.** The claim was made true rather than deleted, because §28 forbids a test that is
asserted and not performed, and because the module gates watch time — a bug in it is an hour
of viewing reported for a tab left open. The suite pins the type-in-key namespacing (TMDB
numbers films and series separately, so `movie:550` and `tv:550` must not share a flag), the
pessimistic default, numeric/string id equivalence, and the module's **non-persistence** as a
source-level assertion: a stored flag would claim a previous visit's playback for this one,
and no runtime case could catch that, because the module would still behave correctly within
a single page session.

## 7. Limits of this work — what it does NOT establish

Stated plainly, because a report that omits these is not usable.

1. **Almost no device testing, and no observed playback anywhere.** §5.3 rests on a real
   Chrome session against production, which is where the mount-envelope write was measured and
   the envelope cadence read off the wire. **Every other claim here** is pinned by a unit test,
   by a database measurement, or is a source-level fact. No claim in this document rests on
   playback having been observed, because it could not be started (see §5.3.1).
2. **No production database was reached, and no production data was touched (§24).** The
   session has no `DATABASE_URL`. For §5.2 and §5.5 a LOCAL throwaway PostgreSQL 18.4 was
   booted instead and the real statements were run against it; it holds nothing but the
   probe rows the suite creates, and it is not the database the product uses. So: the SQL is
   measured, and the deployed schema is not — the column list in this document comes from
   `scripts/init-new-db.ts` and `scripts/migrate-progression.ts`, not from reading production.
   No migration was run against anything.
3. **The clock-skew tolerance is a judgement, not a measurement.** The server compares a
   client timestamp against `last_updated`, written by the database. `OBSERVATION_TOLERANCE_MS`
   (24 h) exists so that ordinary skew cannot freeze a viewer's season advance; past a day the
   rule calls an observation old news. Its failure mode is deliberately towards keeping the
   stored position, and the boundary is pinned by tests at, below and above it.
4. **A slot-only write is a no-op on a title that has a measured position.** A viewer who
   clicks another episode without watching it keeps seeing the last *measured* episode and
   position. That is the §9/§10 priority (never lose a correct progression) applied to a case
   where the two cannot both be satisfied, and it is why the position is preferred. Once the
   new episode is actually being watched, the first measured sample moves the row.
5. **What the fixes do NOT do:** they do not touch ad containment, which is a separate line of
   work with its own doc (`docs/provider-matrix.md`). They **do** now decide what counts as
   playback for watch time (§5.3), make the signed-in write one serialized transaction (§5.2),
   and make the SQL able to run at all (§5.5); the parts of each that could not be proven are
   listed in §5.2, §5.3.1 and §5.5.
6. **The deployed revision was checked only where an unauthenticated probe reaches, and the 500
   was not observed.** What *is* measured, on production, is the one change that changes the
   answer to a request needing no session: `POST https://www.moveo.blog/api/watch-time` with
   `{"media_type":"movie","media_id":550,"minutes":0}` now answers **`401 {"error":"Unauthorized"}`**.
   The pre-fix guard answered **`400 {"error":"Missing required fields"}`** for that exact body
   (measured 2026-09-21, recorded in `tests/watchTime.test.ts`), so the guard fix is **deployed**,
   not merely committed — and the branch order means the 401 is the guard passing and the auth
   check refusing, before any database access, so no production data was touched (§24). What
   remains unestablished: whether the §5.2 transaction and the §5.5 quoting are deployed, since
   reaching either needs a signed-in cookie this session does not have, and the `500` itself was
   never observed, only reproduced as `42601` against a local server (§19).
7. **The new transaction's cost under load is argued, not measured.** §5.2 states what the
   advisory lock does to availability, with the pool's actual configuration (`lib/db.ts` sets
   nothing, so `pg`'s ten-client default applies), and why the exposure is small. What is not
   measured is throughput: per title, writers are now serialized where they were not before, and
   no load test was run to price that. It is a wall-clock cost on a path that fires per minute
   per viewer per title, and it is listed here so it is not mistaken for something the suite
   covered.

## 8. Security re-pass over the changes in this document (§17)

Run after §5.2 and §5.5 landed — over the diff that shipped, not over the intention behind it.
Each item says what was checked and how to re-check it.

1. **No request value reaches the database as SQL text.** The only `${…}` in
   `lib/watchHistoryWrite.ts` is the advisory-lock key, which is passed as a bound `$1` rather
   than spliced into the statement; every other value goes through `$n`. `app/api/watch-time/route.ts`
   contains no `${…}` in code at all. Re-check:
   `grep -n '\${' lib/watchHistoryWrite.ts app/api/watch-time/route.ts`.
2. **The lock key cannot be forged into another account's.** It is `userId:mediaType:mediaId`
   with the account id **first**, and that id comes from the verified token. `mediaType` and
   `mediaId` are caller-controlled, so a delimiter inside one of them can only produce a key
   that already begins with the caller's own id — there is no key belonging to someone else that
   a crafted `media_type` can reach. A `hashtext` collision between two unrelated titles merely
   serializes them; it cannot let one write the other's row, because the row is matched by
   `user_id = $1` in the statement itself.
3. **Ownership is unchanged on every path.** The new write filters `user_id = $1` in both its
   SELECT and its INSERT, and the id is filled from `jwtVerify`, never from the body — as do the
   GET and the DELETE, which this change did not touch. The one new refusal (a token whose
   `userId` is neither a number nor a string → 401) happens before any database access and
   returns no detail about the token.
4. **A client can still only reorder its own rows.** `observed_at` is advisory and self-scoped,
   so a timestamp set in the future can misorder the caller's own history and nothing else: the
   row it orders is selected and updated by `user_id`.
5. **What the re-pass did not do.** It did not add `lock_timeout` or `statement_timeout`, did not
   change the pool's configuration, and did not touch the guest branch or the DELETE handler. The
   availability cost that follows from leaving those alone is recorded in §5.2 and §7.

## 9. Snapshot vs real progression — answered by measurement on production (§7)

The brief asks for the **observable** difference between `snapshot` and *vraie progression*, on the
insistence that a signal which is not reliable must not be used as proof of playback. Two live
sessions were instrumented by reading the messages a real browser receives from the frames, and the
answer is unambiguous.

**What was observed. All of it on `https://www.moveo.blog`, 2026-09-22.**

| | `/movie/969681` (132 s) | `/tv/1429?s=1&e=1` (~150 s) |
|---|---|---|
| `{type:"MEDIA_DATA"}` snapshots | **65**, at a ~**2000 ms** cadence | **4**, at 1998–2000 ms |
| `{type:"timeupdate", …}` (either accepted shape) | **0** | **0** |
| `{event:"timeupdate", data:{…}}` | **0** | **0** |
| `POST /api/watch-time` | **0** | **0** |
| `POST /api/ping` | **8** | — |
| `localStorage.watch_history` written? | **No** (unchanged after 132 s) | **No** |

**Three properties of the snapshot make it structurally unlike a progression**, and they are the
answer to the question:

1. **It is addressed to the provider's own client, not to what is mounted.** The payload is a fixed
   five-id bundle — `["550","1429","93405","372058","969681"]` — carrying the provider's stored
   history for this browser. `entry550` arrives as `{watched: 338.211216, duration: 8348.3}` **every
   two seconds while nothing plays**, on a page whose title is `969681`. A real progression is about
   the thing being watched; this is a memory dump that happens to contain it.
2. **The mounted title's own slot is sent ZEROED.** `entry969681` was
   `{progress: {watched: 0, duration: 0}, last_updated: <mount time>}`, and on the series page
   `sp_s1e1 = {progress: {watched: 0, duration: 0}}` with `sp_s2e7` also `{0, 0}`. The provider
   stamps the slot it mounts and reports no position in it. So the *mount envelope* cannot be read
   as playback: it says, in the provider's own words, "zero seconds watched".
3. **It repeats; a progression advances.** The same values came back on every one of the 65
   messages. Nothing about a message that repeats unchanged distinguishes a playing viewer from an
   idle tab.

**WATCH TIMER ≠ PAGE TIMER, measured.** Over the same 132 seconds the page sent **8** `POST
/api/ping` requests and **zero** `POST /api/watch-time`. The page-presence clock ran; the watch-time
clock did not, because `hasPlaybackBeenObserved` was never set — which is §13's rule holding in
production rather than in a test.

**A correction to the record, and the guard that was actually load-bearing.** §5.3 recorded that the
provider rewrote a position while nothing played (`{timestamp: 0, duration: 8678}` for the movie,
`21.206035 / 1439.2` for `s1e1`). **Neither value was present in this session.** What the provider
sends for the mounted title today is a `0/0` envelope under a `last_updated` equal to the mount
time, and `partitionPlaybackSnapshot` rejects a `0/0` pair on `duration > 0`, so the write never
reached `saveWatchHistory` — hence "No" in the table above. So the honest statement of what protects
this path is: **the `duration > 0` rejection is what held today**, and the *advance* rule
(`isSnapshotAdvance`, commit `51f6191`, **not deployed** — it is one of three local commits) is the
robust guard for the case a provider re-sends a **non-zero** duration with a zero or stale position,
which is precisely the shape §5.3 measured on 2026-09-21. The two are not alternatives: one is
sufficient for today's envelope, the other is sufficient for the envelope that was measured before
it.

## 10. Refresh / navigation persistence, tested one path at a time (§4)

The product-reported symptom is *"quand je refresh ou active une extension, la progression est
perdue"*. Each row below is **one** real action in a real browser against production, and is labelled
on the observation alone. No row is generalised from another.

| Action | Result | What was observed |
|---|---|---|
| Refresh on `?s=1&e=4` | **PERSIST** | Still S1E4 after the reload; no rewind |
| Internal navigation (home card → TV page) | **PERSIST** | Entry retained; landed on the stored slot |
| Browser **back** | **PERSIST** | Returned to the previous entry, position intact |
| New tab (same profile) | **PERSIST** | Same entry **and the same `anon_session_id`** — not re-issued |
| Tab closed, fresh page opened | **PERSIST** | `/tv/1429` came back at **S2E7** |
| Browser reopen (`/tv/1429`, bare URL) | **PERSIST** | Resolved to the **stored** slot S2E7 — **never fell back to S1E1** |
| Mounting S1E1 in the same browser | **PERSIST** | No rewind to S1E1 |
| Mounting `/movie/969681` | **PERSIST** | No new entry, no overwrite of the series row |
| **Extension enabled / disabled** | **NOT VERIFIED** | No extension is installed or controllable in this automation profile. Not attempted, and not inferred from the rows above. |

**The named failure mode did not reproduce in any of the eight paths that were run.** The bare URL
`/tv/1429` — the case where a rewind to S1E1 would be most likely — resolved to the **stored**
episode. That is a result about these eight paths in this one browser profile, not a general
guarantee, and the extension row is exactly the kind of path that could behave differently.

**Episode advancement was verified, and the history entry deliberately does NOT follow it.** Three
`Épisode Suivant` clicks moved the URL and the frame correctly (`?s=1&e=2` → `?s=1&e=3` →
`?s=1&e=4`), while the stored row stayed at S2E7 / 1934 / 2830 throughout. This is §7.4 above
operating as documented: a slot-only write is a no-op on a title that has a measured position, so
the Continue-Watching card does not follow episode navigation. **The cost is real and it is on the
UX side, not the data side**: §5 asks the component to reflect reality, and here reality is that the
viewer has navigated to S1E4 while the card still offers S2E7. The alternative — letting a slot-only
observation overwrite a measured position — is the rewind this whole document exists to prevent, so
the trade-off is kept and the tension is recorded rather than resolved.

**Guest half of §6, measured.** `GET /api/watch-time` answers `{progress: []}` for a request with no
session, so the card on a fresh visit is driven entirely by the local entry. The signed-in half — the
browser copy compared against the server row, and Writer A + Writer B run in a browser with two close
updates — **needs an account this session does not have**, and is marked NOT VERIFIED rather than
approximated. **No test data was deleted**, per the brief's instruction to observe the result first.

**§3 (guest → account, and logout isolation) is NOT VERIFIED for the same reason** — no credentials.
It is the one scenario in the brief that cannot be reached at all from this session, and it is the
one where the merge logic (§3 of this document) most needs an end-to-end observation.

**One incidental measurement, on every page load: `/api/auth/me` is requested three times, and all
three answer 401 for a guest** (measured on three different pages, request ids 1316/1317/1349,
24/25/58, 2263/2264/2288). A duplicated auth round-trip per load; recorded here because it was on the
wire, not investigated further because it is not a watch-history defect.
