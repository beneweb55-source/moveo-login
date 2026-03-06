import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

export async function POST(req: Request) {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });
    
    const { lists } = await req.json();

    if (!lists || Object.keys(lists).length === 0) {
      return NextResponse.json({ sortedLists: {} });
    }

    // Prepare data for Gemini
    const listsData: Record<string, any[]> = {};
    for (const [key, items] of Object.entries(lists)) {
      listsData[key] = (items as any[]).map((m: any) => ({
        id: m.id,
        title: m.title || m.name,
        release_date: m.release_date || m.first_air_date,
        popularity: m.popularity,
        vote_average: m.vote_average,
        vote_count: m.vote_count,
      }));
    }

    const prompt = `
      Voici plusieurs listes de films/séries.
      Ton objectif est de re-classer chaque liste de manière "juste et attractive" selon leur RÉELLE popularité (qualité, impact culturel) et du plus récent au moins récent.
      
      Listes (JSON) :
      ${JSON.stringify(listsData)}

      Renvoie un objet JSON où chaque clé correspond à la clé de la liste d'origine, et la valeur est un tableau des IDs triés.
      Le premier élément de chaque tableau doit être le plus pertinent/récent/populaire.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: Object.keys(lists).reduce((acc: any, key) => {
            acc[key] = {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
            };
            return acc;
          }, {}),
        },
      },
    });

    const sortedIdsText = response.text;
    if (!sortedIdsText) {
      throw new Error('Pas de réponse de Gemini');
    }

    const sortedLists = JSON.parse(sortedIdsText);

    return NextResponse.json({ sortedLists });
  } catch (error) {
    console.error('Erreur AI Sort:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
