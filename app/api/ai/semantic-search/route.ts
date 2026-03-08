import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from "@google/genai";

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
