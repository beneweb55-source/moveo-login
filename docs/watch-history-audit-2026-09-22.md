# Watch history audit — 2026-09-22

This file records the watch-history half of the audit brief: what was found, what was
changed, and — separately — what was **not** changed and why. It follows the rule
`docs/player-validation-2026-09-21.md` sets for itself: **a claim is recorded only when
something was observed**, and a fix is recorded as a fix only after the suite that pins it
runs.

Findings are labelled with the identifiers used while working: `F1`–`F6` for the history
defects, `R3-*` for the regressions introduced and found in this same diff.

**State at time of writing:** 330 tests / 68 suites / 0 failures (the count grew with the
suite pinning §5.3). `tsc --noEmit` clean, `npm run build` succeeds. `eslint .` reports 2
errors, 0 warnings — both pre-existing in `components/VideoPlayer.tsx` and untouched here.
**Claims below are marked with what they rest on:** a unit-test result, a source-level fact, or
a measurement taken in a real browser on production. §5.3 is the one section whose central
finding is live-measured; the rest are not, and §7 says so.

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

## 5. Recorded, deliberately NOT changed

Each of these is a real finding with a real remedy. All but one is unchanged, and the reason
is in each entry rather than left to the reader. `R3-F1` was the exception: it was waiting on
a measurement, the measurement was taken, and it is now fixed — §5.3 records what was
measured and §5.3.1 records what is still not proven about the fix.

### 5.1 F5 — the `isComplete` escape hatch is unreachable through any measured path

`resolveProgression` lets a stored position rewind when the stored position was already
complete (a rewatch). The concern was that an episode's *mount* envelope could read as
"complete" and let a position rewind. It cannot, on the measured evidence: the media-level
`progress` field (`{watched: 0, duration: 1439.2}`) is one `readMediaData` deliberately
ignores for series; the per-episode slot that series actually use tracks real progress
(`show_progress.s1e1.progress.watched = 21.206035`). **Changing it would break the rewatch
allowance, which is deliberate.** Recorded, not changed.

### 5.2 F6 — no transaction and no row lock in the write path

`POST /api/watch-time` does SELECT-then-UPSERT with no transaction and no `FOR UPDATE`. Two
writers — a player in one tab, a merge in another — can interleave. The race exists today and
is **unchanged** by this work.

Remedy, for when it is taken: an advisory lock (`pg_advisory_xact_lock`) inside a
transaction. `FOR UPDATE` alone would not close it, because it cannot lock a row that does
not exist yet on the first insert.

Why not now: the remedy cannot be verified from here (see §7), and a half-verified
transaction wrapper around a hot path is the unverified claim §20 and §28 forbid. Recording
it is the honest outcome; pretending a lock was tested when it was not is not.

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
   the envelope cadence read off the wire. **Every other claim here** is pinned by a unit test
   or is a source-level fact. No claim in this document rests on playback having been
   observed, because it could not be started (see §5.3.1).
2. **No database was reached.** `DATABASE_URL` is not available to this session, so no
   migration was run, no existing row was read, and **no production data was touched** (§24).
   The SQL changes are reasoning over the schema read from `scripts/migrate-progression.ts`.
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
5. **What the fixes do NOT do:** they do not add a transaction (§5.2), and they do not touch
   ad containment, which is a separate line of work with its own doc
   (`docs/provider-matrix.md`). They **do** now decide what counts as playback for watch time
   (§5.3), and the part of that decision which could not be proven is listed in §5.3.1.
