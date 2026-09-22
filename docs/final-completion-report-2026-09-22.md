# FINAL COMPLETION PASS — report, 2026-09-22

**Status of the repository at the time of writing.** `HEAD` is `9fa27ab`, unchanged. The working
tree carries the nine files this pass touched and **no commit was made and nothing was pushed**; the
branch remains three commits ahead of `origin/main`. Per §18, **FIXED means "changed and the test
passed"**, not "committed" — so the fixes below are FIXED and undeployed, and every one of them is
unverified in production.

The four verdicts are used strictly, and nothing appears under a heading it did not earn:

- **VERIFIED** — observed directly in this session, with the observation named.
- **FIXED** — changed here, with an automated test or a build that passed afterwards.
- **NOT PROVEN** — reachable in principle, not reached in fact, with the reason.
- **NOT DONE** — not attempted, and why.

---

## A. FIXED in this pass (4)

### A1. The player section heading claimed playback unconditionally (§15)

`app/movie/[id]/page.tsx` and `app/tv/[id]/page.tsx` rendered `<h2>{t.details.nowPlaying}</h2>` —
"Lecture en cours" / "Now Playing" — **before the frame had sent anything**, whether or not anything
ever played. §15: *"Aucune UI ne doit annoncer 'Lecture en cours' sans signal fiable de lecture."*

Measured on production the same day: on `/movie/969681` the heading read "Lecture en cours" for the
whole 132-second session while the frame sent 65 snapshots and **zero** position updates, and
`POST /api/watch-time` was called **zero** times.

The heading now renders `t.details.videoPlayer` — "Lecteur Vidéo" / "Video Player" — which **names
the section instead of claiming a state**: true while loading, true while playing, true when broken.
The `details.nowPlaying` key was **deleted from both locales** so the claim cannot return under that
name, and the orphaned `details.videoPlayer` key it replaced was already there with that exact
meaning, so the false claim and an orphan key went together.

**Rejected alternative, recorded:** making the heading truthful *dynamically* ("Lecture en cours"
only once playback is observed) would require lifting `playbackObserved` out of `VideoPlayer` into
the page. That is a new prop on the player's public interface, it is a feature rather than a
correction (§19), and with no way to produce real playback in this session it could not have been
tested. A label that is always true needs no signal and cannot be wrong.

### A2. A slow provider was declared dead permanently (§15)

`lib/playerState.ts` refused `IFRAME_LOADED` unless the phase was still `LOADING`, so a provider
that took more than `IFRAME_LOAD_TIMEOUT_MS` (20 s) landed in `LOAD_FAILED` — whose panel reads
**"Le lecteur ne répond pas"** — and **nothing could leave that phase**: no automatic exit, no
re-arm, and the late load event discarded. §15: *"Aucune UI ne doit annoncer 'Lecteur indisponible'
simplement parce qu'un provider est lent si celui-ci finit par fonctionner."*

`LOAD_FAILED` is armed by a 20-second timer and by nothing else — it carries no evidence about the
network. A document that loads late is positive evidence that it **did** commit, so the verdict is
now withdrawn: `IFRAME_LOADED` from `LOAD_FAILED` moves to `IFRAME_LOADED_PLAYBACK_UNKNOWN`, keeps
the same server and the same attempt, and clears `playbackUnverified` so the advisory notice gets
its own full 15-second window instead of inheriting a decision it never earned. `UNAVAILABLE` still
refuses a load event (no frame exists there), and the duplicate-load no-op is unchanged.

The stale-frame hazard the old guard covered is handled where it belongs and always was: the iframe
is re-keyed per attempt and `onLoad` ignores an event whose `currentTarget` is not the mounted
element.

### A3. The watch-time signal outlived every attempt it was evidence about

`lib/playbackSignal.ts` held a page-session `Set` that **nothing ever removed a key from**. Once a
title had played once, every later attempt on that page — a retry, a source change, **an episode
change** — was "playback observed" to `WatchTimer` with no new signal, and minutes accrued for a
frame that had reported nothing. On a series page this is not a corner case: `WatchTimer`'s interval
is keyed on `type:id`, which an episode change does not alter, so the timer is never torn down on
one and keeps asking about a title whose player has been replaced.

Added `clearPlaybackObserved(mediaType, mediaId)`, called from the player's existing
`resetPlaybackObservation` — the function that already ends an attempt for the component-local half
of the signal (the ref, the state, the snapshot cursor, the dismissed notice). A new frame now earns
the fact again, or does not get it. This is also what makes the module's own documented intent
("minutes accrue only on providers that emit a verifiable position") true of the **current attempt**
rather than of the page's history.

### A4. The loading label described a search that does not happen

The `LOADING` overlay read "Recherche du meilleur serveur..." / "Searching for the best server...".
The source resolves the source **synchronously** from the stored preference — its own comment says
there is no resolving step for playback to wait behind — so no server is searched for or compared.
The label now says what is in flight: **"Chargement du lecteur..." / "Loading the player..."**
(`details.searchingServer` → `details.loadingPlayer`, both locales).

**Removed with it, and this corrects an earlier reading of this file:** the second branch of
`phaseLabel`, `"Serveur lent détecté"` / `"Slow server detected"`, was **unreachable**. `phaseLabel`
was rendered in one place only, inside the `player.phase === "LOADING"` branch, so the
`IFRAME_LOADED_PLAYBACK_UNKNOWN` value was computed and never displayed. It was never a status a
user saw — and it asserted slowness that is measured nowhere. Deleted rather than kept as a latent
false verdict, and `details.slowServerDetected` went with it.

### Evidence for all four

| Check | Result |
|---|---|
| `npm test` | **344 pass / 0 fail / 0 skipped**, 72 suites (baseline was 334 / 70 — the +10 tests and +2 suites are the ones added here) |
| the four suites touched, by name | `playbackSignal` ✓, `the player withdraws the fact when it starts a new attempt` ✓, `advisory notice — must not assert a playback verdict` ✓, `the player section heading must not claim a playback state` ✓ |
| `npx tsc --noEmit` | **exit 0**, no output |
| `npm run build` | **exit 0**, `✓ Compiled successfully`, 53 static pages, no error/warning line |

The two fixes whose *absence* was the defect — A3's call site and A1/A4's wiring — are pinned by
**source-level assertions**, for the reason `tests/playbackSignal.test.ts` already gives for that
technique: `clearPlaybackObserved` could exist, be exported, be correct and be fully tested while the
player never calls it, and every runtime test would still be green. Nothing but a source scan
catches that.

---

## B. VERIFIED (observed directly, this session)

1. **Snapshot vs real progression, answered by measurement.** On `/movie/969681`, 132 s: **65**
   `{type:"MEDIA_DATA"}` snapshots at an essentially exact **2000 ms** cadence; **0** `timeupdate`
   shapes of either accepted form; the payload a fixed five-id bundle
   `["550","1429","93405","372058","969681"]`; `entry550 = {watched: 338.211216, duration: 8348.3}`
   **re-sent every two seconds while nothing plays**; the mounted title's own slot sent **zeroed**
   (`entry969681 = {progress: {watched: 0, duration: 0}}`, `sp_s1e1` likewise, `sp_s2e7` likewise).
   A snapshot is the provider's memory of *its own client*, addressed to titles that are not
   mounted, and it repeats unchanged; a progression is addressed to what is mounted and advances.
2. **WATCH TIMER ≠ PAGE TIMER, measured.** Same 132 s: `POST /api/ping` fired **8** times,
   `POST /api/watch-time` fired **zero** times. The page clock ran; the watch clock did not, because
   `hasPlaybackBeenObserved` was never set.
3. **Refresh / navigation persistence, eight paths, each labelled on its own observation** — refresh
   on `?s=1&e=4` **PERSIST**; internal navigation **PERSIST**; browser back **PERSIST**; new tab
   **PERSIST** (same `anon_session_id`, not re-issued); tab closed then a fresh page **PERSIST**
   (`/tv/1429` → S2E7); browser reopen on the bare URL **PERSIST** (resolved to the **stored** slot
   and **never fell back to S1E1**); mounting S1E1 in the same browser **PERSIST**; mounting
   `/movie/969681` **PERSIST**. **The named failure mode did not reproduce in any of the eight.**
4. **Continue Watching renders reality (§5).** The card showed `href="/tv/1429?s=2&e=7"`, badge
   `S2 · E7`, `Saison 2 · Épisode 7`, action `Continuer`, progress **`32:14 / 47:10`**, provider
   `VIDLINK`; clicking it landed on `/tv/1429?s=2&e=7` with the frame at
   `https://vidlink.pro/tv/1429/2/7` — **S2E7, not S1E1**.
5. **Episode advancement works, and the history entry deliberately does not follow it.** Three
   `Épisode Suivant` clicks moved URL and frame to `?s=1&e=4` / `/1/4` while the stored row stayed
   `S2E7 / 1934 / 2830`. This is the documented §7.4 trade-off: a slot-only write is a no-op on a
   title with a measured position. **The cost is on the UX side and is recorded, not hidden** — the
   viewer navigated to S1E4 and the card still offers S2E7.
6. **Frembed, three content classes, live.** Anime series (`/tv/1429`, `frembed.surf/embed/serie/…`),
   movie (`/movie/969681`), Korean series (`/tv/93405`): the frame loads in all three; the **only**
   message ever received is `{"type":"episode_change", …}` from `https://frembed.surf` — a slot, not
   a position, and explicitly rejected by our parser — after which the honest advisory
   **"La vidéo ne démarre pas ?"** appears. **No popup, no new tab, no redirect in any of the
   three.**
7. **The ad surface, LOAD only.** VidLink's frame pulled `mc.yandex.ru`, `g.clarity.ms`/`o.clarity.ms`
   ×4, `POST adsco.re/t`, `adexchangerapid.com/script/suurl5.php`, plus its own
   `fu.wasm`/`api/mercury`/`api/venus`. Frembed's pulled **no third-party ad or analytics network** —
   only `static.cloudflareinsights.com` and its own `api/auth/session`. On a source change the old
   frame's request was `net::ERR_ABORTED`, i.e. the switch really tears the previous frame down.
8. **§11, the endpoint protects the action — measured, unauthenticated, status codes only.**
   `GET` on `users`, `roles`, `reports`, `system`, `content`, `stats`, `online` → **401** each;
   `DELETE /api/admin/sections?id=999999`, `PUT /api/admin/reports`, `PUT /api/admin/users`,
   `POST /api/admin/roles` → **401** each. `GET /api/admin/watch-time` → **405** (the route exports
   only POST). Every one of the **17** handlers in the 9 admin route files calls
   `checkAdminAccess(...)` as its **first statement**, before `req.json()` and before any query, so
   the deployed revision authorises before it reads the body: **11 of 11 probed endpoints protected,
   0 exposures.** All probes used ids that cannot exist, so a total failure to authorise would still
   have changed nothing.
9. **`lib/jwtSecret.ts` throws rather than falling back.** The hardcoded JWT secret is gone; the old
   literals survive only as inert comments and test fixtures.
10. **`GET /api/admin/sections` is public by design, and this corrects an earlier claim.**
    `app/page.tsx:61` calls it on every home page load, so it *must* be reachable without a session.
    It answers **200 / 495 B**, and its bootstrap is memoised to **once per server process** (a
    module-level promise, with a rejection deliberately not cached). The residual finding is small
    and is documented in the file itself: the first request per process still runs
    `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` — which takes an `ACCESS EXCLUSIVE` lock even when
    it adds nothing — on an unauthenticated path, and the file states that its proper home is a
    migration.
11. **Three `/api/auth/me` calls per page load, all 401 for a guest** (measured on three pages,
    request ids 1316/1317/1349, 24/25/58, 2263/2264/2288) — a duplicated auth round-trip, recorded
    because it was on the wire, not investigated because it is not a watch-history defect.
12. **The guest→account merge's prerequisites, at source.** `middleware.ts` does not gate
    `/api/admin/*`; each admin route protects itself. Its ban check is a self-fetch bounded by a
    **3-second abort**, and on timeout it logs and continues — i.e. it **fails open**.

---

## C. NOT PROVEN (with the reason, per §18)

1. **The §2 "advance" step — a real playback position advance — could not be produced at all.**
   VidLink does not autoplay, the frame is cross-origin and no tool reaches into it, and a forged
   `postMessage` from our own page carries `event.origin = https://www.moveo.blog`, which is not in
   the allowlist. **This is also a positive security finding:** forged playback is impossible from
   our own page by construction. Every claim that depends on having *seen* a position advance is
   therefore absent from this report, and the guest-movie and series scenarios of §2 are complete
   only up to the point playback would begin.
2. **§3 — guest → account, and logout isolation: no credentials.** This is the one scenario in the
   brief that cannot be reached from this session at all, and it is where the merge logic most needs
   an end-to-end observation. **No test data was deleted**, per the instruction to observe the
   result first.
3. **§4 — the extension enable/disable row: no extension is installed or controllable in this
   automation profile.** Not attempted, and not inferred from the eight rows that were.
4. **§6 — the signed-in half.** Comparing the browser copy against the server row for the same
   account, and Writer A + Writer B in a browser with two close updates, both need an account. The
   database-level Writer A/B *is* covered by `tests/watchHistoryConcurrency.test.ts`, and **that
   suite did not execute in this pass**: `TEST_DATABASE_URL` is unset, so its 8 tests were skipped.
   `npm test` reporting `skipped 0` is about node's counters, not about those tests having run.
5. **§8–§11 — every admin scenario that needs an admin session.**
   **NOT VERIFIED — ADMIN SESSION REQUIRED.** What is verifiable without one is reported above
   (items 8–10); everything that depends on *being* an admin — the 12 permission toggles taking
   effect, a 403-vs-401 distinction, moderation resolution, watch-time adjustment, the dashboard's
   data coherence, optimistic updates and their rollback, pagination, and the double-submit cases —
   is unmeasured. **The panel was not declared "audited" and "admin OK" was not written.**
6. **`checkAdminAccess` answers 401 for BOTH failure modes** — no token, and a valid token whose role
   lacks the required permission (`lib/adminAuth.ts:55-61` both `return null`). **Security-wise it
   fails closed**, and §11's rule is satisfied: there is no path where a missing permission returns
   data or writes. The lost distinction is diagnostic — the UI cannot tell an under-permissioned
   admin from a signed-out visitor. Confirmed at source, **not** exercised, because that needs a
   signed-in non-admin.
7. **A banned admin keeps their permissions when the ban check times out.** `checkAdminAccess` never
   reads `is_banned` (it selects `u.*`, so the column is right there), and the only enforcement is
   the middleware self-fetch that fails open on its 3-second abort. Source-verified; **NOT PROVEN as
   an exploitable outcome**, and not attempted, since exercising it would mean racing a production
   timeout with a banned account.
8. **§12 — PLAY, 60 SEC, FULLSCREEN, and the ad behaviour on SOURCE CHANGE / EPISODE CHANGE.** These
   need playback to start, which could not be done (§C1). Only LOAD is measured, so the ad table has
   a LOAD column and blanks elsewhere. **Nothing is written as "ads bloquées".**
9. **§14 — a fourth content class (western TV) was not run.** Frembed is classified on three classes,
   not four, and the classification is therefore **PARTIAL — never WORKING**: the frames load and the
   provider speaks, but it reports no position at all, so *playback cannot be verified by us* — and
   the absence of an ad request in a window where nothing played is not evidence about a playing
   session.
10. **§15 — that a slow-but-working provider now recovers is unit-tested, not observed.** The fix in
    A2 is not deployed, so the 21-second provider it is about has not been met.
11. **§16 — every revalidation that needs a session, a database, or a deployment.** The PostgreSQL
    `current_time` behaviour is pinned by source-level tests only in this pass, because no database
    was reachable.
12. **§17 — nothing is deployed, so there is nothing to validate in production.** The one production
    fact from an earlier pass still stands and still needs no session: `POST /api/watch-time` with
    `{"media_type":"movie","media_id":550,"minutes":0}` answers **401**, where the pre-fix guard
    answered **400** — so the guard fix is deployed. The transaction and the quoting are not.

---

## D. NOT DONE

1. **§13 — ad containment. Nothing was changed, deliberately.** Per §13 a containment change may
   only ship if playback survives it, and no playback observation exists to test against, so any
   modification would be unfalsifiable. `referrerPolicy="no-referrer"` is the low-risk tightening
   identified (already used on every `next/image`) and **is not applied**: a provider that checks the
   referrer for hotlink protection could refuse to serve, and that is exactly the "blocks ads but
   breaks the player" case §13 says to revert. `sandbox`, a narrower `allow`, and `frame-ancestors`
   are in the same position, and the last of those is ours to set without touching the provider.
2. **§10 — admin UX improvements beyond the static findings.** No confirmation dialogs, no label
   rewrites, no removal of decorative elements in the admin panel: every one of them would be a
   change to a surface that cannot be exercised without an admin session, and §19 forbids adding
   features to look busy.
3. **Credential rotation, owed and untouched.** FILE and VARIABLE NAME only, never a value:
   `app/api/auth/google/callback/route.ts` and `app/api/auth/google/url/route.ts`
   (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — a live client secret sits in the `||` fallback);
   four `test_tmdb*` files, `scripts/create-user-list.ts`, `scripts/init-new-db.ts`,
   `scripts/migrate.ts`, `scripts/run-migration.ts`.
4. **Deployment and post-deployment verification.**
5. Also carried over, unchanged: delete `/api/ai/semantic-search` (zero callers); the
   `/api/tmdb-proxy` allowlist; password length enforced only on reset; `forgot-password` unrated;
   the Gemini model-id inconsistency; orphan scripts (`fix_backticks.js`, `get_git.js`,
   `test-*.js`, `app/applet/`); the `content_settings.setting_value` TEXT-vs-JSONB conflict;
   `components/CustomVideoPlayer.tsx` (359 lines, unreachable) and the orphan i18n keys that went
   with the retired premium tier; a `manage_roles` holder being able to edit its own role
   (`roles/route.ts` PUT with all 12 permissions); self-ban as a permanent lockout; deleting the
   built-in "User" role orphaning every standard account; watch time drivable negative with no floor;
   the moderation queue reading columns its own schema does not create; double-submit creating
   duplicates; hover-only edit controls unreachable on touch.

---

## E. Per-domain verdict (§18)

| Domain | Verdict | Basis |
|---|---|---|
| **ADMIN** | **NOT PROVEN** | No admin session. 11/11 endpoints measured as protected (§B8) and the permission model read at source (§C6–C7) — nothing that requires *being* an admin was tested. |
| **WATCH HISTORY** | **VERIFIED**, with two gaps | Eight persistence paths PASS (§B3), the card renders reality (§B4), episode advancement works (§B5). Guest→account and logout isolation **NOT PROVEN** (§C2). |
| **PLAYER** | **FIXED, not deployed** | Four corrections, all tested (§A), including the two §15 rules. Real playback never observed, so all playback-dependent behaviour is **NOT PROVEN** (§C1). |
| **ADS** | **PARTIALLY MEASURED, no containment work** | LOAD-only observations (§B7); PLAY / 60 SEC / FULLSCREEN **NOT PROVEN** (§C8); containment **NOT DONE by decision** (§D1). |
| **UX** | **FIXED in part** | The two false UI claims are gone and pinned by tests (§A1, §A4); the episode-change/card tension is recorded rather than resolved (§B5); admin UX untouched (§D2). |
| **SECURITY** | **VERIFIED where measurable, NOT PROVEN where not** | 11/11 probed admin endpoints protected; JWT fallback gone (§B9); forged playback impossible from our own page (§C1); ban-check fail-open and 401-instead-of-403 source-verified but unexercised (§C6–C7). |
| **DATABASE** | **NOT PROVEN in this pass** | No database reachable: `TEST_DATABASE_URL` unset, so the concurrency suite did not run (§C4). The `current_time` behaviour rests on source-level tests plus the earlier PostgreSQL 18.4 measurements, not on a run today. |
| **TESTS** | **DONE** | 344 pass / 0 fail after the fixes, plus `tsc --noEmit` and a production build, both exit 0. Two new suites pin the two corrections whose absence was the defect. |
| **PRODUCTION** | **NOT DONE** | Nothing committed, nothing pushed, nothing deployed. Every FIXED item above is therefore unproven in production, and the report does not claim otherwise. |

---

## F. Corrections to earlier claims in this audit

Recorded so the record is not read as stronger than it is.

1. **"Serveur lent détecté" was reported as a live false status. It is dead code.** `phaseLabel` was
   rendered only inside the `LOADING` branch, so the `IFRAME_LOADED_PLAYBACK_UNKNOWN` string never
   reached a screen. Removed (§A4) — but it was never a defect a user could see, and saying so
   earlier was wrong.
2. **The mount-envelope write did not reproduce, and the reason matters.** The provider sends a
   `0/0` envelope for the title it mounts, and `partitionPlaybackSnapshot` rejects a `0/0` pair on
   `duration > 0`, so nothing was written and `localStorage` was unchanged after 132 s. The
   `21.206035 / 1439.2` value recorded for `s1e1`, and `{watched: 0, duration: 8678}` for the movie,
   **were not present today**. So the honest statement is: the **`duration > 0` rejection is what
   held**, and the **advance** rule (`isSnapshotAdvance`, commit `51f6191`, **not deployed**) is the
   robust guard for the shape that *was* measured on 2026-09-21.
3. **`GET /api/admin/sections` is not the hole it was reported as.** It is the endpoint the home page
   calls; the DDL is memoised to once per process and the seed runs only on an empty table
   (§B10).
4. **The 403/401 collapse is a UX and observability finding, not a security hole.** It fails closed
   (§C6).
5. **`tsconfig.tsbuildinfo` was already modified before this pass began** and was refreshed again by
   the build. It is a build artefact, it is not part of the change, and it must not be committed —
   as must not `.probe-snapshot.txt` and `sib.html`, which remain untracked scratch files.

---

## G. What a session with credentials would have to do, in order

1. Sign in as an admin **with a limited role** → confirm the dashboard renders, and test one
   action the role does **not** have, to see whether the UI hides it *and* whether the endpoint
   refuses (the 401-vs-403 question, §C6).
2. As that same admin, exercise each of the 12 permissions against its menu, page, endpoint and
   mutation (§11) — including the double-submit cases and the "Retirer le Hero" optimistic claim.
3. Sign in as a normal user and run §3 in full: watch a film and a series to S2E7 with a real
   position, **then** log in, confirm the guest history appears with film, series, S2E7 and position
   intact, then log out and confirm a new guest context recovers **nothing** from the account. **Do
   not delete the test data before observing the result.**
4. With a session, produce one real playback position advance and only then fill in §12's PLAY /
   60 SEC / FULLSCREEN columns and confirm the §A2 fix in production.
5. Re-run `tests/watchHistoryConcurrency.test.ts` with `TEST_DATABASE_URL` set (§C4).
6. Only then: commit, push, wait for deployment, verify the deployed revision, and re-test
   production — §17's sequence, which this pass deliberately stopped short of.
