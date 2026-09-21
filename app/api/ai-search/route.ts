import { NextResponse } from "next/server";
import axios from "axios";
import { GoogleGenAI, Type } from "@google/genai";
import { filterContent } from "@/utils/contentFilter";
import { clientKeyFrom, createRateLimiter } from "@/lib/rateLimit";

const BASE_URL = "https://api.themoviedb.org/3";

/**
 * This route is public and it spends a paid third-party API on every call: an
 * unauthenticated `GET ?q=…` reaches Google's Gemini. Measured against
 * production on 2026-09-21 — `?q=un film triste` returned
 * `ai_reasoning: "Heartbreaking Cinema"` after 2.2 s, from an anonymous curl, on
 * a route that had no limiter at all.
 *
 * The allowance is deliberately far above human cadence: components/Header.tsx
 * debounces the live search by 300 ms, so one person produces a couple of calls
 * per search, not dozens per minute. lib/rateLimit.ts records what this does and
 * does not defend against — it is friction, not an access control.
 */
const RATE_LIMIT = createRateLimiter({ windowMs: 60_000, maxRequests: 60 });

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const language = searchParams.get("language") || "en-US";

  if (!q) {
    return NextResponse.json({ results: [] });
  }

  // The cheapest gate, and the only one that bounds what an anonymous caller can
  // spend here, so it is evaluated before the API keys are even read: a request
  // that is about to be refused should cost nothing at all.
  if (RATE_LIMIT.isRateLimited(clientKeyFrom(request))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
  const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (!TMDB_API_KEY || !GEMINI_API_KEY) {
    return NextResponse.json({ error: "API keys missing" }, { status: 500 });
  }

  try {
    // 1. AI Translation Layer
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const schema = {
      type: Type.OBJECT,
      properties: {
        reasoningBadge: { type: Type.STRING, description: "A short, catchy phrase describing the vibe (e.g., 'Space Melancholy')." },
        tmdbGenres: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Array of relevant TMDB genre IDs." },
        exactMovieTitles: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Array of 5-8 exact movie titles matching the request." }
      },
      required: ["reasoningBadge", "tmdbGenres", "exactMovieTitles"]
    };

    const prompt = `
      User Request: "${q}"
      Task: Act as a movie expert and translator.
      1. Analyze the intent/vibe of the request.
      2. Select 5-8 EXACT movie or TV show titles that best match this specific request.
      3. Identify relevant TMDB genre IDs.
      4. Create a short "reasoningBadge" label.

      TMDB Genre IDs:
      Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99, Drama: 18, Family: 10751, Fantasy: 14, History: 36, Horror: 27, Music: 10402, Mystery: 9648, Romance: 10749, Sci-Fi: 878, Thriller: 53, War: 10752, Western: 37.
    `;

    const result = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      }
    });

    const aiData = JSON.parse(result.text || "{}");
    const titles = aiData.exactMovieTitles || [];
    const reasoning = aiData.reasoningBadge || "AI Recommendation";

    // 2. TMDB Fetching Layer
    if (titles.length > 0) {
      const searchPromises = titles.map(async (title: string) => {
        try {
          const searchRes = await axios.get(`${BASE_URL}/search/multi`, {
            headers: { Authorization: `Bearer ${TMDB_API_KEY}` },
            params: {
              query: title,
              include_adult: false,
              language: language
            }
          });
          // Return the first result that matches reasonably well
          return searchRes.data.results?.[0] || null;
        } catch (e) {
          return null;
        }
      });

      let results = filterContent((await Promise.all(searchPromises)).filter(item => item !== null));

      // Deduplicate
      const uniqueResults = Array.from(new Map(results.map(item => [item.id, item])).values());

      return NextResponse.json({
        results: uniqueResults,
        ai_reasoning: reasoning
      });
    } else {
      // Fallback if AI returns no titles (unlikely)
      return NextResponse.json({ results: [], ai_reasoning: "No matches found" });
    }

  } catch (error) {
    console.error("AI Search Error:", error);
    return NextResponse.json({ error: "AI Search Failed" }, { status: 500 });
  }
}
