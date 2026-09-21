# Player validation — real viewing sessions, 2026-09-21

This file records **what was observed**, in the terms the validation brief requires.
It is separate from `docs/player-strategy.md`: that file states the strategy and its
reasoning, this one states the raw sessions the strategy is supposed to rest on.

**The rule.** A session is a **SUCCESS only when actual playback is objectively
confirmed** — advancing media, decoded frames, real segments. HTTP 200 does not count.
An iframe loading does not count. A Play button does not count. A manifest alone does
not count. Metadata is not evidence, in either direction.

**Status at time of writing: STRATEGY PROVISIONAL — NOT ENOUGH REAL VIEWING SESSIONS.**
Six playback-confirmed sessions now exist (§2). That is real progress across four of the
five content classes, but six sessions still cannot set five classes × two viewing
languages × two platforms, and Frembed has still never been measured at all.

Session labels: `M` = movie, `K` = Korean, `AM` = anime movie, `AS` = anime series.
Labels are assigned in this revision; no earlier numbering is implied.

---

## 1. Instruments — which ones are valid, and which are not

Establishing this first, because several earlier readings in this project were wrong for
instrument reasons rather than provider reasons.

### Invalid: the accessibility-tree timecode (VidLink)

VidLink's framed player exposes `StaticText "0:00" … "/" … "59:42"` and a
`slider "Seek"` in the accessibility tree. **This clock does not track playback.**
Measured on K1: it read `0:02` with `slider "Seek" value="0"` while 20 consecutive video
segments and 20 consecutive audio segments had already been fetched and two visually
distinct frames had decoded. It is not evidence of anything. Read the **pixels** instead.

### Invalid as an audio-track signal: the DASH segment stream index

Segment filenames are `chunk-stream<N>-<seq>.m4s`, where `N` is the **Representation
id**, and Representation ids are allocated across video *and* audio in one sequence.
The mapping is therefore **not stable across titles**:

| Title | stream0 | stream1 | stream2 | stream3 |
|---|---|---|---|---|
| Fight Club (movie) | video (only rung) | audio `eng` | — | — |
| Squid Game S1E1 | video 1920×1080 | video 1280×720 | video 854×480 | audio `kor` |
| Attack on Titan S1E1 | video | video | video | audio |

Reading "`init-stream0` + `init-stream1`" as "two audio streams" is how the
"multi-audio" claim in `docs/player-strategy.md` was produced. It was a misreading of a
**video** rung. The only authority on audio tracks is `<AdaptationSet contentType="audio">`
in the manifest.

### Unreliable: `resourceTypes: ["media"]`

Returns **no requests** for these players, because they are MSE/DASH — media arrives via
`fetch` of `.m4s` segments, not as a `<video src>`. A missing `media` entry is **not**
evidence of absent playback.

### Valid, and newly established: `contentWindow.location.href` readability

Reading `frame.contentWindow.location.href` **throws** for a committed cross-origin
document and **returns `"about:blank"`** for a frame that has not navigated yet
(`about:blank` is same-origin and therefore readable).

This is a clean, cheap discriminator between the two states a hung frame can be in, and
it was decisive in §5's diagnosis. Sample it alongside the frame element; the reported
value `cross-origin` means a real provider document committed, `about:blank` means it did
not.

### Valid: the manifest, read directly

`get_network_request` on the `index_web.mpd` fetch returns the full DASH manifest, whose
`<AdaptationSet>` elements carry `contentType`, `lang`, `codecs`, `bandwidth` and
resolution, and whose `mediaPresentationDuration` gives the true runtime. This is the
strongest cross-origin evidence available and it was used for every audio claim below.

### Valid: monotonic segment fetches + decoded frames

Segments fetched in an unbroken, increasing sequence — interleaved video/audio — plus
screenshots showing different decoded content between samples. Neither is reachable
without real playback.

### Caveat, and a correction to an earlier note: SmashyStream's framed a11y exposure varies

It had been recorded that SmashyStream "exposes no readable manifest and no controls" so
its audio language "cannot be claimed either way". That is **not a stable property of the
provider**. In this revision the same framed player was exposed in full:

```
uid=24_66 Iframe "Lecteur vidéo — L'Attaque des Titans"
  uid=24_67 RootWebArea "Attack on Titan - To You, in 2000 Years: The Fall of Shiganshina (1) | AnyEmbed"
              url="https://anyembed.xyz/embed/tmdb-tv-1429-1-1"
```

and earlier the same day a bare title only. So the correct statement is that
**exposure varies between sessions**, not that it is structurally absent. A claim that
SmashyStream exposes nothing must be re-tested rather than assumed. Its **manifest** remains
genuinely unreadable, because it proxies media through
`api.anyembed.xyz/api/proxy?url=…whysosigmabro.fun/api?d=<opaque>` rather than serving a
player we can inspect.

---

## 2. Sessions recorded

| # | Class | Title | Provider | Role used | Result |
|---|---|---|---|---|---|
| M1 | Movies | Fight Club (TMDB 550) | SmashyStream | PRIMARY | **FAILED** — backend unreachable |
| M2 | Movies | Fight Club (TMDB 550) | VidLink | FALLBACK #1 | **PLAYBACK CONFIRMED** |
| K1 | Korean | Squid Game S1E1 (TMDB 93405) | VidLink | PRIMARY | **PLAYBACK CONFIRMED** |
| AM1 | Anime movie | Spirited Away (TMDB 129) | VidLink | PRIMARY | **FAILED** — "We Couldn't Find This Content" |
| AM2 | Anime movie | Your Name. (TMDB 372058) | VidLink | PRIMARY | **FAILED** — title found, no manifest, never started |
| AM3 | Anime movie | Spirited Away (TMDB 129) | SmashyStream | FALLBACK #1 | **PLAYBACK CONFIRMED** |
| AM4 | Anime movie | Your Name. (TMDB 372058) | SmashyStream | FALLBACK #1 | **PLAYBACK CONFIRMED** |
| AS1 | Anime series | Attack on Titan S1E1 (TMDB 1429) | SmashyStream | FALLBACK #1 | **PLAYBACK CONFIRMED** |
| AS2 | Anime series | Attack on Titan S1E1 (TMDB 1429) | VidLink | PRIMARY | **PLAYBACK CONFIRMED** |

Plus one **void** observation, excluded from all provider counting: a framed
`vidlink.pro/tv/1429/1/1` load that failed inside 20 s during a brief VidLink outage (§5).
It is not evidence about VidLink and is not counted as a failure.

**Reliability counting:** M2 1/1, K1 1/1, M1 0/1, AM1 0/1, AM2 0/1, AM3 1/1, AM4 1/1,
AS1 1/1, AS2 1/1. These are counts out of counts, not percentages, and a sample of one
per cell supports no rate at all.

---

## 3. M1 — SmashyStream PRIMARY on Movies: FAILED (unreachable)

| Field | Value |
|---|---|
| Class / title | Movies — Fight Club (TMDB 550), `/movie/550` |
| Role | PRIMARY for the movie class |
| Symptom | Backend host never answered |
| Browser evidence | **13+** requests to `api.anyembed.xyz` ending `net::ERR_CONNECTION_TIMED_OUT` |
| Independent probe | `curl`: `connect=0.000s total=12.000s` — connection never established; DNS resolved normally (`dns=0.116s`) |
| Front-end contrast | `anyembed.xyz` (the page host) answered **HTTP 200 in 0.246 s** — so the origin's front end was up while its API was not |
| What the user saw | **Not** the hard-failure panel. The frame committed an error page, which still fires `onLoad`, so the phase became LOADED / PLAYBACK UNKNOWN and the user got the advisory *"Lecture non confirmée"* |

This is the behaviour `components/VideoPlayer.tsx` documents at the unverified-playback
notice: a request that fails at the network level still commits a document, so `onLoad`
fires and the phase is indistinguishable from a loaded-but-unverified player.

**Scope limit.** Both probes shared one network vantage point, so this is recorded as
"unreachable from here, now", **not** as a global outage. A SmashyStream session on this
same title had been confirmed earlier the same day, so this is an availability change
rather than a contradiction.

**Contrast established in this revision.** The *same class of cause* — a connection that
never establishes — produced the **hard-failure panel** on VidLink (§5) and the
**advisory** here. The difference is not severity but whether the provider's failure
commits a document: an error page fires `onLoad` and looks "loaded", a connection that
never establishes does not. So the user-visible honesty of our phase model depends on a
property of the provider's failure mode, not on our own handling.

---

## 4. M2 — VidLink FALLBACK #1 on Movies: PLAYBACK CONFIRMED

| Field | Value |
|---|---|
| Class / title | Movies — Fight Club (TMDB 550), framed `vidlink.pro/movie/550` |
| Selection | Reached by the user pressing *Changer de source* from SmashyStream |
| Playback evidence | `chunk-stream0-00012 → 00020` and `chunk-stream1-00008 → 00025` — monotonic, interleaved |
| Frame evidence | Three visibly different decoded frames |
| Resume position | `1:16`, persisted by our own progress reporting — a position never set by hand |
| Subtitle evidence | Rendered subtitles advancing line by line: *"People always ask me / if I know Tyler Durden."* → *"The Demolitions Committee / of Project Mayhem"* → *"Two and a half."* |
| Correctness | Title correct throughout; `mediaPresentationDuration="PT2H19M8.3S"` = Fight Club's true runtime |
| Upstream | Watermarked `fromovies.net` — the real origin behind the aggregator |
| Verdict | **PLAYBACK CONFIRMED** |

### 4.1 French — first French result in this project's history (§4 of the brief)

Session run with the viewer language set to French (`bodyLang: "fr"`).

| Claim | Status |
|---|---|
| French **subtitles** available and usable | **YES — observed rendering** |
| French **audio** available | **NOT OBSERVED — and not achievable through this UI** |

Evidence for the subtitle half: VidLink's own captions menu lists 17 languages including
**Français**; selecting it fetched a subtitle file from `cacdn.hakunaymatata.com`
(`…/subtitle/079a961414f58271cd4bb3dad01b9aab.srt`, HTTP 200); and French text then
rendered on screen during active playback:

> *"Oui, nous somme…"*
> *"- C'était là où je me trouvais... - Ils devront encore vider mes pectoraux."*
> *"Non attends. Sauvegarder. Permettez-moi de commencer plus tôt."*

That satisfies the brief's criterion **"correct content + actual playback + usable French
subtitles"** — with the caveat that it is **one title**, and a subtitle success is not an
audio success.

Evidence against the audio half, and this is the stronger finding: the manifest for this
session declares **exactly one audio track, `lang="eng"`** —

```
<AdaptationSet id="1" contentType="audio" … lang="eng">
  <Representation id="1" mimeType="audio/mp4" codecs="mp4a.40.2" bandwidth="128000" audioSamplingRate="48000">
  <AudioChannelConfiguration … value="2" />
```

— and VidLink's UI exposes **no audio-track selector at all**: *Settings* contains
Captions / Customize / Playback, and *Playback* is playback **rate** (0.25x–2x) only.
French audio on this title is therefore neither present in the stream nor selectable in
the UI. It is recorded as **absent on this title**, not as "VidLink has no French audio",
which was not tested.

**Metadata warning.** The same manifest's own title string is
`Fight.Club.1999.REMASTERED.1080p.BluRay.H264.AC3.DD5.1`, while the streams it actually
contains are HEVC **1154×480 at 350 kbps** and **AAC 2.0** — not 1080p, not H.264, not
AC3, not DD5.1. Even the file's own name misdescribes its contents. Metadata is not
evidence even when it is the provider's own.

### 4.2 The popup — observed, and now ATTRIBUTED

Earlier this was recorded as *attribution undetermined*: one adult landing page
(`sexymeet.tv/…`) was seen during a session that had **two** providers mounted, and it did
not reproduce in a VidLink-only retest. That has changed.

In this revision a popup tab opened again, in a session where **VidLink was the only
player mounted**:

```
https://browserpro.online/opera/1056/?cid=…
  &network=adcash
  &utm_source=9905914-2517555085-4269441498
  &camp=459680420
  &creative=24147990
```

— a fake Opera download page. And **in the Moveo page's own network log, inside VidLink's
frame, at the moment of playback**:

```
reqid=1621  GET https://adexchangerapid.com/script/suurl5.php?r=9905914&…      [200]
reqid=1654  GET https://adexchangerapid.com/script/i.php?t=1&c=24147990&…      [204]
```

**The identifiers match exactly:** the popup's `creative=24147990` is the frame's
`c=24147990`, and the popup's `utm_source=9905914-…` is the frame's `r=9905914`. The
earlier observation's `creative=24147988` has a matching `i.php?…c=24147988`.
Same endpoint, same creative family, adjacent ids, in VidLink's own ad stack — which also
loads `adsco.re` (Adscore), `vidlink.pro/fu.wasm`, `k.clarity.ms` and
`mc.yandex.ru/watch/98154677`.

**What this means for Moveo, and it is the most serious finding in this file.** Our own
code sets, on VidLink:

```
lib/providers.ts:460   warningKey: "disableAdblock"
lib/translations.ts:73   disableAdblock: "Désactivez Adblock pour ce lecteur"
lib/translations.ts:462  disableAdblock: "Disable Adblock for this player"
```

i.e. **the product instructs users to disable the protection that blocks this chain**, on
a provider the strategy marks PRIMARY for Korean and anime. Fixing this is our own work
and requires no provider cooperation.

---

## 5. K1 — VidLink PRIMARY on Korean: PLAYBACK CONFIRMED

| Field | Value |
|---|---|
| Class / title | Korean — *Squid Game* S1E1 (TMDB 93405), framed `vidlink.pro/tv/93405/1/1` |
| Moveo layer | Page title `Squid Game S1E1 - Moveo`; UI showed *Saison 1 · Épisode 1* |
| Provider layer | Region label inside the frame: **`Video Player - Squid Game- S1 E1`** |
| Duration | Manifest `PT59M42.1S`; provider's own control bar `59:42` |
| Playback evidence | `chunk-stream0-00002 → 00017` and `chunk-stream3-00002 → 00021`, interleaved, ~100 s of media |
| Frame evidence | Two distinct decoded frames 14 s apart |
| Audio | `lang="kor"` — **the original Korean track** |
| Verdict | **PLAYBACK CONFIRMED** |

Frames: t0 a black-and-white outdoor scene of a boy in a striped shirt; t1 a colour
indoor scene of Seong Gi-hun in a white t-shirt turning from a yellow chest of drawers.
Correct series, correct episode, correct character.

### 5.1 The video ladder is real on this title — unlike the movie

| Title | Video renditions | Audio |
|---|---|---|
| Fight Club (movie) | **1** — 1154×480 @350 kbps | 1 — `eng` |
| Squid Game S1E1 | **3** — 1920×1080 @1936k, 1280×720 @1000k, 854×480 @500k | 1 — `kor` |
| Attack on Titan S1E1 | 1080p HEVC (per manifest path, §6.2) | 1 |

On the Korean title ABR settled at 1080p and stayed there (stream1 and stream2 were never
requested after the first two segments). On the movie there was no ladder to adapt to.
Quality is therefore **per-title**, not per-provider, and the movie session's 480p was a
property of that title's source, not of VidLink.

### 5.2 What this does to the documented reason for VidLink leading Korean/anime

`docs/player-strategy.md` §3 justifies VidLink's PRIMARY role for Korean and anime as:
*"the only provider measured carrying multiple audio streams **and** fetching a subtitle
track, and that observation was made on Korean and on anime content."*

**The "multiple audio streams" half is falsified.** On every title measured, VidLink
served exactly **one** audio AdaptationSet. What varies between them is *which* language
that single track is in — `eng` for the Western film, `kor` for the Korean series. The
original reading was almost certainly a misreading of the video rungs (§1).

**The decision survives, but on a different and better reason.** For the Korean and anime
classes the crux is that the **original-language audio** be present rather than a dub, and
VidLink was measured serving `lang="kor"` for Korean content while also fetching a
subtitle track and offering a 1080p ladder. That is a real, measured basis for leading
those classes. The reasoning that had been written down was not.

### 5.3 In this revision: VidLink requests `multiLang=0`

The anime-series session (§6.2) shows VidLink's own API call:

```
GET https://vidlink.pro/api/b/tv/<token>/1/1?multiLang=0        [200]
```

`multiLang=0` is sent on anime content as well as on Korean. So the single-audio-track
observation in §5.2 is not an artefact of a request parameter we chose — VidLink is *asked*
for one language and serves one track, which is the correct behaviour for our use.

---

## 6. The anime classes (new in this revision)

Anime was entirely unmeasured before this revision, and it is the class where the strategy
was most recently changed and whose stated justification was just found to be misstated
(§5.2). Both anime classes are now measured on both providers.

### 6.1 Anime MOVIES — the clearest contradiction in the dataset so far

| Title | VidLink (PRIMARY) | SmashyStream (FALLBACK #1) |
|---|---|---|
| Spirited Away (129) | **FAILED** — *"We Couldn't Find This Content"*, despite HTTP 200 | **PLAYBACK CONFIRMED** |
| Your Name. (372058) | **FAILED** — title found, **no manifest fetched at all**, never started across two Play presses and 40+ s (`busy`, `0:00 / 0:00`, Play still Play, empty `alert`) | **PLAYBACK CONFIRMED** |

VidLink was **reachable** for both: it rendered real pages of its own (a "not found"
message; a title match with a Play button). So these are content-availability results, not
connectivity results.

The confound was then removed by a controlled comparison — same title, same profile, same
minute: *Your Name.* on SmashyStream played immediately (`0:15 / 1:46:35`, CoMix Wave Films
ident). That is as close to a clean A/B as this project can construct, and it points the
opposite way from the strategy on anime movies.

### 6.2 Anime SERIES — measured on both providers, and BOTH WORK

**AS1 — SmashyStream (FALLBACK #1), Attack on Titan S1E1.**

| Field | Value |
|---|---|
| Moveo layer | `/tv/1429`, *Saison 1 · Épisode 1* |
| Provider layer | `RootWebArea "Attack on Titan - To You, in 2000 Years: The Fall of Shiganshina (1) \| AnyEmbed"` — correct episode **and** correct episode-1 title |
| Sibling episode listed | `That Day: The Fall of Shiganshina (2)` = the correct AoT S1E2 title |
| Playback evidence | Provider clock **`0:30 / 25:40` → `1:03 / 25:40`** (33 s advance) with two distinct decoded frames |
| Frames | t0 Shiganshina rooftops seen from the wall; t1 the **Survey Corps "Wings of Freedom" emblem** |
| Watermark | `#AE>` (AnyEmbed) visible in the pixels |
| Verdict | **PLAYBACK CONFIRMED** |

**AS2 — VidLink (PRIMARY), Attack on Titan S1E1.**

| Field | Value |
|---|---|
| Provider layer | `RootWebArea "VidLink" url="https://vidlink.pro/tv/1429/1/1"`; `StaticText "Attack on Titan - S1 E1"` |
| Duration | `23:59` (against SmashyStream's `25:40` for the same episode — a normal per-source encode difference, not an error) |
| Playback evidence | `init-stream0/1/3` then `chunk-stream0-00002 → 00017` interleaved with `chunk-stream3-00001 → 00017` |
| Manifest | `…/sacdn/dash/1975770531236301600_1_1_1080_h265/index_web.mpd` — the path itself indicates **1080p HEVC** |
| CDN | `noon.mooncase.online`, backed by `sacdn.hakunaymatata.com` |
| Verdict | **PLAYBACK CONFIRMED** |

**What this does to the anime-movie contradiction.** It does **not** extend to anime
series. VidLink served the anime series at 1080p HEVC on the first attempt. So the
anime-movie result is scoped to **anime movies**, not to "anime" — a distinction the
strategy does not currently make and which this revision can now support with data.

**A behavioural difference worth recording.** VidLink **does not autoplay**. AS2 mounted
at `0:00` with a `PosterFrame`, a large **Play** glyph and `button "Play"` in the tree, and
produced no segments until Play was pressed. This has two consequences: (a) "playback
confirmed" on VidLink always requires the extra Play step, and (b) our advisory is
*correct* before that press and *wrong* after it (§7).

---

## 7. Cross-cutting UX finding: the advisory overlays working video

Reproduced now on **four** classes — K1 (VidLink, Korean), AS1 (SmashyStream, anime
series), AS2 (VidLink, anime series), and M2's session — and each time the player was
**actively playing** behind the notice while our UI displayed over the top of it:

> **Lecture non confirmée** — *"Le lecteur est chargé mais je ne confirme pas la lecture.
> Si l'écran reste noir, choisis une autre source."* with **Réessayer** / **Changer de
> source** / dismiss.

The behaviour is honest — the parent page genuinely cannot verify a cross-origin player,
and `VideoPlayer.tsx` refuses to claim playback it has not observed. But the cost is now
measured: **on a correctly working stream the user is told playback is unconfirmed, and
the notice partly covers the video they are watching.** The wording ("si l'écran reste
noir") does not describe what the user is seeing.

Note the precise shape of the defect, because it bounds the fix: before the user presses
Play the advisory is **right**; after playback starts it is **stale**, and it never clears,
because nothing tells the parent page that anything happened. This is our own integration
and is fixable without touching any provider protection.

---

## 8. §3 fallback sub-cases — coverage

| Sub-case | Status |
|---|---|
| PRIMARY succeeds | **Measured** — K1 (VidLink, Korean), AS2 (VidLink, anime series) |
| PRIMARY fails | **Measured** — M1 (SmashyStream, Movies), AM1/AM2 (VidLink, anime movies) |
| FALLBACK #1 succeeds | **Measured** — M2 (VidLink, Movies), AM3/AM4, **AS1 (SmashyStream, anime series)** |
| FALLBACK #1 fails | **Not measured** |
| FALLBACK #2 succeeds | **Not measured** (Frembed has never been measured at all) |

Sub-properties verified by real click, now on three classes: the transition left **exactly
one iframe** (old frame removed, not stacked — no stale iframe, no provider race); roles
rendered correctly; the choice persisted (`preferredServer`) so manual authority held; the
failure panel's *Réessayer / Changer de source* disappeared once a provider succeeded, so
**a failed provider did not poison the next attempt**; and **zero popup tabs** were opened
by the switch itself. On AS1 the fallback was reached from the *hard-failure panel* of the
outage in §9, which also exercises **PRIMARY fails → FALLBACK #1 succeeds** end to end.

**One structural finding about §3 as written.** `nextProviderName` has exactly two call
sites in the codebase and **both are user-click handlers** ("Changer de source"). There is
no automatic-fallback code path. So "verify the automatic fallback engine" cannot be
satisfied as stated for framed providers — for a cross-origin provider, automatic
fallback is not merely unimplemented, it is **not even detectable** from the parent page.
What exists is a **guided manual fallback**, and that is what was tested.

---

## 9. A connectivity event, a control probe, and what it taught the methodology

This section exists because an intermediate reading of mine was **wrong**, and the error
was caught only by probing.

A framed `vidlink.pro/tv/1429/1/1` load hung and failed at **20 s**, and a direct
top-level navigation to `vidlink.pro/tv/93405/1/1` returned
`net::ERR_CONNECTION_TIMED_OUT`. The tempting conclusion — "VidLink fails on anime
series too" — would have deepened the §6.1 anime-movie contradiction on false evidence.

Instrumenting our own page gave the timeline and killed that reading:

```
1002ms → 20002ms   frames=1  tag=1  failed=false   https://vidlink.pro/tv/1429/1/1
21011ms → 29001ms  frames=0  tag=null failed=true
```

The frame was mounted **once** — `tag` never changed, so there was no remount, no `attempt`
bump, no `key` change — and it sat unmounted-by-nobody for a full 20 s before
`IFRAME_LOAD_TIMEOUT_MS` fired exactly on schedule at ~21 001 ms. So `net::ERR_ABORTED` in
the request list was a **symptom**, not a cause: Chrome reports the cancellation when we
unmount a still-pending frame. The request had simply never committed anything, which the
`about:blank` reading (§1) independently confirmed.

Then the controls, minutes later, on the same host and path:

| Probe | Result |
|---|---|
| `curl https://vidlink.pro/` | **200**, `conn=0.060s`, `total=0.355s` |
| `curl https://vidlink.pro/tv/1429/1/1` | **200**, `conn=0.048s`, `total=0.385s`, 21 505 bytes |
| `curl https://vidlink.pro/tv/93405/1/1` | **200**, `conn=0.047s` |
| `curl https://vidlink.pro/movie/550` | **200**, `conn=0.058s` |
| Chrome → `https://vidlink.pro/` | navigated successfully |
| Chrome, minutes earlier → `/tv/93405/1/1` | `ERR_CONNECTION_TIMED_OUT` |

VidLink was serving every one of those paths to curl within a fraction of a second. It had
a **brief outage window that recovered**, and AS2 later played through the same frame
path, confirming recovery.

**Two lessons that apply to the whole validation effort, not just this case.**

1. **A single connection failure is never a provider-quality result.** It is an
   availability event until a control probe says otherwise. M1 (§3) is in the same
   category and was already scoped that way.
2. **A timeout that fires is not automatically a failure of the thing timed out.** Here
   the 20 s budget was the proximate cause of a *false hard failure* — see §10.

---

## 10. Our own defect: `IFRAME_LOAD_TIMEOUT_MS = 20000` is too tight for SmashyStream

This is the most actionable code finding in this file, and it is ours, not a provider's.

The same SmashyStream frame on the same URL (`anyembed.xyz/embed/tmdb-tv-1429-1-1`),
measured twice within minutes:

| Attempt | Frame load behaviour | User-visible outcome |
|---|---|---|
| First | never committed within 20 s (`about:blank` throughout) | **hard-failure panel** — *"Le lecteur ne répond pas"*, player destroyed |
| Second (retry) | `onLoad` fired between **15.0 s and 16.5 s** | player kept, advisory shown, **played normally** |

`components/VideoPlayer.tsx:106` sets `IFRAME_LOAD_TIMEOUT_MS = 20000` and line 428 arms
the timer; on expiry the reducer moves to the failure state, the render branch at line 724
takes precedence over the iframe branch at line 774, and **the frame is unmounted**. So a
provider that is merely slow — not broken — has its player taken away and is reported to
the user as not responding, while the retry a moment later plays fine.

SmashyStream's own embed page was independently confirmed healthy during this window:
navigated top-level it rendered the correct title, the correct S1E1 and S1E2 titles, and a
working `0:06 / 25:40` clock.

**Recommendation, deliberately not applied yet.** The fix is to raise the budget, but the
correct value needs a load-time distribution we do not have — this revision has one 15 s
sample and one >20 s sample. Two points cannot set a constant, and the counter-cost is
real: raising the ceiling also lengthens how long a genuinely dead provider (§9) takes to
report. The honest next step is to instrument actual frame-load times across providers and
classes, then set the constant from that distribution. Recorded here rather than guessed.

---

## 11. SmashyStream's current state, measured

Its streaming path works; its **account and telemetry** path does not, and this revision
caught the split cleanly.

| Endpoint | Status |
|---|---|
| `GET anyembed.xyz/` (page host root) | **HTTP 451** |
| `GET /api/v1/embed-attest`, `/api/v1/session`, `/api/providers`, `/api/meta`, `/api/known-server`, `/api/skip-times`, `/api/view-count/<id>` | **200** |
| `GET /api/v1/stream/1429?is_tv=true&season=1&episode=1&force_provider=111movies` | **200** |
| `GET /api/proxy?url=…whysosigmabro.fun/api?d=<opaque>` | **200** ×many |
| `GET /api/settings` | **500** |
| `GET /api/user/bookmarks`, `/likes`, `/progress`, `/provider-favorites` | **500** |
| `POST /api/v1/presence`, `POST /api/user/event`, `POST /api/view-count` | **503** |

The embed page itself displays a banner: **`Maintenance: Actions are currently read-only`**
— which is consistent with the split above. So §3's M1 reading is now better explained:
SmashyStream's degradation is **partial and endpoint-specific**, not a global outage, and
the streaming path is the part that still works. Recorded as an availability state, not as
a contradiction.

Also newly visible: the stream request carries **`force_provider=111movies`**, i.e. the
aggregator is fronting an upstream source named *111movies*. That is aggregation detail we
did not previously have, and it does not change any role decision.

---

## 12. Dataset coverage (§1 of the brief)

The brief asks for 23 titles across five classes with multiple seasons and specials.

| Class | Needed | Identified | Playback-confirmed |
|---|---|---|---|
| Movies | 5 | 1 — Fight Club (550) | 1 |
| Western TV | 5 series, ≥2 eps each | 1 — Breaking Bad (1396) | **0** |
| Korean | 5 dramas, ≥2 eps each | 1 — Squid Game (93405) | 1 |
| Anime movies | 3 | 2 — Spirited Away (129), Your Name. (372058) | 2 (SmashyStream only) |
| Anime series | 5, ≥2 eps each | 1 — Attack on Titan (1429) | 1 (both providers) |
| Specials (season 0) | required | 1 — Breaking Bad S0 | 0 |

**Coverage: 6 of 23 titles, 6 playback-confirmed sessions, 0 second episodes, 0 specials,
0 Western-TV sessions.** The two biggest holes are now **Western TV** — a class with
**zero** sessions even though it is half of the primary MOVIES/WESTERN TV strategy — and
**Frembed**, which has never been measured in any class at all.

---

## 13. Carried forward, unchanged

- The brief's remaining sections still lack the sample they require. §16 continues to
  resolve to **STRATEGY PROVISIONAL — NOT ENOUGH REAL VIEWING SESSIONS**.
- Frembed has **still never been measured** in a session: §9's six-axis classification
  cannot be produced from data that does not exist. It stays as a broad-resolution
  fallback, unmoved, on the existing evidence and the existing UX concerns.
- SuperEmbed stays removed; VOE and Dood stay removed. Nothing measured here changes that.
- The CAPTCHA removal is untouched by this work and still needs its §14 non-regression
  pass.
- No provider was probed in a way that circumvents any protection. The Adscore, WASM and
  bot-detection components observed in §4.2 were **read from the request log as evidence
  and were not intercepted, bypassed or modified**; the only direct navigations made were
  to URLs our own UI already offers ("Ouvrir dans un nouvel onglet") or their origin roots.
