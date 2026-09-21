# Provider matrix — measured evidence

This document is the **evidence layer** for the provider integration review. It exists
because a provider that returns HTTP 200 is not automatically a working player, and
because the difference between "the provider is down" and "this vantage point cannot
reach the provider" has already been mistaken once in this project.

Nothing in this file changes application behaviour. It records what was actually
observed, on what date, with which tool, and — just as importantly — which cells were
**not** measured.

**Revision note (2026-09-21, second pass).** The first pass left three things open: the
SmashyStream domain status, the season-0/specials question, and the integration-status
classification. All three are now resolved below, by measurement. Two cells that were
previously recorded as failures have been **corrected upward** because the earlier
reading was wrong, and one previously-unmeasured dimension produced a real bug in our
own code.

**Revision note (2026-09-21, third pass).** The anime and Korean coverage columns — the
two the task brief names as priority gaps — were measured properly this pass, against
Frembed's own public JSON API rather than against page shells. That API was recorded in
the first pass as a `[D]` claim (reported in documentation, not verified). It is now
`[M]`: the surface was enumerated, its parameters were tested for effect, and its
response bodies were parsed. Two consequences worth stating plainly:

- **The API's `link` values use our exact URL grammar.** This is independent
  corroboration of `buildUrl()` from the provider's own output, which previously rested
  only on observed redirect `Location` headers.
- **A coverage number is not a coverage claim.** Frembed's anime catalogue is **146
  titles**, which is a real, enumerated subset — and a *small* one against the tens of
  thousands of anime TMDB knows. It is recorded as what it is: exactly what the default
  provider carries.

No `capabilities` cell was promoted on the strength of this pass. The API evidences
*resolution and availability*, never *playback*, and those are different claims.

**Revision note (2026-09-21, fourth pass).** Two things happened this pass, and the
first is the most consequential correction in the document's history because it concerns
**the default provider**.

- **Frembed's `Playback: ✘` was wrong, and the cause was our own method.** Its gate has
  **two** steps (a landing play button, *then* a server choice) and the first pass took
  only one. With both taken, Korean `93405` S1E1 streamed on desktop *and* emulated
  mobile. The ✘ was a **measurement artifact**, not a provider failure — see correction
  3. This is the same class of error as the two already recorded, which is why it is
  recorded the same way rather than quietly overwritten.
- **⚠️ …and then it did not reproduce, which qualifies the bullet above.** Re-measured
  from a fresh context at the *direct* embed URL an hour later (so nesting is not the
  variable), the same gate reached the same player and the same asset — subtitle track,
  storyboard and JW Player entitlement all `200` — but **no HLS manifest was ever
  fetched**, with an ad stack the earlier run had not shown in that volume (**Connatix +
  Google IMA**) running into hundreds of requests. **Cause undetermined.** So the
  playback above is a **single-session observation, not a property**, and the honest
  summary of the default provider is *resolution verified twice, playback observed once,
  reproducibility unproven*. Full detail in correction 3; this is the one claim in this
  document that was committed and then narrowed by its own re-measurement.
- **Mobile behaviour was measured for the first time**, for three of the seven providers,
  on an **emulated** `390×844` viewport. All three played. The emulation caveat is real
  and is stated in the Method and Limits sections, because an emulated viewport is not a
  phone.
- This pass *does* evidence playback, so — unlike the third pass — it **can** promote a
  capability. `mobile` moves from `"unknown"` to `"yes"` for Frembed, SmashyStream and
  VidLink in `lib/providers.ts`; everything else stays `"unknown"`, because four
  providers were still not measured on mobile at all.
- **Frembed's `playbackObserved` stays `"unknown"` even though it was observed to play.**
  That is deliberate, not an oversight: the flag is contractually reserved for a direct
  media-element read, and Frembed's cross-origin player makes that impossible. The
  evidence lives in this document instead of loosening the guard — see correction 3.
- **One product question is left open rather than answered.** Frembed's own server list
  offers `Voe`, `Dood` and `Uqload`. The first two are the providers removed from Moveo.
  See the Pending list; it needs a human decision, not more measurement.

## How to read this

| Mark | Meaning |
|------|---------|
| ✅ | Observed directly, with the evidence named in the cell or in the notes |
| ✘ | Observed to fail, with reproducible evidence |
| — | **Not measured.** Deliberately left blank rather than inferred |
| pending | Research in flight; a placeholder that will be filled, not a conclusion |

Two rules were applied throughout, both from the task brief:

- *"A provider that only returns a 200 page is NOT automatically a working player."*
- *"Do not claim a provider is 'dead' without reproducible evidence."*

So `Playback` is only ✅ where media was actually seen being decoded. Where a provider
resolved the title but no media appeared, that is recorded as **"not observed"**, never
as "does not work" — see the measurement limits below, which are real and material.

## Method

- **HTTP layer** — `curl` (Windows Git Bash, `--ssl-no-revoke`) against the exact URLs
  produced by the real `buildProviderUrl()`, five content classes:
  movie `550`, western TV `1396` S1E1, Korean TV `93405` S1E1, anime series `1429` S1E1,
  anime movie `129`.
- **Browser layer** — the **production** player at `www.moveo.blog` in an isolated
  browser context, sources selected through the real UI (manual selection, i.e. the
  authoritative path), observing the frame URL, the frame's own accessibility tree,
  page console, and the network log (filtered to `document`, `xhr`, `fetch`, `media`).
- **Media-element layer** — for playback and for season 0, the deciding evidence is a
  direct read of the `video` element inside the frame: `readyState`, `paused`,
  advancing `currentTime`, `duration`, and **`videoWidth`/`videoHeight`**, which are
  non-zero only once frames are actually decoded. This is stronger than any HTTP signal
  and stronger than a network log, which misses MSE/`blob:` sources entirely.
- **Cross-origin players** — where the player sits on a **different origin from the
  frame we create** (Frembed's is on `jamesbornmain.com`), the `video` element cannot be
  reached from script at all, on any viewport. For those the evidence is instead:
  (a) the **accessibility tree**, which does cross the boundary; (b) the **network log
  for the segment sequence**; and (c) **two screenshots seconds apart**, compared for
  frame change. Cells measured this way say so, rather than implying an element read
  that was not possible.
- **Mobile layer** (new this pass) — a **390×844 viewport at device-pixel-ratio 3 with
  `mobile`+`touch` enabled, plus an Android 14 / Chrome 122 user agent**, applied by
  DevTools emulation and then **reloaded** so load-time device gates re-run. This is an
  *emulated* viewport, **not a real device**: it changes layout and what the provider
  chooses to serve, but not the radio, the OS media stack, or the real touch pipeline.
  Every mobile cell below is therefore "emulated mobile", and is labelled as such.
- **TLS** — `openssl s_client` to read the presented certificate.

Date of measurement: **2026-09-21**. Vantage point: a single desktop network in one
country. This matters; see "Limits".

## Schema

Seventeen fixed dimensions per provider, so the columns are comparable across providers.
The table is transposed (dimensions as rows) purely so it stays readable with seven
providers side by side; the schema is the one below, not an ad-hoc list.

`identity · integration status · URL generation · HTTP availability · frameability ·
redirect chain · browser frame load · playback observed · season/episode support ·
subtitles & language · movie coverage · western TV coverage · korean drama coverage ·
anime series coverage · anime movie coverage · mobile behaviour · stability`

---

## Grid

| Dimension | Frembed | SuperEmbed | VidSrc.to | VidSrc.me | 2Embed | SmashyStream | VidLink |
|---|---|---|---|---|---|---|---|
| **Identity** | `frembed.surf` | `multiembed.mov` → `streamingnow.mov` | `vidsrc.to` | `vidsrc.me` → `vidsrc.sh` | `www.2embed.cc` | **`anyembed.xyz`** (moved 2026-09-21 from `player.smashy.stream`) | `vidlink.pro` |
| **Integration status** | ✅ **public JSON API; surface enumerated and behaviour measured 2026-09-21** (index + `movies`/`tv`/`anime`). Its own docs page is reported to disclaim licensing **[D]** | — none found | — none found | — none found | — none found | — none found | ✅ publishes embed grammar |
| **URL generation** | ✅ `/embed/movie/{id}`, `/embed/serie/{id}?sa=&epi=` | ✅ `/?video_id=&tmdb=1[&s=&e=]` | ✅ `/embed/movie/{id}`, `/embed/tv/{id}/{s}/{e}` | ✅ `/embed/movie?tmdb=`, `/embed/tv?tmdb=&season=&episode=` | ✅ `/embed/{id}`, `/embedtv/{id}&s=&e=` | ✅ **`/embed/tmdb-movie-{id}`, `/embed/tmdb-tv-{id}-{s}-{e}`** | ✅ `/movie/{id}`, `/tv/{id}/{s}/{e}` |
| **HTTP availability** (5 classes) | ✅ 5/5 × 200 | ✅ 5/5 (302→200) | ✅ 5/5 × 200 | ✅ 5/5 (301→200) | ⚠️ 4/5 200; western TV timed out once (`ERR28`), 200 on retry | ✅ **5/5 × 200 after the move** (was ✘ 0/5 on the old host — TLS hostname mismatch; see below) | ✅ 5/5 × 200 |
| **Frameability** | ✅ no `X-Frame-Options`, no `frame-ancestors` seen | ✅ same | ✅ same | ✅ same | ✅ same | ✅ **same, at the new host** | ✅ same |
| **Redirect chain** | 200 → nested **same-origin frame** `frembed.surf/series?id=…` (200) | **302** `multiembed.mov` → `streamingnow.mov/?play=<base64>` (200) | 200 → nested frames `vsembed.ru` (200) → `cloudorchestranova.com` (200) | **301** `vidsrc.me` → `vidsrc.sh` (200); then nested `cloudorchestranova.com` | 200, no redirect | **301** `player.smashystream.com` → `anyembed.xyz/embed/…`; hop deliberately **skipped** (we frame the final target) | 200, no redirect |
| **Browser frame load** | ✅ Korean, anime series, anime movie | ✅ loads — but see Playback | ✅ Korean | ✅ Korean | ✅ Korean | ✅ **movie, TV, and season 0** | ✅ Korean, anime series, anime movie |
| **Playback observed** | ⚠️ **observed ONCE — desktop AND emulated mobile** (Korean `93405` S1E1), then **NOT reproducible an hour later**. **Corrected this pass; the previous ✘ was a measurement artifact — see correction 3.** Needs a **two-step gate**: click the landing play button, *then* choose a server (`Voe` / `Dood` / `Uqload`); the first pass stopped after step one. When it worked: HLS `master.m3u8` → variant playlist → **`seg-1…seg-7` `.ts` fetched sequentially, all 200**, and two screenshots 8 s apart show different frames. On re-measurement the player mounted, resolved the correct asset (subtitle track, storyboard, JW Player entitlement all 200) and then **fetched no manifest at all** — read this cell as a single-session observation, not a property; see correction 3. The player is **cross-origin** (`jamesbornmain.com`), so no element read was possible. Anime series still not observed | ✘ **not observed**. Renders an ad landing page, not a player | ✘ not observed in ~14 s (its own `Play` clicked) | ✘ not observed | ✘ not observed (ad layer) | ✅ **movie AND TV, measured on the media element**: `/embed/tmdb-movie-550` → *Fight Club*, duration **8348.4 s** (= 2:19:08, the film's real runtime), `readyState 4`, `paused=false`, **1280×534 decoded**; `/embed/tmdb-tv-1396-1-1` → *Breaking Bad - Pilot*, **3479.9 s** (= 57:59), `1280×720` | ✅ **Korean 93405 S1E1 and anime series 1429 S1E1** — DASH manifest + init segments + 14 sequential media chunks, streaming progressively |
| **Season / episode** | ✅ renders `Saison` / `Épisode` + `S1 E2` next-episode + `ÉPISODES` / `SERVEURS` | — | ✅ provider frame titled `Squid Game 2021 · S01 E01` | ✅ same upstream, same title | ✅ renders `Squid Game (2021) (S01E01)` | ✅ renders the episode list; **season 0 resolves to the correct special** (see below) | ✅ `region "Video Player - Attack on Titan- S1 E1"` |
| **Subtitles & language** | renders a `VF` dub badge on series; no subtitle *menu* seen — **but a French subtitle track is fetched from inside the player** (`jamesbornmain.com/vtt/{id}_fr.srt`, 200) for Korean `93405`, found this pass. `version` remains the only language signal, and it is a per-item property | — | — | — | — | — (not measured) | ✅ **subtitle track fetched** (`.srt`) for Korean *and* anime; 3 audio streams in the DASH manifest |
| **Movie coverage** | ✅ resolves (`/api/films?id=129&idType=tmdb` 200; rendered title) | — | — | — | — | ✅ **resolves AND plays** (*Fight Club*) | ✅ resolves; anime movies ✘ (below) |
| **Western TV** | ✅ 200 | — | — | — | — | ✅ **resolves AND plays** (*Breaking Bad* S1E1) | ✅ 200 |
| **Korean drama** | ✅ resolves + renders `Squid Game` S1E1 (`/api/series?id=93405…` 200); **22 episodes enumerated** with `sa`/`epi`/`VF` via `/api/public/v1/tv/93405` | ✘ no player (ad page) | ✅ resolves | ✅ resolves | ✅ resolves | — (not measured) | ✅ resolves **and plays** |
| **Anime series** | ✅ resolves + renders `L'Attaque des Titans` S1E1 + `VF`; **104 of its enumerable anime titles are series** | — | — | — | — | — (not measured) | ✅ resolves **and plays** (+ subtitles) |
| **Anime movie** | ✅ resolves + renders `Le Voyage de Chihiro` (`/api/films?id=129`); **42 anime films enumerated** | — | — | — | — | — (not measured) | ✘ provider self-declares `"We Couldn't Find This Content ."` |
| **Mobile behaviour** | ✅ **plays on emulated mobile — same single-session caveat as the playback row above** (`seg-1…seg-11` sequential `.ts` 200s + frame change). But the experience is ad-hostile: an **in-player interstitial** (`DÉPÊCHE-TOI !` / `GET BONUS`) with a stuck `0:00` countdown, **4 popunder tabs** opened during the session, `console.clear()` called repeatedly, and **Adscore bot detection** active | — (not measured) | — (not measured) | — (not measured) | — (not measured) | ✅ **plays — full element evidence**: `readyState 4`, `paused=false`, `640×360`, `5.094 → 10.098` over 5000 ms (**+5.004 s**), seek slider tracking. Required a click; the desktop pass autoplayed | ✅ **plays — full element evidence**: `1920×1080`, `3582.1 s`, three samples `8.611 → 13.614 → 18.627` (**+5.003 s**, **+5.013 s**). Caveat: the **on-screen `Play` buttons did not start it** under emulated input; the element's own `play()` resolved and ran. A **popunder to an adult-dating site** (`sexymeet.tv`) opened in the same context |
| **Stability** | intermittent: 7/8 curl attempts 200, 1 connect timeout; one duplicate `ERR_ABORTED` frame request on first mount | poor: Cloudflare Turnstile (`Error: 600010`) retry-looping inside the frame | — | — | one curl timeout (western TV), 200 on retry | ✅ **stable across movie, TV and specials probes**; not yet observed over time | ✅ stable across two titles; not yet observed over time |

---

## Corrections to the first pass

The first two were failures recorded in the first pass that, on re-measurement, were
**readings of the wrong thing** — which is exactly the error this document exists to
catch. The third is the same class of error found this pass, on the default provider.

### 1. SmashyStream was never a dead provider. It moved.

The first pass recorded `player.smashy.stream` as a TLS failure and left the remediation
(move vs. remove) deliberately open. The measurement that closes it:

- The old host presents a certificate whose subject is `CN=tools.anyembed.xyz` — a
  **hostname mismatch**, so no standards-compliant client can load it (`curl`
  `http_code=000`; Chrome `chrome-error://chromewebdata/`). Two independent clients
  agreed, so it was reproducible. **We do not bypass TLS verification**, so there was no
  client-side fix — correct.
- But the provider did not die: `player.smashystream.com` and `embed.smashystream.com`
  both **301 → `anyembed.xyz`**, and the redirector translates **exactly** the path
  shapes our entry used to build (`/movie/{id}` → `/embed/tmdb-movie-{id}`,
  `/tv/{id}?s=&e=` → `/embed/tmdb-tv-{id}-{s}-{e}`). Translating our exact grammar is
  what identifies it as the *same service* rather than a namesake.
- Because the final target is now known, the hop is **skipped** — the same choice already
  made for `frembed.work` — so one origin suffices in `frame-src`.
- Apex `anyembed.xyz` returns **451 Unavailable For Legal Reasons**; the `/embed/*` paths
  answer 200 and are frameable.

**Remediation applied:** `lib/providers.ts` now builds against `anyembed.xyz`, and
`next.config.ts` `frame-src` swapped `player.smashy.stream` → `anyembed.xyz`. The
provider **name** was deliberately left as `SmashyStream`, so `STORABLE_SERVERS` is
unchanged and a user whose stored `preferredServer` is `"SmashyStream"` keeps their
preference — and now gets a working player instead of an error page, with no migration.

### 2. Season 0 (specials) is real — and our own code was rewriting it

Found while measuring the dimension the first pass had left blank. The HTTP layer could
**not** answer it: every provider returned byte-identical shells for `s=0` and `s=1`
(3370 B / 65213 B / 19476 B), because these are client-rendered SPAs whose season lives
in the URL. Only the browser layer decides it:

| Request | Document title the provider rendered |
|---|---|
| `/embed/tmdb-tv-1396-1-1` | `Breaking Bad - Pilot` |
| `/embed/tmdb-tv-1396-0-1` | `Breaking Bad - Good Cop / Bad Cop` |

"Good Cop / Bad Cop" **is** that show's season-0 episode 1, so the provider understood
`0` and resolved the correct special. It then reported
`116 SOURCES · 80 SERVER + 36 BROWSER … checked` and found no source carrying it — a
provider **content** gap, surfaced honestly by the player's own error state.

**That made a bug in our code visible.** Every provider's URL builder shared one
normaliser requiring `n > 0` for season *and* episode, so **season 0 was silently
rewritten to season 1**: a user who picked *Hors-série → E1* on the TV page was served
**S1E1** — the pilot instead of the special. Wrong content, but plausible-looking, so
nothing signalled the substitution. Season and episode now normalise separately
(`toSeasonNumber` accepts 0; `toPositiveInt` still rejects it for episodes, which are
1-based), and `components/VideoPlayer.tsx` uses `season ?? 1` rather than `season || 1`
so the Sibnet path does not swallow 0 either.

Verified in production after deploy: selecting *Hors-série* on `/tv/1396` now produces
iframe `https://frembed.surf/embed/serie/1396?id=1396&sa=0&epi=1` (was `sa=1`), with
`document.title` = `Breaking Bad S0E1 - Moveo`.

Note the shape of this finding: a **provider capability** was withheld from users by a
bug on our side, and the honest reading of "season 0 does not work" would have been
wrong. The `capabilities` record in `lib/providers.ts` encodes this as
`specials: "yes"` for SmashyStream — measured, not assumed.

### 3. Frembed's desktop ✘ was a measurement artifact — its gate has two steps

The first pass recorded Frembed — **our current default** — as "resolves but playback not
observed", and the notes above said the click on its player surface "produced no media".
Re-measured this pass, **Frembed plays**, on both desktop and mobile. The earlier reading
was wrong, and the reason is worth recording because it is the failure mode this
document exists to catch.

**The gate has two steps, not one.** After the frame settles there is a landing poster
with a large unnamed play `button`. Clicking it does **not** start a player; it opens the
provider's own `SERVEURS` list. Only after a server is chosen does a player mount. The
first pass stopped after step one — it clicked, saw no media, and concluded "not
observed". The evidence that resolves it:

| Step | Observation |
|---|---|
| 1. Click the landing play button | `SERVEURS` panel opens, listing **`Voe`**, **`Dood`**, **`Uqload`** for `93405` S1E1 |
| 2. Select `Voe` | Frame `jamesbornmain.com/e/n1cybk52mxzz` mounts, titled `Watch Squid.Game.S01E01.FRENCH.720p.WEB.x264-LAZARUS.mkv - VOE` |
| Metadata | The player announces `59 minutes, 42 seconds` (= 3582 s) — matching the duration SmashyStream and VidLink independently report for the same episode |
| Media | HLS: `master.m3u8` → `index-v1-a1.m3u8` → **`seg-1` … `seg-7` `.ts` fetched sequentially, all 200**, from `*.cloudwindow-route.com` |
| Frames | Two screenshots 8 s apart show **different frames of the same scene** (the playground sequence), i.e. decoding and advancing |

Two independent readings agree, so the *observation* is sound for that title at that
moment. The `video` element itself is **not** readable here — the player is cross-origin
(`jamesbornmain.com`), so the element-level evidence used for SmashyStream and VidLink is
unavailable. The screenshot-pair plus segment-sequence method is what replaces it, and
the grid cell now says which was used rather than implying the stronger one.

#### It did not reproduce an hour later — read the claim as one session, not a property

**Added after re-measurement, same day, and it qualifies the paragraph above.** The gate
was taken again from a fresh isolated context at the **direct** embed URL
(`frembed.surf/embed/serie/93405?id=93405&sa=1&epi=1`) — i.e. without Moveo in the path,
so nesting is ruled out as the variable. The result was **not** playback:

- The **stream resolution is live and correct**: `GET frembed.surf/api/stream?type=serie&
  tmdb=93405&sa=1&epi=1&server=id:102954` → `302`, a redirect chain through
  `tracylocalschool.com` → `eugenemakedraw.com` → `johnfullwonder.com` →
  `katherineschoolphone.com`, landing on **`jamesbornmain.com/e/n1cybk52mxzz` → 200** —
  the **same host and the same asset id** the table above records.
- The player shell loads and **resolves the right asset**: `jwplayer.js` 8.49.5,
  `jamesbornmain.com/vtt/n1cybk52mxzz_fr.srt` → **200** (the French subtitle track first
  recorded in the third pass), `engine/storyboard/n1cybk52mxzz` → 200 and its
  `_storyboard_L2.jpg` sprite, and `entitlements.jwplayer.com/…` → 200.
- **No HLS manifest and no segment was fetched**, across a 25 s window, with
  `/api/stream` retried **three times**. That is where it stops.

What sits in that gap is an ad stack that had not previously been recorded as part of
this player: **Connatix** (`cd.connatix.com/identity.js`, `capi.connatix.com/core/sync`)
and the **Google IMA** SDK (`imasdk.googleapis.com/js/sdkloader/ima3.js`), i.e. a pre-roll
auction that must settle before content. The auction's user-sync traffic ran into the
**hundreds** of requests, against roughly 140 total on the earlier, successful run.

**The cause is undetermined and is recorded as such.** The hypothesis — that the pre-roll
auction (Connatix/IMA) never settles in a script-driven browser, so the player waits
forever and never requests the manifest — is consistent with everything observed but is
**not** proven. Two things observed in the same window make a bot-gate plausible and are
worth naming without dressing them up as a conclusion: `cdn.show-sb.com/sb/notifications/
utility/default/robot/4/index.html` carries **`robot`** in its path, and
`spendsdetachment.com/sbar.json` receives **high-entropy client hints**
(`architecture: x86`, `bitness: 64`, `brands: [{brand: Google Chrome, version: 153}]`) —
a fingerprint an automated browser reports differently from a real one.

**How to read the claim, therefore.** The playback in the table above is a **single-session
observation**, not a reproducible property of the provider. It should not be cited as
"Frembed works" without qualification, because on a second attempt an hour later it did
not, and the reason is not known. This is the same weakness already listed under
*Stability over time* in the limits — one session is not a trend — and it now has a
concrete instance rather than a hypothetical one. It also means the honest summary of the
default provider is: **resolution verified twice, playback observed once, reproducibility
unproven.**

**Consequence for the document, and for the product.** The sentence that stood in the
per-provider notes — *"Because Frembed is the default source, 'resolves but playback not
observed' remains the single most important open question in this document"* — is
**partly answered**: the provider is not broken, and it does resolve and mount a working
player for the right asset. But the answer is **not** "the default provider works", which
is what this paragraph said before the re-measurement below. What can be defended is
narrower, and the sentence that follows should be read with that qualification: resolution
verified twice, playback observed once, reproducibility unproven.

**A second finding, which is a product fact rather than a measurement.** The server list
Frembed itself offers for this episode is **`Voe`**, **`Dood`**, **`Uqload`**. VOE and
Dood were removed from Moveo as *selectable providers*; they are nonetheless live as
*servers inside Frembed*, which is the default. So the removal is a decision about our
own registry and UI, **not** a claim that users never reach that infrastructure. Nothing
here argues for restoring them — the brief is explicit that they stay removed — but the
document should not imply a separation that does not exist.

**Why the registry still says `playbackObserved: "unknown"` for Frembed.** This is the
one place where the document and `lib/providers.ts` deliberately disagree, so it is
spelled out here rather than left to look like an oversight.
`tests/providers.test.ts` reserves `playbackObserved: "yes"` for providers measured by a
**direct media-element read** — `readyState 4`, advancing `currentTime`, non-zero video
dimensions — and asserts that only SmashyStream and VidLink may claim it. Frembed
*cannot* meet that bar, because its player is cross-origin and the element is unreachable
from script on any viewport. The evidence above is strong but it is a **different class**,
and the honest options were to widen the flag or to leave it alone.

**It was left alone.** Relaxing a guard so that a new result fits is the failure mode
this document exists to catch, and the flag means what its test says it means. The
finding is therefore recorded here, in full, and the machine-readable field stays
conservative. Read that `"unknown"` as *"not measured by the standard this field
denotes"* — **not** as *"we do not know whether it plays"*. We do know.

---

## Frembed's public API — measured surface (2026-09-21, third pass)

The first pass recorded `/api/public/v1/anime` as a **[D]** claim: seen referenced,
never called. It was called this pass. The whole surface was enumerated, and this
section records what answered.

### The index is the authority — guessing endpoint names produces 404s

`GET https://frembed.surf/api/public/v1` returns the API's own index:

```json
{"status":200,"api":"Frembed Public API","version":"v1",
 "docs":"https://frembed.surf/api-docs",
 "endpoints":{"movies":{"list":"https://frembed.surf/api/public/v1/movies",
                        "get":"https://frembed.surf/api/public/v1/movies/{id}"},
              "tv":{"list":"https://frembed.surf/api/public/v1/tv",
                    "get":"https://frembed.surf/api/public/v1/tv/{id}"}}}
```

Probing plausible names instead is actively misleading: `/api/public/v1/movie`
(singular) 404s while `/movies` answers 200. Guessed names that do **not** exist —
each returned 404, and each is recorded here so nobody re-probes them expecting a
different answer: `kdrama`, `drama`, `serie`, `series`, `film`, `movie`,
`catalogue`, `search`.

### Measured behaviour

| Request | Result |
|---|---|
| `GET /api/public/v1/movies` | 200, JSON, 4842 B |
| `GET /api/public/v1/movies/550` | 200, `result.total: 1`, one item: *Fight Club*, `version: "TrueFrench"`, `quality: "HD"`, `link: /embed/movie/550` |
| `GET /api/public/v1/tv` | 200, JSON, 3571 B |
| `GET /api/public/v1/tv/1396` | 200, JSON, 9885 B (Breaking Bad) |
| `GET /api/public/v1/tv/93405` | 200, JSON, 3445 B — **22 episodes**, each with `sa`, `epi`, `version: "VF"` and a ready-made `link` |
| `GET /api/public/v1/anime` | 200, JSON, 4154 B — `page: 1`, `totalPages: 8`, `perPage: 20`, `total: 146` |
| `?type=tv` | **honoured** — `total` becomes 104, items all `type: "tv"` |
| `?page=2..8` | **honoured** — the 8 pages yield exactly 146 items, no duplicates |
| `?search=…`, `?version=…` | **no effect observed** — byte-identical response (4154 B) to the unfiltered call |

The `search` row is worth flagging rather than glossing. A parameter that looks like it
should work and silently does not is the exact shape of defect this project was already
bitten by once (the season-0 coercion, above). It is recorded as "no effect observed"
at one request each, **not** as "does not exist": a single probe per parameter cannot
distinguish "ignored" from "matched nothing".

### Anime coverage, enumerated

All 8 pages were fetched and parsed: 146 items, 146 distinct TMDB ids, no duplicates.

| Field | Distribution |
|---|---|
| `type` | `movie` 42, `tv` 104 |
| `version` | `VF` 96, `TrueFrench` 33, `French` 7, `VOSTFR` 4, null 6 |
| `quality` | `HD` 39, null 107 |

**The `link` grammar is ours.** Every item carries a `link`, and the two shapes are
exactly what `lib/providers.ts` builds:

```
104 x https://frembed.surf/embed/serie/{tmdb}?sa={s}&epi={e}
 42 x https://frembed.surf/embed/movie/{tmdb}
```

One difference, recorded rather than "fixed": our series URL carries an extra `&id=`
parameter (`/embed/serie/93405?id=93405&sa=1&epi=1`). That is not our invention — it
is what the provider's own `/api/serie.php` redirector emits in its `Location` header
(first pass). The API's canonical form omits it. Both are in use by the provider
itself, so neither is corrected here; the API is evidence that the shorter form is
canonical, not that the longer one is wrong.

**The number is 146, and it stays 146.** That is the entire anime catalogue of our
default provider: a real, enumerated subset and a small one. It is not a claim that
anime is covered — it is a count of exactly what is.

### What this pass deliberately did NOT do

**No availability probe was built on these endpoints.** They would make an obvious
availability primitive — `result.total: 0` is a direct, honest answer to "does the
default provider carry this title?" — but wiring one up is constrained by the
integration brief in two ways a surface measurement does not resolve:

- *"Do NOT use a server-side HTTP probe as the sole authority"* on whether a source
  works. The API evidences catalogue membership, not playability.
- *"A late asynchronous availability result must never overwrite a user-selected
  provider."* Any probe is therefore a hint shown alongside the sources — never a
  gate, never a selector.

Recorded as an identified option with its constraint, deliberately unimplemented.

### The docs page, and a boundary that was respected

The index advertises `docs: https://frembed.surf/api-docs`. That URL was requested;
the page is real — not JavaScript-gated, not an error page. Two facts about it are
recorded with **[D]** provenance, because they are reported to us rather than read
first-hand by us:

- **[D]** The page's own footer is reported to state that the content it distributes
  is **unlicensed**.
- **[D]** The page is reported to document **no parameter that selects audio
  language or subtitles**; the only language-related field in its payloads is the
  per-item `version`.

The tool that surfaced those facts then declined to convert the page into an
endpoint-and-parameter integration spec. **That refusal was not routed around**: no
attempt was made to extract a parameter reference from the page by another means.
The `[D]` label is doing exactly the job it was defined for — these are leads, not
findings, and they are labelled as leads.

One related thing *is* measured, and it narrows the language question rather than
answering it: `?version=` had **no effect**, so even the `version` value that appears
on every item is not selectable by query parameter. The honest position on language
is therefore unchanged from the second pass — a per-item `version` field is a
property of that item, not a user-selectable option.

---

## Integration status — the classification

Recorded here rather than in the grid so the table stays comparable. **Provenance
matters and is stated per claim:**

- **[M]** = measured by us in this review, with the evidence above.
- **[D]** = reported by a documentation/legal review pass. **Not independently
  re-verified in-session.** Treat as a lead to check before relying on it.

No provider in this list is *officially documented and licensed* in the sense the brief
means. Every one is a **third-party aggregator whose licensing position is unclear**, and
none publishes the terms a licensed integration would require. That is a product risk
that exists independently of whether the embeds work.

| Provider | Public embedding/API documentation | Classification |
|---|---|---|
| **Frembed** | ✅ Publishes an HTTP API surface (`/api/film.php`, `/api/serie.php`), and a **complete public JSON API that was enumerated this pass** (`/api/public/v1` + `movies`/`tv`/`anime`) **[M]**. It advertises its own docs page, whose footer is **reported** to state the distributed content is unlicensed **[D]**. | Third-party aggregator, unclear licensing — **and now the strongest single lead available on that question, since the provider's own documentation is reported to disclaim it.** The only provider we have measured to resolve **all four** content classes including Korean *and* anime. **Currently the default.** |
| **SuperEmbed** | — None found **[D]**. | Not appropriate for integration as-is: measured to display **adult advertising** inside our player **[M]**, and its own anti-bot gate (`Error: 600010`) was retry-looping. |
| **VidSrc.to** | — None found **[D]**. Reported to **deny anime support publicly** **[D]** — not independently verified. | Third-party aggregator, unclear licensing; reported to appear in the MPA's 2 Oct 2024 USTR filing **[D]**. |
| **VidSrc.me** | — None found **[D]**. | Same upstream player as VidSrc.to **[M]**; same classification. |
| **2Embed** | — None found **[D]**. | Third-party aggregator, unclear licensing; same reported USTR filing **[D]**. Its `embedtv/{id}&s=&e=` shape is the provider's own working format **[M]**. |
| **SmashyStream** | — None found **[D]**. | Third-party aggregator, unclear licensing. Destination host changed 2026-09-21 **[M]**. |
| **VidLink** | ✅ Publishes an embed URL grammar, including a reported `/anime/{MALid}/{number}/{subOrDub}` **[D]** — not independently verified. | Third-party aggregator, unclear licensing. The only provider where we measured playback for **Korean and anime**, with subtitles **[M]**. Loads a fingerprinting module (`fu.wasm`) and monetises via ad exchanges **[M]**. |

**No provider in this review publishes any K-drama claim at all**, in either column.
Korean coverage is therefore **measured-only** for us. Three providers have now been
measured to actually *play* Korean content — **Frembed**, **SmashyStream** and
**VidLink** — and all three independently report the same **3582 s** runtime for
`93405` S1E1, which is mutual corroboration that each is serving the same real episode
rather than a placeholder.

---

## Per-provider notes

### Frembed — the current default (`DEFAULT_PROVIDER_NAME`)

- Resolves **all four** content classes tested by TMDB id, including **Korean drama**
  and **anime** (series *and* movie). This is the broadest resolution observed of any
  provider here.
- **The only provider in this review with a structured public API, and it was fully
  enumerated this pass** — see the section above. Its anime catalogue is 146 titles
  (42 films, 104 series) and its Korean resolution is **per-episode**: `tv/93405`
  enumerates 22 episodes of *Squid Game* with `sa`/`epi` and `VF`. Its `link` values
  use our exact URL grammar, which is independent corroboration of `buildUrl()`.
- Its `version` field is the only language signal available anywhere in this review,
  and it is a **per-item property, not a selectable option** (`?version=` had no
  effect). Nothing observed here supports labelling a source with a language it has
  not been shown to carry.
- Its nested film/series page renders the real title, `Saison`/`Épisode`, a `VF` badge,
  and `SERVEURS` / `ÉPISODES` / `S1 E2` controls.
- ~~**Playback was not observed.**~~ **Corrected this pass — Frembed plays, once.** The
  first pass clicked the landing play button, saw no media, and stopped; the gate is
  **two steps** (play button → choose a server). With both steps taken, Korean `93405`
  S1E1 streamed on **desktop and emulated mobile**. **But it did not reproduce on
  re-measurement the same day** — the player mounts and resolves the right asset, then
  fetches no manifest. Single-session observation, not a property; cause undetermined.
  Full evidence and the qualification in correction 3 above.
- **Its own server list is `Voe`, `Dood`, `Uqload`.** The first two are the providers
  removed from Moveo. They are removed from *our registry*, and that stands — but they
  remain live as servers *inside Frembed*, which is our default. The document should not
  imply a separation that does not exist.
- **It plays inside a VOE player on a rotating third-party host.** The frame is
  `jamesbornmain.com/e/<id>`, titled `Watch Squid.Game.S01E01.FRENCH.720p.WEB.x264-LAZARUS.mkv - VOE`.
  A **French subtitle track** (`/vtt/<id>_fr.srt`) and a storyboard sprite
  (`/engine/storyboard/<id>`, `/cache/<id>_storyboard_L2.jpg`) are fetched from there.
  Segments come from `*.cloudwindow-route.com` — note the **CDN host differs per session**
  (`…n3kwtioe2pixndjhqm…` on the mobile run, `…n3llbaa8r4vvm8ea9r…` on the desktop run),
  so no host from this chain can be pinned in a CSP.
- **Popunders are real and reproducible.** The first pass saw a `mega.nz` tab after a
  click; this pass opened **four more** — `worldofseabattle.com` (a CPA game offer), a
  `youtube.com/watch` page, a `.cyou` domain that failed to load, and
  `displayendpointstarring.com` (a VAST endpoint). The click precedes the popup in every
  case, but the opener was not captured, so **the mechanism is still an observation, not
  a proven attribution**.
- **It actively clears its own console** — `console.clear()` was called repeatedly (7, 8,
  15 and 13 times in the same session), and **Adscore** ("Bot and proxy detection by
  Adscore.com") runs on the page. Neither is anything we should try to defeat; both are
  recorded because they explain why this provider is harder to measure than the others.
- Because Frembed is the default source, its playback status mattered more than any other
  cell in this document. It is now **closed, in the provider's favour.**

### SuperEmbed (`multiembed.mov`)

- `302` → `streamingnow.mov/?play=<base64 payload>`. This is a **real HTTP redirect of a
  frame we create**, which is why `streamingnow.mov` must be in `frame-src` (Chrome
  re-checks the policy against the redirect target). It is.
- The frame loads, but its content for Korean `93405` S1E1 is an **ad/affiliate landing
  page**: `sexymeet.tv` (an adult webcam service) reached via `predictivdisplay.com/jump`
  and `trkclks.com/pixel`. Still no player after 25 s.
- Console showed `[Cloudflare Turnstile] Error: 600010` retrying repeatedly inside that
  frame. We do not bypass anti-bot challenges, so this is recorded as the provider's own
  gate failing, not as a defect we should route around.
- **Product-safety finding:** framing this provider can display **adult advertising**
  inside our player. That is true regardless of whether playback ever succeeds, and it is
  now encoded as `capabilities.adultAdvertising: "yes"` in `lib/providers.ts`.

### VidSrc.to and VidSrc.me — the same upstream

- Both reach the same player backend: `cloudorchestranova.com/embed/tv/{id}/{s}/{e}?vs=…`,
  and both declare the resolved title as `Squid Game 2021 · S01 E01`, with a `Play`
  control. VidSrc.me goes through a `301` to `vidsrc.sh`.
- **These successor origins are nested frames created by the provider's own document,
  not HTTP redirects.** That distinction is why `vsembed.ru` and `cloudorchestranova.com`
  are *not* in our `frame-src` list and yet render correctly: `frame-src` governs only
  the documents **our** page creates. (The `streamingnow.mov` case above is the opposite
  situation and does need its entry.) This corrects an earlier reading of the CSP
  comment in `next.config.ts`, which implied all provider chains are redirects.
- Playback not observed within ~14 s of clicking `Play`.

### 2Embed

- The odd-looking `embedtv/{id}&s=1&e=1` (ampersand-joined, no `?`) **is** the provider's
  working format: its own page renders `Squid Game (2021)` with heading `(S01E01)`, so
  the path is parsed correctly. **This is not a bug in our `buildUrl()`** — an open
  question from the previous session is now closed.
- The player area is an `about:blank` iframe plus a redirect layer to
  `interlinecustomroofingllc.com`. No player, no media.

### SmashyStream — moved to `anyembed.xyz`; the one provider measured to play

- **Resolved.** The old host `player.smashy.stream` was unloadable for a TLS hostname
  mismatch (`CN=tools.anyembed.xyz`); the provider had moved. `player.smashystream.com`
  and `embed.smashystream.com` **301 → `anyembed.xyz`**, translating our exact path
  grammar, and the final target is frameable (200, no `X-Frame-Options`, no
  `frame-ancestors`, no CSP).
- **The strongest evidence in this entire review**, because it is a read of the media
  element rather than of a page or a log:
  - `/embed/tmdb-movie-550` → *Fight Club*, `duration 8348.4 s` (= 2:19:08, the film's
    exact runtime), `readyState 4`, `paused=false`, `currentTime` advancing,
    `videoWidth 1280` / `videoHeight 534` **decoded**.
  - `/embed/tmdb-tv-1396-1-1` → *Breaking Bad - Pilot*, `duration 3479.9 s` (= 57:59),
    `readyState 4`, `paused=false`, `1280×720` decoded.
  Both the correct **title** and the correct **episode** resolved. Non-zero video
  dimensions only occur once frames are decoded.
- Its source is a `blob:` MSE object, which is why a page-level network log shows **no
  media request** for this provider. That is a property of the measurement, not of the
  provider — and it is the reason no other provider is marked ✘ on playback.
- **Season 0 resolves correctly** — see the section above.
- **Korean and anime series both resolve *and* play** (measured after the grid's first
  pass had them blank). On the media element, same standard as above:
  - Korean `93405` S1E1 → title `Squid Game - Red Light, Green Light | AnyEmbed`,
    `readyState 4`, `640×360`, `duration 3582.204`, `paused=false`, `currentTime`
    advancing **+4.003 s over 4000 ms**.
  - Anime series `1429` S1E1 → title `Attack on Titan - To You, in 2000 Years: The Fall
    of Shiganshina (1) | AnyEmbed`, `readyState 4`, `1280×720`, `duration 1541`,
    `paused=false`, **+4.001 s over 4000 ms**.
  Both announced the correct episode in their own titles, which is the provider
  confirming the season/episode grammar rather than us inferring it.
- **Mobile: it plays.** `390×844` emulated viewport, `640×360`, `readyState 4`,
  `duration 3582.204` — the same runtime the other two providers report for this episode
  — with `currentTime` `5.094 → 10.098` (**+5.004 s over 5000 ms**) and the seek slider
  tracking. Unlike desktop, it did **not** autoplay: it sat `paused` until its `Play`
  control was clicked, which is standard mobile autoplay policy and not a provider fault.
- Subtitles/language support is still **not measured** for this provider — the one
  `— (not measured)` left in its row. An absent claim is a gap in the review, not a "no".

### VidLink — playback observed, with subtitles

- Korean `93405` S1E1 **and** anime series `1429` S1E1: `/api/b/{tv|movie}/<hash>/…`
  resolves, then a DASH manifest (`…_1_1_1080_h265/index_web.mpd`), `init-stream*.m4s`,
  and **14 consecutive `chunk-stream*-000NN.m4s` segments fetched over ~13 s** — that is
  progressive media streaming, i.e. playback. A **subtitle `.srt`** is fetched for both
  titles, and the manifest carries three streams (multiple audio tracks).
- It also exposes a real control surface (`Play`, `Mute` reported **`pressed`**, seek,
  `PiP`, `Fullscreen`) unlike Frembed's bare unnamed button.
- **But it does not have the anime movie.** For `129` its own frame renders
  `"We Couldn't Find This Content ."` / `"Please check back another time."` This is a
  self-declared negative, the strongest available form of negative evidence, and it is
  why the anime-movie row is ✘ rather than "unmeasured".
- **Mobile: it plays, at the highest quality of the three measured.** Same emulated
  `390×844` viewport: `1920×1080`, `duration 3582.1`, three samples
  `8.611 → 13.614 → 18.627` (**+5.003 s** then **+5.013 s** over consecutive 5000 ms
  waits), `paused=false`, `readyState 4`. Its player is also the most accessible of the
  three — a labelled `region` (`Video Player - Squid Game- S1 E1`), named controls with
  `k`/`m`/`i`/`f` shortcuts, and a real ARIA seek slider.
- **One honest caveat on that mobile run.** The on-screen `Play` buttons — both of them —
  did **not** start playback under emulated input. The element's own
  `HTMLMediaElement.play()` *did* resolve (so user activation was present and no autoplay
  policy blocked it) and the position then advanced in real time. I checked whether an ad
  layer was swallowing the clicks: `document.elementFromPoint` at the centre of the video
  returns the `VIDEO` element itself, and no large overlay link exists over the player.
  **So click-interception is ruled out, and the cause of the unresponsive buttons is
  undetermined** — recorded as such rather than guessed at.
- **An adult-dating popunder opened in this provider's context.** A tab to
  `sexymeet.tv` ("Live Random Video Chat") via a `trackdesk` affiliate link, plus an
  AliExpress affiliate, appeared in the isolated context where only VidLink was loaded.
  That is the **same class of advertising** already recorded for SuperEmbed and is the
  single strongest product-safety concern in this document after SuperEmbed's. As before,
  the opener was not captured, so the attribution is an observation.
- Loads a fingerprinting module (`vidlink.pro/fu.wasm`) and is monetised via
  `adexchangerapid.com` / `adsco.re`.

---

## Limits of this measurement — read before drawing conclusions

1. **"Playback not observed" ≠ "cannot play".** These players fetch segments inside
   **Web Workers** or via MSE in ways that do not always appear in a page-level network
   log. A provider with no visible media request may still be playing. The SmashyStream
   finding above is the proof of this: its `blob:` source produced exactly the empty
   network log that other providers show, while the media element was demonstrably
   decoding frames. This is the single largest caveat in this document, and it is why
   most providers are marked "unknown" rather than ✘.
2. **A click is required — and for one provider, two of them.** VidLink only began
   fetching after its `Play` control was activated, and Frembed only mounts a player
   after *two* steps (its landing play button, then a server choice). This is the
   documented reason the first pass got Frembed wrong: a single click was treated as the
   whole gate. Any remaining ✘ therefore means "no media after load, and after the
   interactions described", not "no media ever".
3. **One vantage point.** Single network, single country, single browser profile with
   extensions present. Geo-variance and ISP-level differences are invisible here.
4. **Narrow sample.** Browser-level tests cover: Korean `93405` S1E1, anime series `1429`
   S1E1, anime movie `129`, movie `550`, western TV `1396` S1E1, and — added this pass —
   Breaking Bad **season 0** on SmashyStream. Per-season and per-episode depth (later
   seasons, episode numbering past E1) was **not** measured, and season 0 was measured on
   **one** provider only. The season-0 fix in `lib/providers.ts` therefore applies the
   truthful value to all seven, but `capabilities.specials` is `"yes"` only for the one
   measured — the rest are `"unknown"`, which is the honest encoding.
5. **Mobile is now measured for three providers out of seven — and only by emulation.**
   The largest gap in this document has shrunk but has not closed: **Frembed**,
   **SmashyStream** and **VidLink** were each driven on an emulated `390×844` viewport
   with a mobile UA, and all three played. The other four remain `—`. And an emulated
   viewport is not a phone: it does not exercise the real media stack, the radio, or a
   real touch pipeline, and providers that fingerprint the device (Frembed runs Adscore;
   VidLink loads `fu.wasm`) may behave differently on real hardware. **Treat these cells
   as "here is what an emulated mobile client gets", not as device certification.**
6. **Unmeasured ≠ absent.** Every `—` cell is a gap in this review, not a claim.

## Cross-cutting observations made during the same sessions

These are not per-provider, but they came out of the same measurements and are worth
recording where they can be acted on:

- **Our CSP is not blocking anything in use.** Zero `Refused to frame` / CSP violations
  appeared in the console across every provider and title tested.
- **`/api/catalogue` is alive and correctly scoped.** `GET /api/catalogue?tmdb_id=129`
  returned **200** — and the **TV page never calls it**. The VOE/Dood removal did not
  break the `moveoFound` flow, which remains movie-page-only. *Superseded 2026-09-21: the
  flow was re-checked and the route deleted — see the resolved item below.*
- **Manual selection is authoritative, verified live.** A provider chosen in the UI was
  persisted to `localStorage.preferredServer` and applied after navigating to a different
  title, with no asynchronous availability result overwriting it.
- **Sibnet is honestly labelled.** `/api/sibnet` returns 200 for Korean and anime titles,
  and the UI still marks both entries `(Indisponible)` rather than implying availability.
- **Logged-out `401`s are expected.** `/api/auth/me` returns 401 twice per page for a
  logged-out visitor. Not a defect.
- **One duplicate aborted frame request on first mount.** The identical provider URL was
  requested twice, the first as `net::ERR_ABORTED`. Cause not established; recorded as an
  observation.
- **Provider frames pull heavy third-party ad/telemetry traffic** (`adsco.re`,
  `adexchangerapid.com`, `swiwetduchan.shop`, `*.qpon`, `crwdcntrl.net`, `clarity.ms`,
  `yandex`). It originates inside the provider's own document, not from our origin.
- **Three providers report the *same* runtime for the same episode.** `93405` S1E1 came
  back as `3582.204 s` (SmashyStream), `3582.1 s` (VidLink) and `59 minutes, 42 seconds`
  (Frembed's player, and the same again on mobile). Three independent implementations
  agreeing on a non-round number is much stronger evidence that all of them serve the
  real episode than any one of them alone — and it is the cheapest cross-check available
  for "is this actually the right content".
- **A media-element read is not always available, and the document should say when it
  was not used.** Frembed's player is cross-origin, so `video` is unreachable from script
  on *any* viewport. SmashyStream and VidLink expose it. Cells therefore name the method
  they rest on rather than all claiming the same standard.
- **Console wiping and bot detection are part of the measurement environment.** Frembed
  calls `console.clear()` repeatedly and runs **Adscore**; both are why its earlier ✘ was
  hard to interpret. **Neither should be defeated** — the brief forbids bypassing anti-bot
  systems, and the honest move is to record that the gate exists and what it costs.
- **Ad-tab spawning is common to the ad-monetised providers, and is not a defect in our
  integration.** Frembed opened four popunders in one session
  (`worldofseabattle.com`, a `youtube.com/watch` page, a `.cyou` domain, and
  `displayendpointstarring.com`); VidLink's context produced `sexymeet.tv` (adult dating)
  and an AliExpress affiliate; SuperEmbed's frame was an adult landing page outright.
  All of it originates **inside the provider's own document**. We do not proxy it, filter
  it, or hide it — but it is the reason a provider-level warning exists at all, and the
  reason `adultAdvertising` is a capability field rather than a footnote.
- **A provider capability can be withheld by a bug on our side.** The season-0 defect was
  found only because the season/episode dimension was measured per provider; the HTTP
  layer had shown nothing. This is the argument for measuring the remaining `—` cells
  rather than assuming them.

---

## Pending — not yet in this document

Named here so the gaps are explicit rather than implied by an empty cell. None of these
is a conclusion; each is work outstanding.

- ~~**Independent verification of the `[D]` `/api/public/v1/anime` claim.**~~
  **CLOSED 2026-09-21 (third pass)** — called, enumerated, and documented above. The
  endpoint is real and its 8 pages enumerate 146 anime titles.
- **`[D]` claims still unverified.** Narrowed, not closed. Still open: the reported
  MPA/USTR filing, and VidSrc.to's reported public denial of anime support. The
  reported VidLink `/anime/{MALid}/{number}/{subOrDub}` grammar was **probed and came
  back inconclusive** — see the VidLink note below. It is recorded as inconclusive
  rather than as either confirmation or refutation.
- **Documented embed parameters** per provider. Partly answered for Frembed only (its
  measured surface is above; `?search=` and `?version=` showed no effect). Still open
  for the other six, which publish no documentation at all.
- **The `&sub=fr` discrepancy — CLOSED as a dead-code question, not a behaviour
  question.** `lib/video-utils.ts` is confirmed to have **no importers anywhere** in
  the repository, so its `&sub=fr` is not reachable and cannot be affecting live URLs.
  It is dead code, not a competing implementation. (Same pass confirmed three further
  unimported modules: `lib/email.ts`, `components/CustomVideoPlayer.tsx`,
  `hooks/useAIRecommendation.ts`.) Whether the file should be *removed* is a
  separate decision and is not taken here.
- **Public reports of adult/malicious advertising** for the providers that surfaced them
  here, to determine whether the SuperEmbed observation is typical or an outlier.
  **Partly answered by direct observation this pass, and the answer is "not an
  outlier"** — but this item was about *reported* behaviour and that half is still open.
  What was observed first-hand: Frembed spawned 4 popunders in one session, VidLink's
  context produced an adult-dating tab (`sexymeet.tv`) and an affiliate, and
  `displayendpointstarring.com` (VAST) appeared. The brief asked whether SuperEmbed was
  typical; on this evidence, **aggressive and sometimes adult ad delivery is the norm
  across this whole class of provider**, not a SuperEmbed peculiarity. That strengthens
  the case for the provider-level warning rather than weakening it.
- ~~**Korean and anime coverage claims** from provider documentation.~~ **Partly
  closed:** Frembed publishes documentation and an API, and its anime catalogue is now
  enumerated. VidLink publishes an embed grammar but no catalogue. The other five
  publish nothing, so **there is still not a single published K-drama claim to compare
  against** — that half stays open, and it is the reason Korean coverage remains
  measured-only for us.
- ~~**Mobile behaviour** for every provider — still entirely unmeasured.~~ **CLOSED for
  three of seven, narrowed overall.** Frembed, SmashyStream and VidLink were all driven
  on an emulated `390×844` mobile viewport and **all three played**; full evidence is in
  the grid and the per-provider notes. Still open: SuperEmbed, VidSrc.to, VidSrc.me and
  2Embed — and the emulation caveat above applies to every cell, because none of this was
  run on real hardware.
- **A product question this pass surfaced, needing a decision rather than more
  measuring.** Frembed's own server list offers `Voe` and `Dood` — the two providers
  removed from Moveo. They are still reachable *through our default provider*. The brief
  is unambiguous that they are **not** to be restored as selectable providers, and
  nothing here suggests otherwise; but somebody should decide whether it is acceptable
  for the default source to reach them as its own internals, or whether the default
  should be re-examined. Recorded as an open product question, **not** as a defect.
- **Per-season / per-episode depth** — later seasons, episode numbering past E1, and
  season 0 on the other six providers. Partly de-risked for Korean: Frembed's
  `/api/public/v1/tv/93405` enumerates 22 episodes across its seasons, so the provider
  itself indexes beyond S1E1 even though we have not driven the player to one.
- **Stability over time** — the current column is a single session, not a trend. This is
  no longer hypothetical: Frembed's playback was observed once and **failed to reproduce
  an hour later** (correction 3). Until the underlying cause is identified, *every*
  playback claim in the grid is one observation deep, including the ones measured on the
  media element, because those were also taken in a single session.
- **Frembed's reproducibility** — specifically, whether the non-reproduction is the
  pre-roll ad auction (Connatix + Google IMA) not settling in a script-driven browser, a
  bot gate reacting to the automated environment (`show-sb.com/.../robot/…`,
  `spendsdetachment.com` client-hint fingerprinting), or a genuine provider-side change.
  Distinguishing these needs a real, human-driven browser session — the one thing this
  document's method cannot supply. **This is the highest-value open item**, because it
  decides whether the default provider works for users at all.
- **`/api/catalogue`'s remaining purpose — RESOLVED 2026-09-21. Re-checked, and the
  route is removed.** The re-check answered the question this item had left open, and the
  answer was that `moveoFound` describes nothing a user can act on, in **either**
  direction. `found: true` meant only that a row in the retired scraper database carried a
  non-null `voe_url`/`dood_url`; those links are dead and the tier is unsupported, so the
  flag **hid** the request button for titles whose only "availability" record was a dead
  link, and **showed** it for titles that play on the live providers, for a reason that had
  nothing to do with playability.

  Captured from production on 2026-09-21, minutes before the deploy that removed the
  route, with `?cb=<ts>` to defeat the CDN — four mainstream, definitely playable
  movies, every one of them reporting `found: true` on the strength of a VOE link:

  | Request | Response |
  |---|---|
  | `?tmdb_id=129` (*Spirited Away*) | `found:true`, `voe_url:"https://voe.sx/e/fdit6qn9rzbb"`, `dood_url:"https://dsvplay.com/e/9fnsm4helhxo"`, `lang:"VF"` |
  | `?tmdb_id=1184918` (*The Wild Robot*) | `found:true`, `voe_url:"https://voe.sx/e/tfh9pzt7nzr2"`, `dood_url:null`, `lang:"VF"` |
  | `?tmdb_id=693134` (*Dune: Part Two*) | `found:true`, `voe_url:"https://voe.sx/e/ofdl0snt5aib"`, `dood_url:null`, `lang:"VF"` |
  | `?tmdb_id=872585` (*Oppenheimer*) | `found:true`, `voe_url:"https://voe.sx/e/wiylqdnahfql"`, `dood_url:null`, `lang:"VF"` |

  So the movie-page request button was hidden for **every one of them** — the hide
  direction, 4 of 4, on the strength of a dead `voe.sx` URL. Two further readings from
  the same probe: the TV shape (`?tmdb_id=1399&season=1&episode=1`) answered
  **500 `{"error":"Internal Server Error"}`**, so that arm was already broken and is now
  moot; and the `dood_url` host is `dsvplay.com`, a domain that was not even among the
  twelve `frame-src` entries removed with the tier — the stored hosts had drifted past
  the list the CSP had been narrowed to.

  Verified **after** the deploy: `GET /api/catalogue?tmdb_id=129` → **404**; the movie
  page's XHR/fetch list contains no `/api/catalogue` call at all (26 requests, none of
  them it), where one fired on every mount before; its action row is now just
  `REGARDER · BANDE-ANNONCE` with no gap. The preserved half was exercised rather than
  assumed: with `preferredServer = "Sibnet VF"` stored on a title Sibnet cannot resolve,
  the player reaches `UNAVAILABLE` and renders its request CTA — *"Source indisponible /
  Cette source n'a pas pu être résolue"* alongside *"Demander ce contenu"* (the
  `t.details.requestEncoding` label; the English fallback reads "Demander l'encodage
  prioritaire") and *"Changer de source"*. On the same page the live default provider was
  serving the title correctly (`frembed.surf/api/films?id=129` → 200; the embed showing
  *Le Voyage de Chihiro* in **VF, HD**), which is the playability that `found: true` was
  standing in for. Console after the deploy: the two expected logged-out `401`s and no
  CSP violations.

  The same columns backed a worse defect in `POST /api/film-request`: it answered
  `already_available` from those dead links and returned early, so the request was **never
  queued** while the user was told the content was already there — a lost request
  presented as a satisfied one, plus a Discord notification asserting availability. Both
  paths are gone.

  What was **kept** is the feature, because it is genuine feedback and had already been
  rebased once: the player offers it from its `sourceUnavailable` state — the only
  condition the frontend can actually observe, "no source resolved for this title or
  episode" — and sends `type`/`season`/`episode`. Deduplication now rests on the meaningful
  current question, *has somebody already asked for this?*, answered against the request
  queue itself. The movie page's duplicate CTA and its `/api/catalogue` fetch were removed
  with it, which left the route with **no consumer at all** — the page read only `d.found`,
  and the URL fields it returned were read by nobody — so `app/api/catalogue/route.ts` was
  deleted. No schema, migration, queue or CSP change was involved.

  **Caveat, recorded rather than claimed away:** nothing inside this repository can prove
  that no *external* caller of `GET /api/catalogue` existed. If one did, it was already
  being served dead URLs; the route is recoverable from git history if such a caller
  surfaces.

## Anime grammar probes on the other providers — new, and still open

Two probes were run against the priority gap (anime) on providers other than Frembed.
Both are recorded with their limits, because neither is conclusive on its own:

| Probe | Result | Reading |
|---|---|---|
| `GET https://vidsrc.to/embed/tv/1429/1/1` (TMDB 1429 = *Attack on Titan*) | **200**, 2527 B | The provider answers for an anime series addressed by TMDB id. This is the *same* URL shape we already build for any series, so it is **not** evidence of anime-specific support — and it is specifically the claim the `[D]` column says VidSrc.to denies. What it establishes is that the endpoint does not refuse the request. |
| `GET https://vidlink.pro/anime/16498/1/sub` and `…/1/dub` | **200**, 13303 B — **byte-identical for `sub` and `dub`** | **Inconclusive, deliberately not claimed.** The grammar is accepted, but `sub` and `dub` returned the *same document*, so this page-shell measurement cannot show that the parameter selects anything. Resolving it needs a browser and a media-element read, which is exactly the method that settled season 0. Until then the reported grammar is neither confirmed nor refuted. |

The second row is the shape of result that is easiest to over-read: two 200s and a
plausible path. It is recorded as inconclusive because the two responses were
indistinguishable, which is the whole point of measuring rather than assuming.

---

## Public error-message disclosure — audited as a class, and its scope is narrower than it looked

The `{ error: error.message }` pattern was audited across all of `app/api/**` rather than
only at the one instance fixed in `app/api/admin/sections`, because the question there was
whether it was a pattern. It was — 26 return sites over 14 files. But the *severity* of
almost all of them turned out to be much lower than the sections one, and establishing
that was the point of the pass.

**Scope, measured rather than assumed.** Every `app/api/admin/**` route calls
`checkAdminAccess(...)` **before** its `try` block. Their `error.message` returns therefore
reach a caller who already holds the specific admin permission — not public disclosure, and
rewriting ~20 call sites would be churn for no security gain. They are deliberately left
alone.

**`middleware.ts` is a ban check, not an access gate.** It never denies a request; it only
redirects a banned user to `/banned`. Its matcher also excludes `api/auth/` outright. So
"public" below means genuinely anonymous-reachable, which is the condition that made the
sections leak matter and the reason most of the others do not.

Four public routes did return the internal message. All four are fixed in `5eaaad6`:

| Route | Auth | What the returned string actually carried | Who reads it |
|---|---|---|---|
| `GET /api/settings` | none | Postgres driver error — table, column, constraint detail | **no caller in the repository** |
| `POST /api/ping` | none; anonymous sessions are the design | Postgres driver error | `components/PingTracker.tsx:12` — awaits the response and never parses the body |
| `POST /api/ai/semantic-search` | none, and no rate limit | Gemini SDK error | **no caller in the repository** |
| `GET /api/auth/google/callback` | none by necessity; it is Google's redirect target, and the middleware matcher excludes it | OAuth / network error detail | the browser, as a redirect target |

Each now logs the real message server-side and answers a generic
`{"error":"Internal Server Error"}`. Nothing depended on the old strings, so no behaviour
changed on any success path.

For contrast, `POST /api/ai-search` — the AI route that **is** live, called from
`components/Header.tsx:158` — already returned a generic `"AI Search Failed"` and logged the
real error. It was not touched. The leak existed only in its dead sibling.

**Recorded, deliberately not changed:**

- **The repo carries three different JWT fallback literals**, not one: `'fallback_secret'`
  in most routes, `'fallback_secret_key_for_development_only'` in
  `app/api/film-request/route.ts:7`, and `'your-secret-key'` in `app/api/ping/route.ts:7`.
  While `JWT_SECRET` is set — as it is in production — all three resolve to the real secret
  and the divergence is latent. If it were ever unset, `film-request` would reject **every**
  token the login route issues, i.e. the request CTA would 401 for every signed-in user.
  This is a correctness inconsistency, not merely the "known weakness" the older note called
  it, and it is cheap to make consistent.
- **`app/api/tmdb-proxy/route.ts:238`** returns `error.message` on the busiest public route,
  but for an axios failure that string is `"Request failed with status code 401"` — no
  secret, no schema, no internal hostname. P3, left as-is rather than churned.

**Dead code, now with a chain rather than a lone file.** `app/api/ai/semantic-search/route.ts`
has no caller anywhere. Combined with the already-recorded fact that
`hooks/useAIRecommendation.ts` has no importer and that its only callee is
`app/api/ai-recommend/route.ts`, **both AI routes are dead**. `app/ai-test/page.tsx` exists
and is publicly reachable by URL but is linked from nowhere in the app.
`app/api/settings/route.ts` likewise has no caller, and production answers it with
`{"hero_movie":null}` — a single null-valued key, duplicating the admin-gated
`app/api/admin/content/route.ts:19`, which reads the same table.

Removal is a **candidate but is not taken here.** Unlike `/api/catalogue`, there is no
evidence that the *feature* is dead — only that no file in this repository calls it, and a
settings endpoint is exactly the kind of surface an external client could hold. The defect
that mattered (the leak) is fixed; the deletion decision is left to the owner with the
evidence above.

**Verification for `5eaaad6`, and its limit.** Remote SHA
`5eaaad6b6d8552b41420e0f98ffdc01a18596ff5` verified equal to local; deployment
`dpl_8fD5rWYtvJbRwJZoKjk4p8LTmZg1` observed on production; `GET /api/settings` → **200**
`{"hero_movie":null}`; `POST /api/ping` → **200** `{"success":true}`; home page → **200**
with all six pinned sections rendered, 87 posters and no error boundary; console shows only
the expected logged-out `401`, and no `500`.

**The limit, stated plainly:** a database failure cannot be induced on demand, so the
*error branch itself was not observed in production*. What is verified is that the four
success paths are unchanged. The new error branch rests on the diff, the typecheck
(`tsc --noEmit`, exit 0), the build and the full suite (145 tests, 0 failures) — it is
**not** claimed as an observed `500`.

---

## Cross-site request forgery on state-changing endpoints — found, fixed, verified

**Severity: P1.** Found while auditing the auth surface, not the API surface: reading
`app/api/auth/login/route.ts` shows the session cookie is issued with
`sameSite: 'none'` ("Required for cross-origin iframe support"), which means the browser
attaches it to requests started by **other** sites. Everything downstream authenticates
from that cookie alone — `lib/adminAuth.ts` reads `auth_token` and never inspects Origin,
Referer, or a CSRF token — and there is no CSRF token anywhere in the app. So the cookie's
own flags were the only thing standing between a hostile page and every authenticated
mutation.

**The protection that existed was accidental, and only half the surface had it.** A
cross-site `fetch` with method DELETE or PUT is not a simple request, so the browser
preflights it, and these routes return no `Access-Control-Allow-Origin` — the browser
blocks the request before it is sent. That is why `DELETE /api/user/delete` and
`PUT /api/admin/users` (the role-escalation path) were **not** exploitable, despite
requiring nothing but the cookie. It was protection by omission, not by design.

**POST was not protected at all, and that was measured rather than reasoned.** `req.json()`
does not check Content-Type, so a body declared `text/plain` — a CORS-safelisted type,
i.e. a *simple* request with no preflight — is decoded exactly like `application/json`.
Against production on 2026-09-21, the same credentials sent both ways reached the identical
handler branch (`{"error":"Invalid captcha. Please try again."}`, HTTP 403 in both cases),
which can only mean the JSON was parsed either way. A cross-site
`fetch(url, {method:'POST', mode:'no-cors', credentials:'include', body: JSON.stringify(…),
headers:{'Content-Type':'text/plain'}})` therefore arrives with the cookie **and** a
readable body. Of the 29 state-changing endpoints enumerated, the damaging POST ones are
`POST /api/admin/system` (toggles `maintenance_mode` site-wide),
`POST /api/admin/sections` (creates a home-page section) and `POST /api/admin/roles`.

**The fix.** `lib/csrf.ts` exports a pure predicate; `middleware.ts` applies it before
everything else, including before the ban-check self-fetch. For POST/PUT/PATCH/DELETE it
refuses a request only when the `Origin` header is **present and does not match the
request's own origin**. An absent header is allowed, because a browser always sends Origin
on a non-GET request — so absence means curl or a server-to-server call, not a page that
forgot. Comparing against the request's own origin keeps the rule environment-agnostic:
no hardcoded domain, identical behaviour on production, preview and localhost.

**Verification.** Against a local production build (`next start`), and then against
production after `94b7b42` deployed:

| Case | Local | Production |
|---|---|---|
| Cross-site POST `/api/ping` | 403 | **403** `Cross-origin request rejected` |
| Same-origin POST | passes (500 = no local DB) | **200** `{"success":true}` |
| No-Origin POST (curl) | passes | **200** `{"success":true}` |
| Cross-site GET | passes | **200** |
| **Cross-site POST `/api/admin/system`** (the attack) | **403** | **403 — blocked** |
| Same-origin admin POST, unauthenticated | — | **401** (passed the gate, refused by auth) |

The 403-instead-of-401 on the last row is what shows the gate runs **before** auth rather
than at it. In the browser after deploy: `POST /api/ping [200]` — positive evidence that
ordinary same-origin traffic still passes, not merely an absence of errors — with six
sections rendered, 87 posters, no `403` anywhere in the console, and `/login`, `/register`,
`/films`, `/series`, `/animes`, `/kdrama` and `/movie/129` all still serving 200.

`tests/csrf.test.ts` pins the decision table (13 cases), deliberately including the two
that are easiest to invert: an absent Origin must be **allowed**, and a present-but-matching
Origin must be **allowed**.

**Limit, stated plainly:** no admin credentials were available, so the *authenticated*
mutation path was not exercised end-to-end in production. What is verified is the gate's
behaviour across all three Origin cases on real deployed infrastructure, and that the
attack request is refused before auth is consulted. The gate inspects only method and
Origin — never the session — so its answer does not depend on who is calling.

**Residual, not closed:** middleware's matcher excludes `api/auth/`, deliberately, so a
banned user gets the login route's own JSON 403 rather than a redirect to `/banned`. The
auth routes are therefore outside this gate. Their exposure is lower — the OAuth flow
already carries its own signed state against login CSRF (see the `google/url` and
`callback` comments), and a forged logout is a nuisance rather than a privilege change —
but it is not zero, and closing it means changing that matcher, a separate change with its
own regression risk. Also unchanged: `sameSite: 'none'` itself. It may not even be needed
(Frembed's iframe does not read our cookie), but proving that means auditing every flow that
depends on it, and the Origin gate removes the exploit while leaving those flows alone.

---

# Full site audit — the complete pass (2026-09-21)

Two read-only sweeps covered the areas the provider work had not touched: the product surfaces
(SEARCH, HOME, RECOMMENDATIONS, WATCH HISTORY, FAVORITES, USER FEATURES) and the presentation
layers (SEO, IMAGES, ACCESSIBILITY, MOBILE). Both were run against the same production site, and
**every claim that changed code was re-verified from source or by `curl` before being acted on** —
three of the agent-reported findings were corrected during that step and are listed at the end.

Everything below marked *closed* was verified against deployment
**`dpl_DcBVn4k4TwCh8nGcqD67NwKu9en3`**, which is the revision the pushed commits built.

## Closed — with the measurement that proves it

### 1. The Gemini API key was published to the browser — P0

**Root cause.** `/ai-test` was an unlinked diagnostic page whose only function was to read
`process.env.NEXT_PUBLIC_GEMINI_API_KEY` inside a client component, so the value was inlined into
that page's chunk at build time.

**Evidence.** On the previous deployment (`dpl_6YpeGb9ebLq4B3zLL2wwfCBjqsjS`): `GET /ai-test` →
**200**, and of the 15 chunks that page referenced exactly one contained an `AIza…` literal —
`/_next/static/chunks/app/ai-test/page-3aa1f80e0a0e3379.js`. `/`, `/login` and `/films` scanned
clean, so the exposure was isolated to that page. Nothing in the app linked to it.

**Fix.** The page is deleted, so no chunk is generated for it. Rejected alternatives: renaming the
env var (needs the owner to set a new Vercel variable first; production AI search would break in
the meantime) and adding a public health route (fresh paid-endpoint surface for no gain — less
surface is the better outcome).

**Validation.** After deploy: `GET /ai-test` → **404**, and all 16 chunks referenced by `/` scan
clean for the literal.

**Not closed by this, and not closeable in code:** the key is already public and must be rotated in
the Google console. Deleting the literal does not un-expose it.

### 2. `/api/ai-search` spent a paid API for any anonymous caller — P2

**Evidence.** `GET /api/ai-search?q=un film triste` from an anonymous request returned
`ai_reasoning: "Heartbreaking Cinema"` after 2.2 s. The route had no auth and no limiter, so an
anonymous caller could spend without bound.

**Fix.** `lib/rateLimit.ts` (process-local, matching the `check-server` precedent, with the same
documented trust assumption about `x-forwarded-for`) and the limiter is now the **first** gate —
evaluated before the API keys are even read, so a request that will be refused costs nothing. The
allowance is 60/min per client key, which is far above human cadence because `Header` debounces the
live search by 300 ms.

**Validation.** 7 boundary tests (off-by-one at the allowance, independent buckets, window reset,
key extraction), 169/169 suite green, and `GET /api/ai-search?q=un film triste` → **200** with real
results on the deployed revision — the gate does not break the feature it guards.

**This is friction, not an access control.** The key is a client-supplied `x-forwarded-for` entry.
The live 429 path was deliberately *not* exercised against production, because doing so would spend
60 real Gemini calls on the owner's quota to prove an `if` that the unit tests already pin.

### 3. `users.id` was compared as text — P1

**Root cause.** `lib/adminAuth.ts` and `app/api/auth/me` compared an integer `PRIMARY KEY` as
`WHERE id::text = $1`. Casting the indexed column makes the predicate non-sargable, so Postgres
cannot use the primary-key index and scans the whole `users` table.

**Why it mattered.** `/api/auth/me` is self-fetched by `middleware.ts` for every matched request
from a signed-in user, and every admin route passes through `lib/adminAuth.ts` — so that scan was
paid on essentially every page and API request in the site.

**Fix.** `Number(payload.userId)` + `Number.isInteger`, which validates rather than trusts the claim:
a token whose `userId` is not an integer identifies no user and fails closed exactly as an
unreadable token already did. The `LEFT JOIN roles` casts were deliberately left alone — `roles` is
a tiny table and the cast is not on the driving side.

**Not claimed:** no query plan was observed and the current row count of `users` is unknown, so this
is a fix to the access path, not a profiled win.

### 4. `/api/ping` imported an undeclared package — P1

**Evidence.** `npm ls jsonwebtoken --depth=0` → empty. The package resolved only through
`firebase-tools@15.8.0`, a **devDependency**, and `package.json` declared only `@types/jsonwebtoken`.
It was therefore present in a local install and absent from a production build, where the import
fails at module load. `/api/ping` is live — `PingTracker` calls it and is mounted in the root layout.

**Fix.** Ported to `jose`, the library every other authenticated route already uses — including the
two that verify this same `auth_token` cookie, so compatibility is exercised in production rather
than assumed. The fallback literal also diverged from the app's `fallback_secret`, which would have
made this route reject tokens every other route accepts if `JWT_SECRET` were ever unset. The claim is
now guard-validated like the two routes above.

`@types/jsonwebtoken` was **left in place** on purpose: removing it changes `package.json`'s
dependency graph, which requires regenerating `package-lock.json` in the same commit, because an
out-of-sync lockfile fails `npm ci` on Vercel. It belongs with the unused-package sweep below.

### 5. The admin-configured hero reached nobody — P1

**Root cause.** The admin panel writes the hero to `content_settings` via `PUT /api/admin/content`
(gated `edit_hero`). The home page read it back from `GET /api/admin/content`, whose GET is gated by
`checkAdminAccess('access_admin_panel')` — so it answered **401** to every visitor without that
permission and `if (res.ok)` never fired. `customHero` stayed null and the default trending hero
rendered forever. The feature was write-only in production.

**Fix.** The home page now reads `/api/settings`, which already returned the identical key/value map
over the same table, publicly, and had **no caller anywhere in the repository**. Because the
storefront now depends on that endpoint it returns an allowlist (`hero_movie`) rather than every
row: `content_settings` is shared with admin-only concerns — `app/api/admin/system` stores
`maintenance_mode` in the same table — and a public unauthenticated endpoint must not begin serving
a setting that was added later for admin use.

**Validation.** `GET /api/settings` → **200** `{"hero_movie":null}` on the deployed revision — the
same body as before, so nothing that was already public changed shape. No write path was touched.

### 6. The primary navigation was not keyboard-reachable — P1

**Root cause.** The desktop nav was six `<li onClick>` elements. An `<li>` is not in the tab order,
carries no `href` and exposes no role, so the site's only category navigation was unreachable by
keyboard, absent from a screen-reader's link list, and offered a crawler no navigation path.

**Fix.** All six are `<Link>`, wrapped in `<nav aria-label>`. `hidden xl:flex` moved from the `<ul>`
to the `<nav>` so the element occupying that slot in the header row is unchanged — the layout is
identical. Four icon-only controls (hamburger, search, clear, drawer close) gained `aria-label` in
the active language; translation keys were deliberately not invented for four strings, which would
have meant editing `lib/translations.ts` and its type.

### 7. No `robots.txt`, no `sitemap.xml`, one `<title>` for the whole site, and `lang="en"` on a French document — P1

**Evidence (measured before the fix).** `GET /robots.txt` → 404; `GET /sitemap.xml` → 404; `/`,
`/films`, `/movie/550` and `/search/dune` all served `<title>MOVEO - Streaming</title>`; and no route
emitted any `og:`, `twitter:` or `canonical` tag, so sharing a link anywhere produced a bare URL.

**Fix.** `app/robots.ts` (allow all; disallow the API surface and the session-only pages; point at
the sitemap) and `app/sitemap.ts` — **hub routes only**. The catalogue is TMDB-backed and unbounded
with no local table to enumerate, and choosing between a snapshot table and a per-request crawl is a
design decision rather than a fix, so the sitemap covers the entry points a crawler can actually
follow. `lastModified` is omitted rather than invented. `app/layout.tsx` gained `metadataBase`, a
title template and `openGraph`/`twitter` defaults, and now ships `lang="fr"` — `LanguageProvider`'s
initial state, and therefore the markup actually sent, is French, so the document had been
announcing a language it was not written in. `LanguageProvider` now keeps the attribute equal to the
resolved language, including after the toggle.

**Validation.** `/robots.txt` → **200**, `/sitemap.xml` → **200**, `<html lang="fr"`,
`og:title`/`og:image` (absolute) present, all critical paths still 200. `tests/seo.test.ts` pins the
two failures that are otherwise silent: a relative URL, which makes the sitemap invalid and simply
ignored, and a missing API exclusion.

**Partial.** Per-title metadata is *not* fixed — see the deferral below.

## Confirmed open — needs a product decision, not a patch

### "Minutes watched" measures time on the page, not time watching — P1

**Evidence, re-verified from source.** The only client code that sends a non-zero `minutes` value is
`components/WatchTimer.tsx:100-111`, which increments once per minute while the tab is visible and
the user has not been idle for 30 minutes — and it is mounted in the page body of both detail routes
(`app/movie/[id]/page.tsx:115`, `app/tv/[id]/page.tsx:205`), independent of the player. The playback
path deliberately sends zero: `utils/historyManager.ts:54` — `minutes: 0, // Progression update
only, no time increment`. `app/api/watch-time/route.ts:53` accumulates that value into
`watch_history.minutes_watched`, which `/api/auth/me:39` sums into `total_watch_time`, and
`utils/ranks.ts:15-17` reads it while **ignoring its `watchedCount` argument entirely**.

**Impact.** Opening a film page and reading the synopsis accrues watch time; so does leaving the tab
open. The rank ladder — up to "Moveo Legend" at 2000h — can be climbed without playing anything.

**Why it was not changed.** Every candidate fix redefines a user-facing statistic whose historical
values were accrued under the current rule: counting only validated provider progress messages would
make the metric unreachable for providers that emit none; gating on a play interaction needs
cross-component state the player does not expose today. That is a product decision about what the
rank badge *means*, and about whether existing totals are grandfathered — not a defect a patch
should settle silently. It is recorded here as open and confirmed rather than quietly patched.

## Confirmed open — deferred, with the reason

**Blocked behind one refactor.** `app/movie/[id]`, `app/tv/[id]` and `app/person/[id]` are client
components, so they cannot export `generateMetadata` and cannot call `notFound()`. That single
constraint produces two findings: per-title titles/descriptions/og tags, and soft-404s — measured
`/movie/999999999` → **200** and `/movie/banana` → **200**, while a genuinely unknown route does
404. Fixing either means moving the data fetch out of the component that also drives the player.
That is a real refactor of the hottest page in the app, not an additive change, so it is deferred
deliberately rather than started and left half-done.

**Accessibility, remaining.** No overlay has dialog semantics, Escape-to-close or focus management
(`BottomSheet`, both trailer modals, `VideoPopup`, and the two header overlays — verified absent:
`role="dialog"`, `aria-modal`, `<dialog>` and any `Escape` handler return zero hits repo-wide); the
mobile drawer therefore leaves `Tab` walking the page behind it. Still open: 21 mouse-only click
targets and ~20 unnamed icon-only buttons outside the header, `htmlFor` used once repo-wide, tap
targets under 44px on the thumb-primary controls, and the carousel's 6-second auto-advance, which
cannot be paused by touch and ignores `prefers-reduced-motion`. The correct pattern already exists in
the repo (`CastList` uses real buttons with labels), so these are mechanical follow-ups.

**Images and mobile.** `images.unoptimized: true` (`next.config.ts:112`) disables the optimizer, so
no `srcset` is ever emitted and every `sizes` prop in the repo is dead; the highest-traffic image is
a JS-set CSS background at `/t/p/original` that the preload scanner cannot see; four call sites fetch
far more pixels than they display while others in the same codebase already pick the right bucket.
The hero's `min-h-[550px]` is unguarded and every viewport unit is `vh`, not `dvh`, so in landscape
the hero is 153% of the viewport. The player's "unverified" notice is a non-wrapping fixed row inside
a clipped parent, so its dismiss button is pushed out of view on phones.

**Correctness and performance, newly listed.** One failing section leaves *every* pinned home
section in a permanent skeleton (`app/page.tsx:61` uses `Promise.all`, not `allSettled`); the
`/trending/all/day` seed can produce duplicate React keys because movie and TV ids are separate
namespaces; recommendations treat watchlist/favourite items as watched because the watched-id set is
built without `?list_type=watched` and without a media-type prefix; the search dropdown has no
fallback to plain search when the AI route 500s; the search query is encoded for the API but not for
`router.push`, and the destination decodes outside its `try`; the header fetches profile stats it
never renders; saved positions are stored but never used to resume; anonymous history is never
merged and never cleared on logout; de-duplication ignores media type; season 0 is handled correctly
in one place and wrongly in two.

**Pre-existing, unchanged from earlier passes:** `app/api/admin/users/route.ts:88,140` `id::text`
(body-supplied untyped `userId`, so the safe fix needs an input guard at both sites); runtime DDL in
`admin/content`, `admin/reports` and `admin/users`; the `anonymous_watch_history` UNIQUE drift
against `migrate-progression.ts:93`; `/api/user/list`'s unbounded `SELECT *`; `/api/admin/sections`
uncached; `lib/db.ts`'s pool missing `max`/timeouts; `eslint.ignoreDuringBuilds` with
`eslint-config-next@16` against `next@15`; 7 provably unused packages and 15 orphaned modules;
tracked scratch files (`test-voe*.js`, `test-api.js`, `test_check-server.js`, `test_tmdb*.ts/js`,
`fix_backticks.js`, `tsconfig.tsbuildinfo`); `.env.example`/README drift, including a README line
documenting `GEMINI_API_KEY`, which no code reads; `/api/tmdb-proxy`'s missing endpoint allowlist and
its stale `gemini-2.5-flash-lite-preview` alias.

## Blocked on the owner — three credentials, all already public

Rotating them requires access to the Google and hCaptcha consoles; no code change substitutes for
it. Recorded in the order they were found: the **Gemini API key** (measured in a public production
chunk, above), the **Google OAuth client secret** (`GOCSPX-…`, `app/api/auth/google/callback`), and
the **hCaptcha secret** (`ES_…`, used by `login`, `register` and `verify-hcaptcha`). A NeonDB
connection string with its password is also committed in four scripts. Also noted: the hCaptcha
fallback makes `login`'s `if (!secret)` "skipping hCaptcha verification" branch unreachable.

## Corrections to figures stated earlier in this document

- The CSRF section's reduction is **25 → 13**, not 26 → 13.
- Banned users **are** blocked on API paths — `middleware.ts` keys on the 403 from `/api/auth/me`.
- `animes` and `explore` **do** have translated empty states; it was `films`/`series` that carried
  the hardcoded French one.
- `app/api/ai-recommend` had **no** relative-URL bug of its own.
- The JWT fallback divergence was **three-way** (`'your-secret-key'`, `'fallback_secret'`, and an
  unset-var path), not two-way; the `ping` port above removes one of them.
