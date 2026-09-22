import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from "@google/genai";
import { clientKeyFrom, createRateLimiter } from '@/lib/rateLimit';

/**
 * NOTE ON THIS ROUTE, WHICH HAS NO CALLER
 *
 * A repository-wide search finds no reference to it. `/api/ai-search` performs
 * the same AI translation step — and then does the TMDB lookup as well — for a
 * caller that exists (`components/Header.tsx`), so this looks like the earlier
 * half of that design left behind.
 *
 * It was POST-able by anyone, spending a paid Gemini call per request with no
 * limiter of any kind. The limiter below is the same one `/api/ai-search` uses,
 * applied for the same reason: `lib/rateLimit.ts` records what it does and does
 * not defend against — it is friction, not an access control.
 *
 * Removing the route outright is the better end state and is recommended in the
 * audit report; it is left in place here rather than deleted, because deleting a
 * capability the owner may still intend to wire up is their decision, whereas
 * leaving it spendable by anonymous callers is not.
 */
const RATE_LIMIT = createRateLimiter({ windowMs: 60_000, maxRequests: 60 });

export async function POST(req: NextRequest) {
  try {
    // Evaluated before the key is read: a request that is about to be refused
    // should cost nothing at all.
    if (RATE_LIMIT.isRateLimited(clientKeyFrom(req))) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { query } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'API Key missing' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Define the schema for the expected output
    const schema = {
      type: Type.OBJECT,
      properties: {
        media_type: { type: Type.STRING, enum: ["movie", "tv", "multi"], description: "The type of media to search for." },
        genres: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of genre names relevant to the query." },
        keywords: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of specific keywords or themes." },
        year_min: { type: Type.NUMBER, description: "Minimum release year if specified." },
        year_max: { type: Type.NUMBER, description: "Maximum release year if specified." },
        mood: { type: Type.STRING, description: "The emotional tone of the request." },
        sort_by: { type: Type.STRING, enum: ["popularity.desc", "vote_average.desc", "release_date.desc"], description: "How to sort the results." }
      },
      required: ["media_type", "genres", "keywords"]
    };

    const prompt = `
      You are a movie and TV show search assistant. 
      Analyze the following user query and extract the search parameters.
      Query: "${query}"
      
      Map the user's intent to standard movie genres (e.g., Action, Comedy, Drama, Horror, Sci-Fi, etc.).
      Extract key themes as keywords.
      Determine if they are looking for a movie, a tv show, or both (multi).
    `;

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      }
    });

    const parsedResponse = JSON.parse(result.text || "{}");

    return NextResponse.json(parsedResponse);

  } catch (error: any) {
    console.error("Semantic Search Error:", error);
    // Generic on the wire. This route has no authentication and the SDK's error
    // text can carry request and account detail.
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
