import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { fetchDataFromApi } from '@/utils/api';
import { clientKeyFrom, createRateLimiter } from '@/lib/rateLimit';

/**
 * Candidate selection AND scoring for the recommendations section.
 *
 * WHY THE SCORING MOVED HERE
 *
 * It used to run in `hooks/useAIRecommendation.ts`, which is a `'use client'`
 * module: it built `new GoogleGenAI({apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY})`
 * in the visitor's browser and called Gemini from there. A `NEXT_PUBLIC_`
 * variable is inlined into the client bundle by Next.js, so wiring that hook up
 * would have published the Gemini key to every visitor — and a key in a bundle
 * is a key that gets scraped and spent.
 *
 * That hook has no importer today, so webpack drops it and nothing is published
 * right now: measured against production on 2026-09-22, no chunk served by
 * www.moveo.blog contains a Google key prefix or even the variable's name. The
 * trap was armed rather than fired. This endpoint is what disarms it — the
 * feature keeps its design, the key stays on the server, and the hook becomes a
 * client of this route instead of a place where a credential is embedded.
 *
 * It also gives this endpoint a reason to exist: it fetched candidates and
 * nothing consumed them.
 *
 * WHAT THIS ROUTE DELIBERATELY DOES NOT DO
 *
 * It does not log the history. The previous version logged it twice, which puts
 * a viewer's viewing history into the server log — personal data written for no
 * operational reason (§7). Nothing about scoring needs it in the log.
 *
 * It also does not pretend to have scored anything. With no Gemini key
 * configured it answers `{show: false}`, which is the same answer the UI already
 * uses for "nothing to show", rather than returning unscored candidates as if
 * they were recommendations (§21).
 *
 * AND THE RATE LIMIT IS NOT AN ACCESS CONTROL
 *
 * This route is public and spends a paid API per call. 20 requests a minute is
 * far above human cadence for a section that loads at most once per profile
 * visit; lib/rateLimit.ts records what this does and does not defend against.
 */
const RATE_LIMIT = createRateLimiter({ windowMs: 60_000, maxRequests: 20 });

const SYSTEM_INSTRUCTION = `Tu es le moteur de recommandation de Moveo. Retourne UNIQUEMENT un JSON valide, sans markdown.
Règles de scoring :
3 à 5 films dans l'historique : scores max 85%
6 à 15 films : max 92%
15+ films : max 97%
Ne mets jamais dans les résultats un film déjà dans l'historique.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    titreSection: { type: Type.STRING },
    films: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.INTEGER },
          score: { type: Type.NUMBER },
          raison: { type: Type.STRING },
        },
        required: ['id', 'score', 'raison'],
      },
    },
  },
  required: ['titreSection', 'films'],
};

export async function POST(req: Request) {
  try {
    if (RATE_LIMIT.isRateLimited(clientKeyFrom(req))) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { history } = await req.json();

    if (!Array.isArray(history) || history.length < 3) {
      // Fewer than three titles is not enough signal to recommend from, and the
      // client already renders nothing for this answer.
      return NextResponse.json({ show: false });
    }

    // 1. Extract frequent genre IDs
    const genreCounts: Record<number, number> = {};
    history.forEach((item: any) => {
      item?.genre_ids?.forEach((id: number) => {
        genreCounts[id] = (genreCounts[id] || 0) + 1;
      });
    });

    const sortedGenres = Object.entries(genreCounts)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 3)
      .map(([id]) => id);

    if (sortedGenres.length === 0) {
      // No genre information at all: there is nothing to discover from, and
      // asking Gemini would spend a call to be told so.
      return NextResponse.json({ show: false });
    }

    // 2. Fetch candidates from TMDB
    const candidates = await fetchDataFromApi('/discover/movie', {
      with_genres: sortedGenres.join(','),
      sort_by: 'popularity.desc',
      language: 'fr-FR',
    });

    const historyIds = new Set(history.map((item: any) => item?.id));
    const filteredCandidates = (candidates?.results || [])
      .filter((item: any) => !historyIds.has(item.id))
      .slice(0, 20);

    if (filteredCandidates.length === 0) {
      return NextResponse.json({ show: false });
    }

    // 3. Score them. `GEMINI_API_KEY` first: it is the server-side name, and the
    // `NEXT_PUBLIC_` one is read only so that a deployment which already set that
    // variable keeps working. Both are read on the server, so neither reaches a
    // browser from here.
    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      console.warn(
        '[ai-recommend] No Gemini key configured, so recommendations are disabled. ' +
          'Set GEMINI_API_KEY (server-side) to enable them.',
      );
      return NextResponse.json({ show: false });
    }

    const userPrompt = `Historique : ${JSON.stringify(history)}
Candidats TMDB : ${JSON.stringify(filteredCandidates)}
Nombre de films vus : ${history.length}

Retourne ce format :
{ "titreSection": "Moveo te recommande", "films": [{ "id": number, "score": number, "raison": string }] }`;

    const ai = new GoogleGenAI({ apiKey });
    const aiResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: userPrompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const parsed = JSON.parse(aiResponse.text || '{}');
    const films = (parsed.films || [])
      .filter((film: any) => typeof film?.id === 'number')
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 10);

    if (films.length === 0) {
      return NextResponse.json({ show: false });
    }

    return NextResponse.json({
      show: true,
      titreSection: parsed.titreSection || 'Moveo te recommande',
      films,
    });
  } catch (error) {
    // The message stays in the server log; the client gets the same shape it
    // uses for "nothing to show", so a failure here cannot break the page it is
    // rendered on.
    console.error('[ai-recommend] failed:', error);
    return NextResponse.json({ show: false });
  }
}
