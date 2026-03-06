import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

export async function POST(req: Request) {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });
    
    const { items } = await req.json();

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ sortedIds: [] });
    }

    // We only send id, title, popularity, vote_average, release_date to save tokens
    const itemsToRank = items.map((item: any) => ({
      id: item.id,
      title: item.title || item.name,
      popularity: item.popularity,
      vote_average: item.vote_average,
      release_date: item.release_date || item.first_air_date,
    }));

    const prompt = `
      Tu es un expert en cinéma. Voici une liste de films/séries avec leurs statistiques.
      Trie cette liste pour créer un catalogue extrêmement attractif pour un utilisateur.
      Critères de tri (par ordre d'importance) :
      1. Qualité et attractivité (évite les mauvais films/séries, privilégie ceux qui donnent envie).
      2. Popularité réelle.
      3. Récence (du plus récent au moins récent).
      
      Renvoie UNIQUEMENT un tableau JSON contenant les IDs triés dans le nouvel ordre.
      
      Liste :
      ${JSON.stringify(itemsToRank)}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.NUMBER,
          },
        },
      },
    });

    const sortedIdsText = response.text;
    if (!sortedIdsText) {
      throw new Error('Pas de réponse de Gemini');
    }

    const sortedIds = JSON.parse(sortedIdsText);

    return NextResponse.json({ sortedIds });
  } catch (error) {
    console.error('Erreur AI Ranking:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
