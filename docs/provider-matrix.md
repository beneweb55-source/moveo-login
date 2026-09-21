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
| **Integration status** | ✅ public API docs | — none found | — none found | — none found | — none found | — none found | ✅ publishes embed grammar |
| **URL generation** | ✅ `/embed/movie/{id}`, `/embed/serie/{id}?sa=&epi=` | ✅ `/?video_id=&tmdb=1[&s=&e=]` | ✅ `/embed/movie/{id}`, `/embed/tv/{id}/{s}/{e}` | ✅ `/embed/movie?tmdb=`, `/embed/tv?tmdb=&season=&episode=` | ✅ `/embed/{id}`, `/embedtv/{id}&s=&e=` | ✅ **`/embed/tmdb-movie-{id}`, `/embed/tmdb-tv-{id}-{s}-{e}`** | ✅ `/movie/{id}`, `/tv/{id}/{s}/{e}` |
| **HTTP availability** (5 classes) | ✅ 5/5 × 200 | ✅ 5/5 (302→200) | ✅ 5/5 × 200 | ✅ 5/5 (301→200) | ⚠️ 4/5 200; western TV timed out once (`ERR28`), 200 on retry | ✅ **5/5 × 200 after the move** (was ✘ 0/5 on the old host — TLS hostname mismatch; see below) | ✅ 5/5 × 200 |
| **Frameability** | ✅ no `X-Frame-Options`, no `frame-ancestors` seen | ✅ same | ✅ same | ✅ same | ✅ same | ✅ **same, at the new host** | ✅ same |
| **Redirect chain** | 200 → nested **same-origin frame** `frembed.surf/series?id=…` (200) | **302** `multiembed.mov` → `streamingnow.mov/?play=<base64>` (200) | 200 → nested frames `vsembed.ru` (200) → `cloudorchestranova.com` (200) | **301** `vidsrc.me` → `vidsrc.sh` (200); then nested `cloudorchestranova.com` | 200, no redirect | **301** `player.smashystream.com` → `anyembed.xyz/embed/…`; hop deliberately **skipped** (we frame the final target) | 200, no redirect |
| **Browser frame load** | ✅ Korean, anime series, anime movie | ✅ loads — but see Playback | ✅ Korean | ✅ Korean | ✅ Korean | ✅ **movie, TV, and season 0** | ✅ Korean, anime series, anime movie |
| **Playback observed** | ✘ **not observed** (Korean & anime series). No media-type request; no stream host in `xhr`/`fetch`; clicking its player surface produced no media. *Not* evidence it cannot play — see Limits | ✘ **not observed**. Renders an ad landing page, not a player | ✘ not observed in ~14 s (its own `Play` clicked) | ✘ not observed | ✘ not observed (ad layer) | ✅ **movie AND TV, measured on the media element**: `/embed/tmdb-movie-550` → *Fight Club*, duration **8348.4 s** (= 2:19:08, the film's real runtime), `readyState 4`, `paused=false`, **1280×534 decoded**; `/embed/tmdb-tv-1396-1-1` → *Breaking Bad - Pilot*, **3479.9 s** (= 57:59), `1280×720` | ✅ **Korean 93405 S1E1 and anime series 1429 S1E1** — DASH manifest + init segments + 14 sequential media chunks, streaming progressively |
| **Season / episode** | ✅ renders `Saison` / `Épisode` + `S1 E2` next-episode + `ÉPISODES` / `SERVEURS` | — | ✅ provider frame titled `Squid Game 2021 · S01 E01` | ✅ same upstream, same title | ✅ renders `Squid Game (2021) (S01E01)` | ✅ renders the episode list; **season 0 resolves to the correct special** (see below) | ✅ `region "Video Player - Attack on Titan- S1 E1"` |
| **Subtitles & language** | renders a `VF` dub badge on series; no subtitle menu seen | — | — | — | — | — (not measured) | ✅ **subtitle track fetched** (`.srt`) for Korean *and* anime; 3 audio streams in the DASH manifest |
| **Movie coverage** | ✅ resolves (`/api/films?id=129&idType=tmdb` 200; rendered title) | — | — | — | — | ✅ **resolves AND plays** (*Fight Club*) | ✅ resolves; anime movies ✘ (below) |
| **Western TV** | ✅ 200 | — | — | — | — | ✅ **resolves AND plays** (*Breaking Bad* S1E1) | ✅ 200 |
| **Korean drama** | ✅ resolves + renders `Squid Game` S1E1 (`/api/series?id=93405…` 200) | ✘ no player (ad page) | ✅ resolves | ✅ resolves | ✅ resolves | — (not measured) | ✅ resolves **and plays** |
| **Anime series** | ✅ resolves + renders `L'Attaque des Titans` S1E1 + `VF` | — | — | — | — | — (not measured) | ✅ resolves **and plays** (+ subtitles) |
| **Anime movie** | ✅ resolves + renders `Le Voyage de Chihiro` (`/api/films?id=129`) | — | — | — | — | — (not measured) | ✘ provider self-declares `"We Couldn't Find This Content ."` |
| **Mobile behaviour** | — | — | — | — | — | — | — |
| **Stability** | intermittent: 7/8 curl attempts 200, 1 connect timeout; one duplicate `ERR_ABORTED` frame request on first mount | poor: Cloudflare Turnstile (`Error: 600010`) retry-looping inside the frame | — | — | one curl timeout (western TV), 200 on retry | ✅ **stable across movie, TV and specials probes**; not yet observed over time | ✅ stable across two titles; not yet observed over time |

---

## The two corrections to the first pass

Both were failures recorded in the first pass that, on re-measurement, were **readings
of the wrong thing** — which is exactly the error this document exists to catch.

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
| **Frembed** | ✅ Publishes an HTTP API surface (`/api/film.php`, `/api/serie.php`, and a reported `/api/public/v1/anime`) **[M]** for the redirect endpoints. | Third-party aggregator, unclear licensing. The only provider we have measured to resolve **all four** content classes including Korean *and* anime. **Currently the default.** |
| **SuperEmbed** | — None found **[D]**. | Not appropriate for integration as-is: measured to display **adult advertising** inside our player **[M]**, and its own anti-bot gate (`Error: 600010`) was retry-looping. |
| **VidSrc.to** | — None found **[D]**. Reported to **deny anime support publicly** **[D]** — not independently verified. | Third-party aggregator, unclear licensing; reported to appear in the MPA's 2 Oct 2024 USTR filing **[D]**. |
| **VidSrc.me** | — None found **[D]**. | Same upstream player as VidSrc.to **[M]**; same classification. |
| **2Embed** | — None found **[D]**. | Third-party aggregator, unclear licensing; same reported USTR filing **[D]**. Its `embedtv/{id}&s=&e=` shape is the provider's own working format **[M]**. |
| **SmashyStream** | — None found **[D]**. | Third-party aggregator, unclear licensing. Destination host changed 2026-09-21 **[M]**. |
| **VidLink** | ✅ Publishes an embed URL grammar, including a reported `/anime/{MALid}/{number}/{subOrDub}` **[D]** — not independently verified. | Third-party aggregator, unclear licensing. The only provider where we measured playback for **Korean and anime**, with subtitles **[M]**. Loads a fingerprinting module (`fu.wasm`) and monetises via ad exchanges **[M]**. |

**No provider in this review publishes any K-drama claim at all**, in either column.
Korean coverage is therefore **measured-only** for us, and the only provider we have
measured to *play* Korean content is VidLink.

---

## Per-provider notes

### Frembed — the current default (`DEFAULT_PROVIDER_NAME`)

- Resolves **all four** content classes tested by TMDB id, including **Korean drama**
  and **anime** (series *and* movie). This is the broadest resolution observed of any
  provider here.
- Its nested film/series page renders the real title, `Saison`/`Épisode`, a `VF` badge,
  and `SERVEURS` / `ÉPISODES` / `S1 E2` controls.
- **Playback was not observed.** After the frame settled there were no media-type
  requests and no stream host in `xhr`/`fetch`; clicking the one interactive element in
  its player area (a `button` with no accessible name) produced no media.
- That same click opened a **new tab to a `mega.nz` file URL**. The popup appeared
  immediately after the click, but its exact origin was not proven, so this is recorded
  as an observation, not an attribution.
- Because Frembed is the default source, "resolves but playback not observed" remains
  the single most important open question in this document. **It is still open.**

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
- Subtitles/language support, Korean coverage, anime coverage and mobile behaviour are
  **not measured** for this provider. An absent claim is a gap in the review, not a "no".

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
2. **A click is required.** VidLink only began fetching after its `Play` control was
   activated. Other providers may behave the same way. Their ✘ therefore means
   "no media after load, and in some cases after a click", not "no media ever".
3. **One vantage point.** Single network, single country, single browser profile with
   extensions present. Geo-variance and ISP-level differences are invisible here.
4. **Narrow sample.** Browser-level tests cover: Korean `93405` S1E1, anime series `1429`
   S1E1, anime movie `129`, movie `550`, western TV `1396` S1E1, and — added this pass —
   Breaking Bad **season 0** on SmashyStream. Per-season and per-episode depth (later
   seasons, episode numbering past E1) was **not** measured, and season 0 was measured on
   **one** provider only. The season-0 fix in `lib/providers.ts` therefore applies the
   truthful value to all seven, but `capabilities.specials` is `"yes"` only for the one
   measured — the rest are `"unknown"`, which is the honest encoding.
5. **Mobile behaviour is entirely unmeasured** — every cell above is blank for it.
6. **Unmeasured ≠ absent.** Every `—` cell is a gap in this review, not a claim.

## Cross-cutting observations made during the same sessions

These are not per-provider, but they came out of the same measurements and are worth
recording where they can be acted on:

- **Our CSP is not blocking anything in use.** Zero `Refused to frame` / CSP violations
  appeared in the console across every provider and title tested.
- **`/api/catalogue` is alive and correctly scoped.** `GET /api/catalogue?tmdb_id=129`
  returned **200** — and the **TV page never calls it**. The VOE/Dood removal did not
  break the `moveoFound` flow, which remains movie-page-only.
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
- **A provider capability can be withheld by a bug on our side.** The season-0 defect was
  found only because the season/episode dimension was measured per provider; the HTTP
  layer had shown nothing. This is the argument for measuring the remaining `—` cells
  rather than assuming them.

---

## Pending — not yet in this document

Named here so the gaps are explicit rather than implied by an empty cell. None of these
is a conclusion; each is work outstanding.

- **Independent verification of the `[D]` legal/documentation claims.** The
  classification table above names what a documentation pass reported; none of it was
  re-verified in-session. In particular the reported MPA/USTR filing, VidSrc.to's
  reported anime denial, and the reported `/api/public/v1/anime` and
  `/anime/{MALid}/{number}/{subOrDub}` grammars should be checked at the source before
  any of them informs a product decision.
- **Documented embed parameters** per provider, including whether any of them has a
  *supported* subtitle/language parameter, and the unresolved discrepancy between
  `lib/video-utils.ts` (which appends `&sub=fr` to VidSrc.me) and the live
  `lib/providers.ts` (which does not). `lib/video-utils.ts` appears to have no importers;
  that should be confirmed before the file is trusted or removed.
- **Public reports of adult/malicious advertising** for the providers that surfaced them
  here, to determine whether the SuperEmbed observation is typical or an outlier.
- **Korean and anime coverage claims** from provider documentation, to compare against
  what we measured. Neither column has a single published K-drama claim to compare to.
- **Mobile behaviour** for every provider — still entirely unmeasured.
- **Per-season / per-episode depth** — later seasons, episode numbering past E1, and
  season 0 on the other six providers.
- **Stability over time** — the current column is a single session, not a trend.
- **`/api/catalogue`'s remaining purpose.** It is verified alive and correctly scoped to
  the movie-page `moveoFound` flow, but that flow should be re-checked against the
  product decision on the removed premium tier before the route is kept long-term.
