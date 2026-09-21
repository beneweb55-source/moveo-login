# Moveo player strategy

**STATUS: PROVISIONAL — NOT ENOUGH REAL VIEWING SESSIONS.** The sample behind the
orders below is **seven playback-confirmed sessions and three failed attempts**, with **no
second episode and no special ever played** and **no French audio ever observed**
(`docs/player-validation-2026-09-21.md` §2, §16, §17). In this pass one order changed
because measurement contradicted it — **anime movies**, where the primary failed both
films tested — and one stated reason was withdrawn entirely, VidLink's "multiple audio
tracks", which was a misreading of DASH video rungs. Treat every order here as the
best-supported guess so far, not as a verified one.

**Measurement date: 2026-09-21.** Every figure here was observed on that date
unless the row says otherwise. Nothing in this document is inferred from a
provider's own marketing, from a "VF"/"VOSTFR" label, or from a French title.

**The rule this document is written under.** Metadata is not evidence. A
provider claiming to serve a language, a button labelled VF, and a French title
are all *claims*, and none of them count as language availability. Only an
observed audio or subtitle track does. Where that observation does not exist,
this document says so instead of estimating.

---

## 1. The reliability rule, stated before any number

A session counts as a **success** only when ALL of the following held:

1. the correct title,
2. the correct season,
3. the correct episode,
4. an appropriate language or version,
5. the player loaded,
6. actual playback **started**,
7. the media **progressed**,
8. playback remained functional afterwards.

None of these count on their own: HTTP 200, an iframe loading, a title
rendering, a Play button existing, a manifest being fetched. Each of those is a
step towards a session, not a session.

Reliability is therefore reported as a **count out of a count** (`24/30`), never
as a percentage, and where the sample is too small it is reported as the literal
string **NOT ENOUGH REAL PLAYBACK SESSIONS**. No number below is extrapolated,
rounded into confidence, or carried over from a different content type.

**How many sessions actually exist.** Three exist, and this number is the reason
most cells below read NOT ENOUGH:

| | Sessions | Where |
|---|---|---|
| Playback confirmed end to end | **7** | Movies 1 (VidLink), **Western TV 1 (SmashyStream)**, Korean 1 (VidLink), anime movies 2 (SmashyStream), anime series 2 (VidLink + SmashyStream) |
| Playback attempted and failed | **3** | Movies 1 (SmashyStream, M1), anime movies 2 (VidLink, AM1/AM2) |
| Classes with **no** session | **0** | all five classes now have at least one |
| Second episodes played | **0** | no series has been played past E1 |
| Specials (season 0) played | **0** | none |

The per-session record, with the instrument that confirmed each one, is
`docs/player-validation-2026-09-21.md` §2. Every other cell in this document is a
*partial* observation and is labelled as such at the point it is used.

---

## 2. Current providers

Six providers are integrated. Two Sibnet variants are integrated separately
(they are a scrape of our own API, not a URL-template provider).

| Provider | Host | Automatic? | Measured playback | Subtitles | Specials | Mobile |
|---|---|---|---|---|---|---|
| **SmashyStream** | `anyembed.xyz` | yes | **yes** | unknown | **yes** | yes |
| **VidLink** | `vidlink.pro` | yes | **yes** | yes | unknown | yes |
| **Frembed** | `frembed.surf` | yes | unknown | yes | unknown | yes |
| VidSrc.to | `vidsrc.to` | no — manual | unknown | unknown | unknown | unknown |
| VidSrc.me | `vidsrc.me` → `vidsrc.sh` | no — manual | unknown | unknown | unknown | unknown |
| 2Embed | `www.2embed.cc` | no — manual | unknown | unknown | unknown | unknown |
| Sibnet VF | `video.sibnet.ru` | no — manual | unknown | unknown | unknown | unknown |
| Sibnet VOSTFR | `video.sibnet.ru` | no — manual | unknown | unknown | unknown | unknown |

Every capability cell that is not `yes` is `unknown`, which is not the same as
`no`. "We did not observe it" and "it does not exist" are different claims, and
only the first is supported.

---

## 3. Default by content type

Selection is implemented once, in `lib/playerStrategy.ts`. This table is the
same decision written out for humans; if the two ever disagree, the code is what
runs.

| Content type | DEFAULT (PRIMARY) | FALLBACK #1 | FALLBACK #2 |
|---|---|---|---|
| **Movies** (Western) | SmashyStream | VidLink | Frembed |
| **Western TV** | SmashyStream | VidLink | Frembed |
| **Korean drama** | VidLink | SmashyStream | Frembed |
| **Anime movies** | SmashyStream | VidLink | Frembed |
| **Anime series** | VidLink | SmashyStream | Frembed |
| **Any special** (TMDB season 0) | SmashyStream first, then the class order | | |

**Why SmashyStream leads the Western classes.** It is the only provider whose
playback was confirmed inside a real Moveo journey (§5), and the only one
measured resolving a special to the correct episode rather than substituting
S1E1.

**Why VidLink leads Korean and anime series — and why the reason is not the one
originally written here.** The earlier justification was that VidLink is "the
only provider measured carrying multiple audio streams *and* fetching a subtitle
track". **The multiple-audio half is falsified.** On every title measured,
VidLink served exactly **one** audio AdaptationSet, and `multiLang=0` is what it
is asked for — the original reading was a misreading of *video* Representation
ids. See `docs/player-validation-2026-09-21.md` §1 and §5.2. The corrected
reason rests on measurement: on Korean, VidLink served `lang="kor"` — the
original track rather than a dub — alongside a working subtitle track and a
1080p ladder, and on anime series it served the episode at 1080p HEVC. For these
classes the crux is that the **original-language audio** be present, so
original-track evidence outranks generic playback evidence.

**Why SmashyStream now leads anime movies.** This is a change forced by
measurement on 2026-09-21, and it is scoped to anime **movies** only. VidLink
failed on both anime films tested — *Spirited Away* (TMDB 129) returned "We
Couldn't Find This Content" despite HTTP 200, and *Your Name.* (TMDB 372058)
matched the title but fetched no manifest and never started across two Play
presses and 40+ s — while SmashyStream played both. VidLink was verified
reachable throughout, so these are catalogue results, not connectivity results,
and the comparison was controlled (same title, same profile, same minute).
Anime **series** is deliberately left VidLink-first, because there VidLink was
measured playing the episode at 1080p HEVC and SmashyStream played it too — so
the contradiction does not extend to that class. Two titles is a thin basis and
it is recorded as such; it is not presented as a rate.

**Why the default is no longer Frembed, and why there is no longer a single
default at all.** Until 2026-09-21 the default was one constant, `"Frembed"`. Its
measured consequence: every first-time visitor was given the one provider that
produced no playback in a real journey **and** opened three popup tabs, while the
provider that played the same film with a correct advancing timecode and zero
popups sat at the wrong end of the list.

The constant was retargeted first and then **deleted outright**, on the same date.
Retargeting it to `"SmashyStream"` would have fixed the immediate symptom while
leaving the structural defect: a single name cannot express "which source, for
which kind of content", and a second declaration of "the default" sitting in the
registry is somewhere a future change can reach for and silently reinstate one
source for everything. After the move it had no production caller left —
`resolveStoredProvider` takes its fallback as a parameter, and the only caller
passes the content class's PRIMARY.

`defaultProviderName` in this module is therefore the **only** place a default is
written down, and `tests/playerStrategy.test.ts` asserts the constant's absence
rather than a matching value, so it cannot quietly come back.

---

## 4. Manual providers, disabled providers

**MANUAL_ONLY — offered, never chosen for the user:** VidSrc.to, VidSrc.me,
2Embed, Sibnet VF, Sibnet VOSTFR.

Each of these is a legitimate thing for a user to try, and none has evidence
strong enough to be selected *for* someone. They render after the automatic
sources in the source list. Removing them would be a capability regression, not
a safety win.

**DISABLED / REMOVED — not in the registry at all:**

| Provider | Status | Reason |
|---|---|---|
| **SuperEmbed** (`multiembed.mov`, `streamingnow.mov`) | **REMOVED 2026-09-21** | Measured: framing it displayed **adult advertising inside our own player** — its content for a Korean drama episode was an adult webcam landing page reached via redirectors, with a Cloudflare Turnstile challenge retry-looping in the frame. Its `playbackObserved` was `unknown`: no media was ever observed from it. |
| VOE, Dood (premium tier) | REMOVED earlier | Product does not support them; the stored URLs were measured dead (voe.sx answered 404) and were being selected as the default source. |

SuperEmbed's removal also deleted its two origins from `frame-src`. That is the
policy getting **narrower**, and `tests/csp.test.ts` enforces the
correspondence in both directions: those origins cannot be re-permitted without
a registry entry, and a registry entry cannot be added without reintroducing a
measured product-safety defect. There is no flag, environment variable, or
stored preference that brings it back.

---

## 5. End-to-end evidence

### 5.1 The one confirmed session — MOVIES, Western, English-original

| Field | Value |
|---|---|
| Provider | SmashyStream |
| Title | Fight Club (TMDB 550), framed in our own `/movie/550` |
| Confirmation | Its own on-screen timecode advanced **0:06 → 0:16**, against a displayed duration of **2:19:08** (Fight Club's true runtime) |
| Frames | Visibly different decoded content between the two samples |
| Popups | **Zero**, across two user-activation clicks |
| Verdict | **PLAYBACK CONFIRMED** |

**Reliability: 1/1.** One out of one. This is a real result and it is also a
sample of one, which is why no other cell in this document is derived from it.

### 5.2 Direct media-element measurements (not full journeys)

These are stronger than an iframe load — they read the media element itself
(`readyState`, advancing `currentTime`, non-zero decoded dimensions) — but they
were not observed as a complete Moveo session with title, season, episode and
language all verified, so they are **not** counted in §5.1's total.

| Provider | Title | Measured |
|---|---|---|
| SmashyStream | Fight Club (550) | 8348.4 s duration, 1280×534 |
| SmashyStream | Breaking Bad "Pilot" (1396 S1E1) | 3479.9 s duration, 1280×720 |
| SmashyStream | Breaking Bad specials (1396 S0E1) | resolved to the **correct** special, "Good Cop / Bad Cop" |
| VidLink | Korean + anime | DASH manifest, init segments, 14 consecutive chunk-stream segments |

**Western TV, reliability: NOT ENOUGH REAL PLAYBACK SESSIONS.** The Breaking Bad
numbers are duration and resolution readings, not a completed journey session.
One series episode observed on the media element is not a viewing session, and
reporting it as one would be the exact substitution this document forbids.

### 5.3 The Frembed observation that did not reproduce

| Attempt | Result |
|---|---|
| First run | Streamed a master playlist and segments 1–7 — looked like playback |
| Re-run, one hour later, fresh context, direct embed URL | **No manifest fetched at all**; pre-roll advertising produced hundreds of requests instead |
| Inside a real Moveo journey (same journey as §5.1) | **No playback** across two user-activation attempts; **three popup tabs** (an interstitial and a redirect to YouTube); ad beacons to **four** third-party hosts; AdScore anti-bot active; its "SERVEURS" control opened no server list |

Frembed's `playbackObserved` remains `"unknown"` rather than `"no"`, for a
stricter reason: its player is cross-origin, so the media-element read that flag
requires is impossible on any viewport. "Unknown" here means *unmeasurable by
the method this project accepts*, not *untested*.

**Frembed reliability: NOT ENOUGH REAL PLAYBACK SESSIONS** — one non-reproducing
observation is not a result in either direction.

---

## 6. Language coverage

### French

**French reliability: NOT ENOUGH REAL PLAYBACK SESSIONS.** A French-language
session has now been observed — the first in this project's history — so this
section is no longer empty. It is still **one title**, and nothing here is a rate.

| Fact | Evidence |
|---|---|
| A French subtitle track exists on at least one provider | Frembed fetched a French subtitle file (HTTP 200). **Reproduced on two separate runs.** |
| A French subtitle track can be **selected and rendered during playback** | VidLink: its captions menu listed 17 languages including **Français**; selecting it fetched `cacdn.hakunaymatata.com/…/079a961414f58271cd4bb3dad01b9aab.srt` (HTTP 200) and French text then rendered on screen during active playback. |
| French **audio** on that title | **Absent, and not selectable.** The manifest declares exactly one audio track, `lang="eng"`, and VidLink's UI has no audio-track selector (*Settings* = Captions / Customize / Playback; *Playback* = rate only). Recorded as absent **on this title**, not as a VidLink-wide claim. |
| Its scope | Both subtitle observations are **one title each** (a Korean drama, TMDB 93405; and TMDB 550). |
| Sibnet VF availability | Per-title, decided by the scrape. Absent variants render as "Indisponible" rather than being hidden. |

**What the strategy therefore does, and refuses to do.** A French viewer's
preference order is French audio, then French subtitles, then VOSTFR. The
provider lists are **not** reordered for that preference, deliberately. Note the
distinction the two French rows above now draw: Frembed is measured to **fetch** a
French subtitle file, whereas VidLink is measured to **render French subtitles
during playback** — the stronger of the two observations, and the one that
satisfies the brief's "correct content + actual playback + usable French
subtitles". Neither is a rate, and neither justifies reordering on its own.

**Both halves of the sentence that used to stand here are now falsified.**
VidLink's "multi-audio manifest" was never multi-audio (§5.2), and its track
languages **have** been read: `eng` on the Western film, `kor` on the Korean
series. So VidLink can now be credited with a measured, usable French **subtitle**
track — which it previously could not — while still not being claimed for French
**audio**, which was absent on the one title where it was checked.

What a French viewer gets instead: the **Sibnet VF variant offered first**
(`lib/playerStrategy.sibnetOrder`), every provider still one click away, and no
provider labelled French when that was never measured. The VF-first ordering is
a preference between two variants of the same source; it is explicitly **not** a
claim that VF carries French audio for any given title.

### English

**English reliability: NOT ENOUGH REAL PLAYBACK SESSIONS.** The one confirmed
session (§5.1) was an English-original film whose audio track language was not
independently read — the film played, and that is all that was established. It
is not evidence that English audio is available on the other providers or for
other titles.

Non-French viewers get VOSTFR ahead of VF, because VOSTFR preserves the original
audio track and is therefore the closer match to an original-version preference.
That is a preference between variants, not a claim about English availability.

### Korean

**Korean reliability: NOT ENOUGH REAL PLAYBACK SESSIONS.**

Representative coverage, so the strategy does not rest on one title:

| Observation | Provider |
|---|---|
| Correct episode title resolved (`Squid Game 2021 · S01 E01`) | VidSrc.to |
| Correct episode title resolved | Frembed |
| Resolved to an adult landing page instead of a player — provider since removed | SuperEmbed |
| Single **original-language** audio track (`lang="kor"`, not a dub) + subtitle track present | VidLink |
| No playback within ~14 s of its own Play being clicked | VidSrc.to |
| No media observed | 2Embed |

Enough titles were checked to see that **no single provider resolves all Korean
content**, which is why the class has a three-deep automatic order rather than a
single default. It is not enough to state a success rate.

### Anime

**Anime reliability: NOT ENOUGH REAL PLAYBACK SESSIONS.**

| Observation | Provider |
|---|---|
| Single original-language audio track + subtitle track present | VidLink |
| Playback observed, anime **series**, 1080p HEVC | VidLink (AS2, DASH segments) **and** SmashyStream (AS1, advancing timecode) |
| Playback observed, anime **movie** | SmashyStream on both films tested; VidLink on neither (AM1–AM4) |

Anime is a **first-class class**, not a side effect of generic TV logic. The
current data model does carry what is needed — TMDB's `original_language` plus
the Animation genre id (16) — so a separate data model was not required. What
*was* required was for the strategy to read those two facts, and it now does.

Anime depends on the original Japanese audio track being present rather than on
a dub. The reason the anime classes lead with VidLink is **not** that VidLink was
measured carrying multiple audio streams — that reading was withdrawn (§5.3 of
`docs/player-validation-2026-09-21.md`): the extra `stream` ids were *video*
rungs, and the audio stream was a single `ja`/`kor` track in both cases. The
reason that survives measurement is narrower: VidLink exposed the
original-language track **and** a selecting, rendering subtitle control on the
one title where both were inspected, and it is the only provider confirmed
playing an anime **series** with interleaved DASH video *and* audio segments.

The split between the two anime sub-classes is deliberate and is what the
measurements actually support: **anime series** leads with VidLink (AS2
confirmed, and SmashyStream also confirmed on AS1), while **anime movies** leads
with SmashyStream, which played both films tested (AM1, AM2) where VidLink
produced a not-found panel on one and never fetched a manifest on the other
(AM3, AM4). Treating "anime" as one class would have hidden that reversal.

---

## 7. Subtitle coverage

| Provider | Subtitles | Evidence |
|---|---|---|
| VidLink | **yes** | A subtitle file was fetched, and a French subtitle track was selected and rendered during playback (§6) |
| Frembed | **yes** | A French subtitle file was fetched (HTTP 200), reproduced on two runs |
| SmashyStream | unknown | Not measured |
| VidSrc.to / VidSrc.me / 2Embed / Sibnet | unknown | Not measured |

"Subtitles yes" means **a subtitle track was observed to exist**, not that it was
observed rendering inside our player, and not that it covered the language the
viewer wanted.

---

## 8. Mobile and desktop

| Platform | Status |
|---|---|
| **Desktop** | All measurements in this document were taken on desktop Chromium. This is the only platform on which any claim here rests. |
| **Mobile** | **NOT MEASURED.** SmashyStream, VidLink and Frembed declare `mobile: "yes"` in the registry, but that is a declared capability, not an observation. No mobile playback was observed. The other providers' mobile behaviour is `unknown`. |

No claim is made about mobile playback for any provider.

---

## 9. Provider integration classification

| Provider | Classification | Notes |
|---|---|---|
| SmashyStream | **INTEGRATED** — automatic, PRIMARY for Western classes **and anime movies**; FALLBACK #1 for Korean and anime series | In-journey playback confirmed on anime **movies** (AM3, AM4) and anime **series** (AS1). On the single **Movies** session it did not play: M1 failed as PRIMARY, while its fallback VidLink played the same title (M2) — see Limitations 9. **Partially degraded:** streaming endpoints served HTTP 200 while account/telemetry endpoints returned 500/503 and its root host answered HTTP 451, with a "read-only" maintenance banner — so a 200 on one endpoint is not a 200 on the service. Its load time sits on the `IFRAME_LOAD_TIMEOUT_MS` boundary (Limitations 4). |
| VidLink | **INTEGRATED** — automatic, PRIMARY for Korean and anime series; FALLBACK #1 for anime movies | In-journey playback confirmed on Korean (K1) and anime series (AS2) with interleaved DASH video+audio segments; a French **subtitle** track was selected and rendered during playback. **Does not autoplay** — the user must press Play, so our advisory is correct before the press and stale after it. `multiLang=0` requested; single original-language audio track. Carries a `disableAdblock` warning and an ad chain whose creative id matched a popup opened from our page (see Limitations 6). |
| Frembed | **INTEGRATED** — automatic, last in every order | Broadest resolution coverage measured; **playback never observed in-journey, and not measurable from our side** (Limitations 4); French subtitle file fetched twice; popups and ad beacons in-journey. Kept for resolution breadth and because absence of observability is not absence of playback — but it is not counted as working anywhere. |
| VidSrc.to | **INTEGRATED** — MANUAL_ONLY | Correct Korean episode title resolved; no playback observed |
| VidSrc.me | **INTEGRATED** — MANUAL_ONLY | Same upstream player as VidSrc.to; host mid-migration to vidsrc.sh |
| 2Embed | **INTEGRATED** — MANUAL_ONLY | Player area was `about:blank` plus a redirect layer; no media observed |
| Sibnet VF / VOSTFR | **INTEGRATED** — MANUAL_ONLY, scrape-backed | Existence is per-title; unavailable variants render as "Indisponible" |
| SuperEmbed | **REMOVED** | Adult advertising inside our own player; no media ever observed; its own anti-bot gate retry-looping |
| VOE, Dood | **REMOVED** | Unsupported by the product; stored URLs measured dead |
| Others evaluated during provider discovery | **DOCUMENTED, NOT INTEGRATED** | See `docs/provider-matrix.md`. Kept as documentation, not as code paths. |

---

## 10. What the player guarantees

These are product guarantees implemented in code and covered by tests, not
measurements:

- **A manual choice is authoritative.** Nothing automatic can displace it, on
  the render where it is made or any later one. Enforced in the reducer
  (`SELECT_AUTO` returns the state untouched when `selection === "manual"`) and
  asserted in `tests/playerState.test.ts`.
- **No silent substitution.** If a source fails, the player shows a failure
  panel and offers the next source. It never swaps in a different provider
  without the user acting.
- **No infinite retry loop, no random fallback.** The only thing that advances
  the source is the user pressing a control, which is why
  `nextProviderName` wraps — repeated presses must always reach somewhere new.
- **Never a blank player.** The phases are distinct and labelled: LOADING,
  LOADED / PLAYBACK UNKNOWN, PLAYBACK CONFIRMED, FAILED, UNAVAILABLE. There is
  deliberately no "PLAYING" phase that could be reached without evidence, and
  the UI never says a video is playing unless playback was actually observed.
- **One provider system.** Identity, URL grammar, origins and measured
  capabilities live in `lib/providers.ts`. Ordering, roles and defaults live in
  `lib/playerStrategy.ts`. There is no second registry and no second selection
  path.

---

## 11. Known limitations

1. **Reliability data is still thin, but every class now has at least one
   session.** Seven playback-confirmed sessions exist across all five classes —
   see `docs/player-validation-2026-09-21.md` §2, with Western TV in §14. Every
   other cell remains NOT ENOUGH REAL PLAYBACK SESSIONS: **no second episode and
   no special has ever been played**, and Western TV — half of the primary
   strategy — rests on **one** episode of **one** series. Not disproving an
   assumption once is not confirming it, and this cannot be closed by reasoning —
   it needs more real sessions.
2. **No French *audio* session has been observed, and none is claimed.** What
   has been observed is a French **subtitle** track selected and rendered during
   playback (VidLink, one title, §6). The French preference order is still not
   implemented beyond the Sibnet variant ordering.
3. **The earlier "VidLink's Play control did not start playback" limitation is
   superseded by measurement.** On AS2 a genuine Play press started playback and
   produced consecutive interleaved DASH segments, so the previously
   *undetermined* interaction defect did not reproduce. What is true instead is
   that VidLink **does not autoplay**: the player mounts at `0:00` behind a
   poster with a Play glyph, so a user must press Play — which also means our
   advisory is correct until they do and stale after they have (§6).
4. **`IFRAME_LOAD_TIMEOUT_MS = 20000` is too tight for SmashyStream.** The same
   embed URL missed the 20 s budget once and then loaded in 15–16 s on retry, so
   a merely-slow provider is reported to the user as "Le lecteur ne répond pas"
   and its player is unmounted. Recorded with evidence and **deliberately not yet
   changed**, because the correct value needs a load-time distribution we do not
   have — two samples cannot set a constant.
4. **Frembed is unmeasurable by the accepted method** (cross-origin player), so
   its `playbackObserved` can never be resolved to `yes` or `no` from our side
   without a different technique. It stays last on UX grounds.
5. **No mobile measurement at all.**
6. **Advertising behaviour is not modelled in the strategy, and one instance is
   now attributed rather than merely observed.** SmashyStream, VidLink and
   Frembed were each observed with popups or ad beacons in at least one context;
   only SuperEmbed's was disqualifying, because it was adult advertising inside
   our own player. For **VidLink** the chain is now identified: a popup opened
   from our page to `browserpro.online` carrying `network=adcash`, and inside
   VidLink's own frame the same **creative id `24147990`** and **source id
   `9905914`** appeared in `adexchangerapid.com` beacons — the same identifiers,
   so this is not a coincidental popup. VidLink is marked PRIMARY for two
   classes *and* carries `warningKey: "disableAdblock"` in `lib/providers.ts`,
   which means Moveo asks users to switch off the protection that stops this
   chain. Recorded here rather than acted on: changing the warning copy or the
   ordering is a product decision, and neither the copy nor the order has been
   changed in this pass.
7. **Nothing here is a claim that a provider "works".** A provider works for a
   *title*, on a *platform*, at a *moment*. One of the three automatic providers
   — **Frembed** — has never been confirmed playing inside a real Moveo journey
   and, by Limitations 4, cannot be confirmed by the method used here.
8. **The `frame-src` list and the registry are held together by a test, not by
   construction.** `next.config.ts` still holds a literal array;
   `tests/csp.test.ts` fails if the two drift. That is a guard, not a fix.
9. **The Movies ordering is contradicted by the only Movies session, and has
   deliberately been left as it is.** In M1 the PRIMARY provider failed and
   FALLBACK #1 played the same title. One session is not enough to reorder a
   class on, and the M1 failure had a *cause* that is not the provider's general
   behaviour — its backend was mid-degradation (§4.2 of the validation log). So
   the honest state is: **the Movies order is unverified, not verified**, and it
   is listed here rather than quietly treated as measured.
