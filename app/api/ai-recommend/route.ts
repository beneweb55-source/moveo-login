import { NextResponse } from 'next/server';
import axios from 'axios';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { GoogleGenAI, Type } from '@google/genai';
import pool from '@/lib/db';
import { getJwtSecret } from '@/lib/jwtSecret';
import { clientKeyFrom, createRateLimiter } from '@/lib/rateLimit';
import { filterContent } from '@/utils/contentFilter';
import {
  buildTasteProfile,
  hasEnoughSignal,
  seenTitleKeys,
  titleKey,
  type MediaType,
} from '@/lib/tasteSignals';
import {
  featuresFromCache,
  scoreCandidates,
  signalsFromHistory,
} from '@/lib/recommendationScoring';
import { TITLE_FEATURE_LANGUAGE } from '@/lib/titleFeatures';

/**
 * The recommendations section: candidates from TMDB, RANKED BY THE VIEWER'S OWN
 * MEASURED TASTE, with the model reduced to writing the sentence.
 *
 * ─── WHAT WAS WRONG ──────────────────────────────────────────────────────────
 *
 * 1. THE SCORE WAS INVENTED. The prompt instructed the model to answer with a
 *    percentage bounded by an arbitrary ceiling that rose with the number of
 *    films in the history, and the response schema required that number. So it
 *    moved with nothing but the LENGTH of the history and carried an authority it
 *    had not measured. §3. The literal tiers are not quoted here on purpose: a
 *    test asserts that no figure of that shape exists anywhere in this file, and
 *    a comment reproducing it would defeat the check it describes.
 *
 * 2. IT WAS DEAD BEFORE IT WAS DISHONEST. The route read `genre_ids` off the
 *    posted history, and nothing that posts to it carries that field: the
 *    client's stored history holds a title, a poster and a position. The genre
 *    count was therefore always empty, so the route answered `{show:false}` at
 *    its own "nothing to discover from" guard and never reached the model at all.
 *    Had it reached it, it would have thrown: the catalogue helper it used
 *    resolves a RELATIVE url, and axios under Node cannot resolve one — measured,
 *    not reasoned: `ERR_INVALID_URL | Invalid URL`. Both faults landed on the same
 *    silent outcome, so the invented percentage in the prompt was unreachable code
 *    rather than a lie anyone ever read.
 *
 * ─── WHAT REPLACES IT ────────────────────────────────────────────────────────
 *
 * The score is now `affinityScore` from `lib/tasteSignals.ts` — arithmetic that
 * was already written and already tested, applied to a profile built from the
 * viewer's own observations. It is reproducible: the same signals produce the
 * same number, and that number is the share of the taste mass we have MEASURED
 * for this viewer that the candidate is made of.
 *
 * TMDB supplies the catalogue and nothing else. The model receives the already
 * ranked films and writes one sentence each; it is never asked for a number, and
 * `score` is absent from its response schema. Ask for a number and you get a
 * number, whatever was measured.
 *
 * And when there is nothing to measure, this route says so: `show:false` with a
 * `reason` naming which input was missing. A section that is empty because the
 * viewer has no signal, and one that is empty because the cache was never filled,
 * look identical on screen — and only one of them is about the viewer. §3.
 *
 * ─── WHERE THE VIEWER'S OWN SIGNALS COME FROM ────────────────────────────────
 *
 * A SIGNED-IN viewer's history is read from `watch_history`, scoped to their own
 * `user_id` from the verified token and never from the request (§23), and their
 * genres come from the `title_features` cache. The posted body is still merged as
 * a second source, because the client holds the guest history it has not yet
 * synced — but it is used for PAIRS only, and never for taste: a caller cannot
 * supply the genres it wants to be recommended from, only the titles it claims to
 * have watched.
 *
 * ─── THE RATE LIMIT ──────────────────────────────────────────────────────────
 *
 * Still abuse friction and not an access control (see lib/rateLimit.ts). It is
 * ten a minute rather than twenty because one call now spends up to four upstream
 * requests — two discovery pages and, once per server instance, the genre lists —
 * and holding the old allowance would have doubled the fan-out behind it. The
 * section loads at most once per profile visit; ten is still far above human
 * cadence for that.
 */
const RATE_LIMIT = createRateLimiter({ windowMs: 60_000, maxRequests: 10 });

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_TIMEOUT_MS = 8_000;
/** Bounds the profile's input. A viewer with more history than this is not better served by reading all of it. */
const HISTORY_LIMIT = 200;
const CANDIDATE_LIMIT_PER_TYPE = 20;
const FILM_LIMIT = 10;
const SECTION_TITLE = 'Moveo te recommande';
/** Genres named in the prompt. Enough to describe a taste, short enough to stay true of it. */
const PROMPT_GENRE_LIMIT = 5;
const OVERVIEW_MAX = 300;
const DISCOVER_MIN_VOTES = 50;

/**
 * The model writes ONE SENTENCE per film, grounded in facts it was given, and
 * nothing else. The instruction is mostly prohibition, and each prohibition is
 * one of the two faults being removed here: it must not produce a number (the
 * score is ours now), and it must not name a genre it was not handed (a model
 * asked to explain a taste it cannot see will invent one).
 */
const SYSTEM_INSTRUCTION = `Tu écris une phrase d'explication pour chaque film ou série qu'on te donne.
Pour chaque titre, écris UNE phrase courte en français (120 caractères maximum) qui dit en quoi il peut correspondre aux genres indiqués.
Interdictions absolues :
- aucun chiffre, aucun pourcentage, aucune note, aucun score ;
- ne cite pas de genre qui ne figure pas dans la liste fournie ;
- n'invente aucun fait : ne t'appuie que sur le résumé fourni et, au besoin, sur le titre lui-même ;
- n'ajoute aucun titre qui ne t'a pas été donné, et aucune clé autre que "key" et "raison".`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    films: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          // `key` and not `id`: a film and a series can share an id, and the
          // model must name which one it is talking about.
          key: { type: Type.STRING },
          raison: { type: Type.STRING },
        },
        required: ['key', 'raison'],
      },
    },
  },
  required: ['films'],
};

type RefusalReason =
  | 'insufficient_signal'
  | 'no_tmdb_key'
  | 'no_candidates'
  | 'history_unavailable'
  | 'features_unavailable'
  | 'tmdb_unavailable'
  | 'invalid_body'
  | 'error';

/**
 * A refusal carries WHY. The client reads `show` and renders nothing either way,
 * so this field is not a UI contract — it is what stops a permanently empty
 * section from being indistinguishable from a viewer who has watched nothing.
 * The counts are about the SIGNAL, never its content: no title, no id and no
 * history entry leaves the server through them (§7).
 */
const refuse = (reason: RefusalReason, detail?: Record<string, number>) =>
  NextResponse.json(detail ? { show: false, reason, detail } : { show: false, reason });

/** The signed-in viewer's id, from the token and from nowhere else. */
async function signedInUserId(): Promise<number | string | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, getJwtSecret());
    const userId = payload.userId;
    // Narrowed rather than cast: both sign-in routes put a numeric `users.id`
    // into this claim, and a token whose claim is not an id is a token this route
    // cannot attribute a read to. Returning null makes it a guest, which is a
    // real answer and not a privilege.
    return typeof userId === 'number' || typeof userId === 'string' ? userId : null;
  } catch {
    return null;
  }
}

/**
 * The account's own history — the strongest signal available, because the server
 * wrote it.
 *
 * `"current_time"` is QUOTED because it is a reserved word in PostgreSQL:
 * unquoted it parses as the `CURRENT_TIME` value function, and the viewer's
 * position comes back as the server's clock. That defect is documented in
 * docs/watch-history-audit-2026-09-22.md and this query inherits the fix from
 * `app/api/watch-time/route.ts`.
 *
 * `media_type IN ('movie','tv')` rather than a list of exclusions: it is the same
 * allowlist the write path enforces, and it also keeps the `admin_adjustment`
 * bookkeeping row — which is not a title — out of a taste profile.
 */
async function readAccountHistory(userId: number | string): Promise<unknown[]> {
  const result = await pool.query(
    `SELECT media_type, media_id, minutes_watched, "current_time", total_duration, last_updated
     FROM watch_history
     WHERE user_id = $1 AND media_type IN ('movie', 'tv')
     ORDER BY last_updated DESC
     LIMIT $2`,
    [userId, HISTORY_LIMIT],
  );
  return result.rows;
}

/**
 * The cached features of those pairs, in one query.
 *
 * One query and not one per title: a history of forty titles would otherwise be
 * forty round trips, which is the request storm §14 rules out — and it is the
 * shape that looks fine in development and melts under a real account.
 *
 * The two arrays are parameters, so nothing here is built by concatenation. A
 * pair whose type is unknown cannot exist in this schema: `media_type` is a
 * CHECK-constrained column and every row is one of the two.
 */
async function readCachedFeatures(
  pairs: ReadonlyArray<{ mediaType: MediaType; mediaId: number }>,
): Promise<unknown[]> {
  const movieIds = pairs.filter((p) => p.mediaType === 'movie').map((p) => p.mediaId);
  const tvIds = pairs.filter((p) => p.mediaType === 'tv').map((p) => p.mediaId);

  if (movieIds.length === 0 && tvIds.length === 0) return [];

  const result = await pool.query(
    `SELECT media_type, media_id, genre_ids, original_language
     FROM title_features
     WHERE (media_type = 'movie' AND media_id = ANY($1::int[]))
        OR (media_type = 'tv'    AND media_id = ANY($2::int[]))`,
    [movieIds, tvIds],
  );
  return result.rows;
}

/**
 * One TMDB discovery page, with the site's own content rule applied.
 *
 * NO GENRE FILTER, AND THAT IS A DECISION. TMDB keeps two genre vocabularies —
 * one for films and one for series — and `buildTasteProfile` pools them into a
 * single term space. That pooling is safe for SCORING: an id that exists in both
 * lists carries the same name in both, and an id that exists in only one simply
 * never matches a title of the other type. It is NOT safe for DISCOVERY, where a
 * series-only id (`10765`, Science-Fiction & Fantasy) sent to `/discover/movie`
 * is not a narrower filter but a meaningless one. Choosing a type for each term
 * would be a guess, so the catalogue is sampled by popularity and the profile
 * does the selecting. Genre-scoped discovery needs the term space split by media
 * type inside `lib/tasteSignals.ts` first, with its own tests — not as a side
 * effect of this change.
 *
 * `filterContent` is applied because this route talks to TMDB directly now, and
 * the site's rule for what it shows must not be skipped just because the request
 * took a different path to the same API.
 */
const discover = async (mediaType: MediaType, apiKey: string): Promise<unknown[]> => {
  const { data } = await axios.get(`${TMDB_BASE_URL}/discover/${mediaType}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    params: {
      sort_by: 'popularity.desc',
      // A floor on votes, not a ranking: it keeps the sample to titles that
      // enough people have seen for "popular" to mean something.
      'vote_count.gte': DISCOVER_MIN_VOTES,
      language: TITLE_FEATURE_LANGUAGE,
      page: 1,
    },
    timeout: TMDB_TIMEOUT_MS,
  });

  const results = (data as { results?: unknown } | null)?.results;
  return Array.isArray(results) ? filterContent(results) : [];
};

/**
 * Genre ids to names, for the prompt only — never for the score.
 *
 * Memoised per server instance because these two lists are static data: fetching
 * them once per PROCESS rather than once per call is the difference between two
 * extra requests per recommendation and two extra requests per deployment.
 *
 * An id defined on both lists is kept from the first one read. They agree — the
 * overlap is Drama, Comedy, Animation, Crime, Documentary, Mystery, Family,
 * Western — so this resolves no conflict, and nothing downstream depends on
 * which list won.
 */
let genreNames: Map<number, string> | null = null;

const loadGenreNames = async (apiKey: string): Promise<Map<number, string> | null> => {
  if (genreNames) return genreNames;

  const headers = { Authorization: `Bearer ${apiKey}` };
  const config = {
    headers,
    params: { language: TITLE_FEATURE_LANGUAGE },
    timeout: TMDB_TIMEOUT_MS,
  };

  try {
    const [movies, series] = await Promise.all([
      axios.get(`${TMDB_BASE_URL}/genre/movie/list`, config),
      axios.get(`${TMDB_BASE_URL}/genre/tv/list`, config),
    ]);

    const names = new Map<number, string>();
    for (const payload of [movies.data, series.data]) {
      const list = (payload as { genres?: unknown } | null)?.genres;
      if (!Array.isArray(list)) continue;
      for (const entry of list) {
        const id = (entry as { id?: unknown })?.id;
        const name = (entry as { name?: unknown })?.name;
        if (typeof id === 'number' && typeof name === 'string' && name !== '' && !names.has(id)) {
          names.set(id, name);
        }
      }
    }

    if (names.size === 0) return null;
    genreNames = names;
    return names;
  } catch (error) {
    console.warn(
      '[ai-recommend] genre lists unavailable, so no explanation will be requested:',
      error,
    );
    return null;
  }
};

export async function POST(req: Request) {
  try {
    if (RATE_LIMIT.isRateLimited(clientKeyFrom(req))) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body: unknown = await req.json().catch(() => null);
    const posted = (body as { history?: unknown } | null)?.history;
    if (posted !== undefined && !Array.isArray(posted)) {
      return refuse('invalid_body');
    }
    const postedRows: unknown[] = Array.isArray(posted) ? posted : [];

    // ── The viewer's own rows ──
    //
    // A signed-in viewer's rows come first, so that where the two sources both
    // hold a title the ACCOUNT's progression is the one that survives the
    // accumulator's tie-breaks. A failed read is NOT a guest: answering
    // "insufficient signal" here would blame the viewer for our database, so the
    // failure is named instead.
    const userId = await signedInUserId();
    let accountRows: unknown[] = [];
    if (userId !== null) {
      try {
        accountRows = await readAccountHistory(userId);
      } catch (error) {
        console.error('[ai-recommend] could not read the account history:', error);
        return refuse('history_unavailable');
      }
    }

    const signals = signalsFromHistory([...accountRows, ...postedRows]);

    // ── What those titles are made of ──
    //
    // From the cache, not from the caller. The cache features are appended last
    // so that `buildTasteProfile`'s map — which keeps the last entry per title —
    // resolves any disagreement in favour of the server's copy.
    let cacheRows: unknown[] = [];
    try {
      cacheRows = await readCachedFeatures(signals.observations);
    } catch (error) {
      console.error('[ai-recommend] could not read title_features:', error);
      return refuse('features_unavailable');
    }

    const features = [...signals.features, ...featuresFromCache(cacheRows)];
    const profile = buildTasteProfile(signals.observations, features, Date.now());

    if (!hasEnoughSignal(profile)) {
      // Fewer than three measurable titles. This is a statement about the signal
      // and not about the viewer, and the three counts say which it is: `titles`
      // counts what we could weigh, `unknown` what we have no features for (the
      // cache is not filled), `unreadable` what the payload did not identify.
      return refuse('insufficient_signal', {
        titles: profile.titleCount,
        unknown: profile.unknownTitleCount,
        unreadable: signals.unreadableCount,
      });
    }

    const tmdbKey = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
    if (!tmdbKey) {
      console.warn(
        '[ai-recommend] No TMDB key configured. Set TMDB_API_KEY (server-side) to enable recommendations.',
      );
      return refuse('no_tmdb_key');
    }

    // ── Candidates ──
    //
    // `allSettled`, so one failing endpoint costs its half of the catalogue
    // rather than the whole section.
    const [moviePage, tvPage] = await Promise.allSettled([
      discover('movie', tmdbKey),
      discover('tv', tmdbKey),
    ]);

    const settledRows: Array<{ mediaType: MediaType; results: unknown[] }> = [];
    for (const [mediaType, outcome] of [
      ['movie', moviePage],
      ['tv', tvPage],
    ] as const) {
      if (outcome.status === 'fulfilled') {
        settledRows.push({ mediaType, results: outcome.value });
      } else {
        console.error(`[ai-recommend] TMDB discover failed for ${mediaType}:`, outcome.reason);
      }
    }

    if (settledRows.length === 0) {
      return refuse('tmdb_unavailable');
    }

    // The display fields, kept by pair. Keyed by `titleKey` and not by bare id,
    // for the reason the whole codebase keeps repeating: a film and a series can
    // carry the same number, and a lookup by id alone would caption one with the
    // other's poster.
    const rowsByKey = new Map<string, Record<string, unknown>>();
    for (const { mediaType, results } of settledRows) {
      for (const row of results) {
        if (!row || typeof row !== 'object') continue;
        const record = row as Record<string, unknown>;
        if (typeof record.id !== 'number') continue;
        rowsByKey.set(titleKey(mediaType, record.id), record);
      }
    }

    // ── The score ──
    //
    // `affinityScore` through `scoreCandidates`, which DROPS a candidate it could
    // not measure rather than ranking it last: "we could not read this" and "you
    // will not like this" are different statements, and §21 forbids returning an
    // unscored candidate as though it were a recommendation.
    const excluded = new Set(seenTitleKeys(signals.observations));
    const scored = settledRows
      .flatMap(({ mediaType, results }) =>
        scoreCandidates(results, profile, excluded, mediaType, CANDIDATE_LIMIT_PER_TYPE),
      )
      // Score first. The type and the id after it only make the order reproducible
      // when two candidates measure the same, so the same profile always produces
      // the same list.
      .sort((a, b) => b.score - a.score || a.mediaType.localeCompare(b.mediaType) || a.id - b.id)
      .slice(0, FILM_LIMIT);

    if (scored.length === 0) {
      // Everything discoverable was either already watched or could not be
      // compared. Both are real answers, and neither is a recommendation.
      return refuse('no_candidates', { titles: profile.titleCount, scored: 0 });
    }

    // The display title, named PER MEDIA TYPE and with no fallback to the other
    // key — a series calls it `name` and a film calls it `title`, and reading the
    // wrong one yields `undefined`, which is exactly the silent failure
    // `lib/titleFeatures.ts` exists to prevent.
    const films = scored.map((candidate) => {
      const row = rowsByKey.get(titleKey(candidate.mediaType, candidate.id));
      const rawTitle = candidate.mediaType === 'movie' ? row?.title : row?.name;
      const poster = row?.poster_path;
      return {
        id: candidate.id,
        media_type: candidate.mediaType,
        title: typeof rawTitle === 'string' && rawTitle.trim() !== '' ? rawTitle : null,
        poster_path: typeof poster === 'string' && poster !== '' ? poster : null,
        score: candidate.score,
      };
    });

    // ── The sentence, and only the sentence ──
    //
    // Absent, outdated or failing, the model changes nothing about which films
    // are returned or where they rank: `raison` is dropped and the section is
    // still a real recommendation. The reverse was true before — no key meant no
    // section — because the score depended on the model. It does not any more.
    const geminiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    const reasons = new Map<string, string>();

    if (geminiKey) {
      const names = await loadGenreNames(tmdbKey);
      if (names) {
        const profileGenres = profile.terms
          .filter((term) => term.termType === 'genre' && term.weight > 0)
          .sort((a, b) => b.weight - a.weight || a.termId.localeCompare(b.termId))
          .map((term) => names.get(Number(term.termId)))
          .filter((name): name is string => typeof name === 'string')
          .slice(0, PROMPT_GENRE_LIMIT);

        if (profileGenres.length > 0) {
          const catalogue = films
            .map((film) => {
              const row = rowsByKey.get(titleKey(film.media_type, film.id));
              const overview =
                typeof row?.overview === 'string' ? row.overview.slice(0, OVERVIEW_MAX) : '';
              return `- key: ${titleKey(film.media_type, film.id)} | ${film.title ?? 'sans titre'} | ${overview}`;
            })
            .join('\n');

          const prompt = `Genres du spectateur, du plus au moins présent : ${profileGenres.join(', ')}.
Titres retenus pour ce spectateur :
${catalogue}

Écris la phrase d'explication de chaque titre. Réponds uniquement en JSON : {"films":[{"key":"<la clé fournie>","raison":"<une phrase>"}]}, une entrée par titre, aucune en plus.`;

          try {
            const ai = new GoogleGenAI({ apiKey: geminiKey });
            const aiResponse = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: prompt,
              config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                responseMimeType: 'application/json',
                responseSchema: RESPONSE_SCHEMA,
              },
            });

            const parsed: unknown = JSON.parse(aiResponse.text || '{}');
            const returned = (parsed as { films?: unknown } | null)?.films;
            if (Array.isArray(returned)) {
              for (const entry of returned) {
                const key = (entry as { key?: unknown })?.key;
                const raison = (entry as { raison?: unknown })?.raison;
                // Only a key we asked about is accepted, and only by exact match:
                // a sentence written for a film that is not in the list has
                // nowhere to go, and inventing a home for it would caption a real
                // recommendation with another title's explanation.
                if (
                  typeof key === 'string' &&
                  typeof raison === 'string' &&
                  raison.trim() !== '' &&
                  rowsByKey.has(key) &&
                  !reasons.has(key)
                ) {
                  reasons.set(key, raison.trim());
                }
              }
            }
          } catch (error) {
            // A failed model call costs the sentences, not the section.
            console.error(
              '[ai-recommend] explanation step failed, returning the scores alone:',
              error,
            );
          }
        }
      }
    }

    return NextResponse.json({
      show: true,
      titreSection: SECTION_TITLE,
      films: films.map((film) => {
        const raison = reasons.get(titleKey(film.media_type, film.id));
        return raison ? { ...film, raison } : film;
      }),
    });
  } catch (error) {
    // The message stays in the server log; the client gets the same shape it uses
    // for "nothing to show", so a failure here cannot break the page it is
    // rendered on.
    console.error('[ai-recommend] failed:', error);
    return refuse('error');
  }
}
