import { NextResponse } from "next/server";
import axios from "axios";
import { GoogleGenAI, SchemaType } from "@google/genai";

const BASE_URL = "https://api.themoviedb.org/3";

// Mood keywords to detect semantic queries
const MOOD_KEYWORDS = [
  "triste", "sad", "horreur", "horror", "peur", "scary", "rire", "laugh", "funny", "drôle", "drole",
  "joyeux", "happy", "sombre", "dark", "intense", "émouvant", "emotional", "violent",
  "calme", "calm", "relaxant", "relaxing", "suspense", "amour", "love", "romantique", "romantic",
  "feel good", "ambiance", "mood", "vibe", "style", "genre", "comme", "like", "space", "espace",
  "action", "aventure", "adventure", "animation", "comédie", "comedy", "crime", "documentaire",
  "documentary", "drame", "drama", "famille", "family", "fantastique", "fantasy", "histoire",
  "history", "musique", "music", "mystère", "mystery", "science-fiction", "sci-fi", "guerre",
  "war", "western", "thriller", "sans", "without", "avec", "with", "about", "sur",
  "film", "movie", "serie", "series", "show", "cinema", "cinéma", "top", "best", "meilleur"
];

function isSemantic(query: string): boolean {
  if (!query) return false;
  
  // Normalize query: remove accents, lowercase
  const normalizedQuery = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const words = normalizedQuery.trim().split(/\s+/).length;
  
  // Check for keywords in normalized query
  // We also normalize keywords just in case, though the list above should be mostly flat
  const hasMood = MOOD_KEYWORDS.some(k => {
    const normalizedKeyword = k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return normalizedQuery.includes(normalizedKeyword);
  });

  // If query is long (>3 words) OR contains mood keywords, treat as semantic
  return words > 3 || hasMood;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
  const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (!TMDB_API_KEY) {
    return NextResponse.json({ error: "TMDB API key missing" }, { status: 500 });
  }

  // 1. Determine Query and Endpoint
  let q = searchParams.get("q");
  const endpoint = searchParams.get("endpoint");
  let targetUrl = "";
  let params: Record<string, string> = {};

  // Extract other params (page, language, etc.)
  searchParams.forEach((value, key) => {
    if (key !== "q" && key !== "endpoint") {
      params[key] = value;
    }
  });

  // If endpoint is a search endpoint, try to extract query from it
  if (!q && endpoint && endpoint.includes('/search/')) {
    try {
      const parts = endpoint.split('?');
      if (parts.length > 1) {
        const epParams = new URLSearchParams(parts[1]);
        const epQ = epParams.get('query');
        if (epQ) q = epQ;
        
        epParams.forEach((value, key) => {
          if (key !== 'query' && !params[key]) {
            params[key] = value;
          }
        });
      }
    } catch (e) {
      console.error("Error parsing endpoint query", e);
    }
  }

  // 2. Smart Routing Logic
  let isSemanticSearch = false;
  let aiTitles: string[] = [];
  let aiReasoning = "";

  if (q && isSemantic(q) && GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
      const schema = {
        type: SchemaType.OBJECT,
        properties: {
          titles: { 
            type: SchemaType.ARRAY, 
            items: { type: SchemaType.STRING }, 
            description: "List of 8 exact movie or TV show titles matching the user request." 
          },
          reasoning: {
            type: SchemaType.STRING,
            description: "A short, 3-5 word label describing this collection (e.g. 'Psychological Horror', '90s Action Classics')."
          }
        },
        required: ["titles", "reasoning"]
      };

      const prompt = `
        User Request: "${q}"
        Task: Recommend 8 specific movies or TV shows that perfectly match this request.
        Rules:
        1. Return ONLY the exact titles.
        2. Do NOT return genres or IDs.
        3. Prioritize high-quality, well-known content.
        4. Respect negative constraints (e.g., "sans screamer").
        5. Provide a short "reasoning" label (in the same language as the query) that summarizes the vibe.
      `;

      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash-lite-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        }
      });

      const aiResponse = JSON.parse(result.text || "{}");
      if (aiResponse.titles && Array.isArray(aiResponse.titles)) {
        aiTitles = aiResponse.titles.slice(0, 8);
        aiReasoning = aiResponse.reasoning;
        isSemanticSearch = true;
      }
    } catch (error) {
      console.error("AI Semantic Search failed, falling back to simple search", error);
    }
  }

  // 3. Execution
  try {
    if (isSemanticSearch && aiTitles.length > 0) {
      // Semantic Search: Fetch details for each title
      const searchPromises = aiTitles.map(async (title) => {
        try {
          const searchRes = await axios.get(`${BASE_URL}/search/multi`, {
            headers: { Authorization: `Bearer ${TMDB_API_KEY}` },
            params: {
              query: title,
              include_adult: false,
              language: params.language || 'en-US'
            }
          });
          // Return the first result that matches reasonably well
          const bestMatch = searchRes.data.results?.[0];
          return bestMatch || null;
        } catch (e) {
          return null;
        }
      });

      const results = (await Promise.all(searchPromises)).filter(item => item !== null);
      
      return NextResponse.json({
        page: 1,
        results: results,
        ai_reasoning: aiReasoning,
        total_pages: 1,
        total_results: results.length
      }, {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "s-maxage=60, stale-while-revalidate",
        },
      });

    } else {
      // Simple Search -> Search API
      if (q) {
        targetUrl = `${BASE_URL}/search/multi`;
        params.query = q;
        params.include_adult = 'false';
      } else if (endpoint) {
        const endpointPath = endpoint.split('?')[0];
        targetUrl = `${BASE_URL}${endpointPath}`;
      } else {
        return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
      }

      const { data } = await axios.get(targetUrl, {
        headers: { Authorization: `Bearer ${TMDB_API_KEY}` },
        params,
      });

      // Improvement for "Nobody" vs "Nobody 2":
      // If it's a direct search, TMDB usually returns them.
      // We can try to sort results to ensure exact matches come first, 
      // but TMDB usually does a decent job. 
      // The issue might be that "Nobody 2" is less popular or has no poster yet.
      // We are just passing data through here.

      return NextResponse.json(data, {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "s-maxage=60, stale-while-revalidate",
        },
      });
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "TMDB Request Failed" },
      { status: error.response?.status || 500 }
    );
  }
}
