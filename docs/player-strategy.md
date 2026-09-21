# Moveo player strategy

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

**How many sessions actually exist.** Exactly **one** full session has been
observed end to end, and it is the SmashyStream Fight Club session in §5. One
further observation (Frembed) was made and did **not** reproduce. Everything else
in this document is a *partial* observation and is labelled as such at the point
it is used. That is the reason almost every cell below reads NOT ENOUGH.

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
| **Anime movies** | VidLink | SmashyStream | Frembed |
| **Anime series** | VidLink | SmashyStream | Frembed |
| **Any special** (TMDB season 0) | SmashyStream first, then the class order | | |

**Why SmashyStream leads the Western classes.** It is the only provider whose
playback was confirmed inside a real Moveo journey (§5), and the only one
measured resolving a special to the correct episode rather than substituting
S1E1.

**Why VidLink leads Korean and anime.** It is the only provider measured
carrying multiple audio streams *and* fetching a subtitle track, and that
observation was made on Korean and on anime content. For those classes the crux
is which audio and subtitle tracks exist, so track evidence outranks playback
evidence. This is a deliberate trade, and its cost is recorded in §6: VidLink's
own on-screen Play control did not start playback under emulated input.

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

**French reliability: NOT ENOUGH REAL PLAYBACK SESSIONS.** No French-language
playback session has been observed. Nothing in this section is a success claim.

What IS measured, and it is one data point:

| Fact | Evidence |
|---|---|
| A French subtitle track exists on at least one provider | Frembed fetched a French subtitle file (HTTP 200). **Reproduced on two separate runs.** |
| Its scope | Measured on **one title** (a Korean drama, TMDB 93405). |
| Sibnet VF availability | Per-title, decided by the scrape. Absent variants render as "Indisponible" rather than being hidden. |

**What the strategy therefore does, and refuses to do.** A French viewer's
preference order is French audio, then French subtitles, then VOSTFR. The
provider lists are **not** reordered for that preference, deliberately. The only
measured French capability anywhere belongs to Frembed — the provider measured to
fail and to open popups in a real journey — and promoting it ahead of working
providers on the strength of one title's subtitle fetch would make the strategy
depend on one lucky title, which is precisely the error the brief warns against.

VidLink's multi-audio manifest is real, but its **track languages were never
read**, so it cannot be claimed as French either.

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
| Multi-audio streams + subtitle track present | VidLink |
| No playback within ~14 s of its own Play being clicked | VidSrc.to |
| No media observed | 2Embed |

Enough titles were checked to see that **no single provider resolves all Korean
content**, which is why the class has a three-deep automatic order rather than a
single default. It is not enough to state a success rate.

### Anime

**Anime reliability: NOT ENOUGH REAL PLAYBACK SESSIONS.**

| Observation | Provider |
|---|---|
| Multi-audio streams + subtitle track present | VidLink |
| Playback observed on anime content | VidLink (media element) |

Anime is a **first-class class**, not a side effect of generic TV logic. The
current data model does carry what is needed — TMDB's `original_language` plus
the Animation genre id (16) — so a separate data model was not required. What
*was* required was for the strategy to read those two facts, and it now does.

Anime depends on the original Japanese audio track being present rather than on
a dub, which is why the anime classes lead with the provider measured carrying
multiple audio streams.

---

## 7. Subtitle coverage

| Provider | Subtitles | Evidence |
|---|---|---|
| VidLink | **yes** | A subtitle file was fetched, and the manifest carried three streams |
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
| SmashyStream | **INTEGRATED** — automatic, PRIMARY for Western classes | Only confirmed in-journey playback; only measured specials-correct provider |
| VidLink | **INTEGRATED** — automatic, PRIMARY for Korean/anime | Only measured multi-audio + subtitle provider; Play control did not start playback under emulated input |
| Frembed | **INTEGRATED** — automatic, last in every order | Broadest resolution coverage measured; non-reproducing playback; popups and ad beacons in-journey |
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

1. **Almost no reliability data exists.** One confirmed session. Every other
   cell is NOT ENOUGH REAL PLAYBACK SESSIONS. This is the largest gap in the
   document and it cannot be closed by reasoning — it needs real sessions.
2. **No French playback session has ever been observed.** No provider is
   claimed to serve French audio, and the French preference order is not
   implemented beyond the Sibnet variant ordering. Closing this needs per-title
   measurement of actual audio and subtitle tracks across several titles.
3. **VidLink's Play control did not start playback under emulated input** while
   the element's own `play()` resolved and ran. Click interception was ruled out
   (`document.elementFromPoint` at the video centre returns the VIDEO, with no
   overlay above it). The cause is **undetermined** — an unexplained interaction
   defect, which is why VidLink does not lead the classes where SmashyStream has
   direct evidence.
4. **Frembed is unmeasurable by the accepted method** (cross-origin player), so
   its `playbackObserved` can never be resolved to `yes` or `no` from our side
   without a different technique. It stays last on UX grounds.
5. **No mobile measurement at all.**
6. **Advertising behaviour is not modelled in the strategy.** SmashyStream,
   VidLink and Frembed were each observed with popups or ad beacons in at least
   one context; only SuperEmbed's was disqualifying, because it was adult
   advertising inside our own player. The remaining behaviour is recorded in
   `docs/provider-matrix.md` and reflected in the ordering, but it is not a
   field the code can branch on.
7. **Nothing here is a claim that a provider "works".** A provider works for a
   *title*, on a *platform*, at a *moment*. Two of the three automatic providers
   have never been confirmed playing inside a real Moveo journey.
8. **The `frame-src` list and the registry are held together by a test, not by
   construction.** `next.config.ts` still holds a literal array;
   `tests/csp.test.ts` fails if the two drift. That is a guard, not a fix.
