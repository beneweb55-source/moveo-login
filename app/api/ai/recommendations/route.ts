import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import pool from '@/lib/db';
import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const user = session.user;

    // Récupérer l'historique de visionnage et les favoris de l'utilisateur
    const result = await pool.query(
      'SELECT media_type, media_id, list_type, title FROM user_list WHERE user_id = $1 AND list_type IN ($2, $3)',
      [user.userId, 'watched', 'favorites']
    );

    const userList = result.rows;

    if (userList.length === 0) {
      return NextResponse.json({ recommendations: [] });
    }

    const watched = userList.filter(item => item.list_type === 'watched').map(item => item.title);
    const favorites = userList.filter(item => item.list_type === 'favorites').map(item => item.title);

    const prompt = `
      En tant qu'expert en cinéma et séries, analyse le profil de cet utilisateur.
      Films/Séries vus : ${watched.join(', ') || 'Aucun'}
      Films/Séries favoris : ${favorites.join(', ') || 'Aucun'}

      Génère une liste de 10 recommandations de films ou séries similaires qui pourraient plaire à cet utilisateur.
      Pour chaque recommandation, fournis :
      - Le titre exact (en français si possible, sinon en anglais)
      - Le type de média ('movie' ou 'tv')
      - Un pourcentage de correspondance (entre 70% et 99%) indiquant à quel point l'utilisateur risque d'aimer ce contenu.
      - Une courte justification (1 phrase) expliquant pourquoi ce choix correspond à ses goûts.

      IMPORTANT : Ne recommande PAS de films ou séries que l'utilisateur a déjà vus ou qui sont dans ses favoris.
      Ne recommande PAS de contenus qui s'éloignent trop de ses goûts (évite les genres qu'il n'a pas l'air d'apprécier).
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: {
                type: Type.STRING,
                description: 'Le titre du film ou de la série',
              },
              media_type: {
                type: Type.STRING,
                description: "Le type ('movie' ou 'tv')",
              },
              match_percentage: {
                type: Type.NUMBER,
                description: 'Le pourcentage de correspondance (ex: 95)',
              },
              reason: {
                type: Type.STRING,
                description: 'La raison de la recommandation',
              },
            },
            required: ['title', 'media_type', 'match_percentage', 'reason'],
          },
        },
      },
    });

    const recommendationsText = response.text;
    if (!recommendationsText) {
      throw new Error('Pas de réponse de Gemini');
    }

    const recommendations = JSON.parse(recommendationsText);

    // Pour chaque recommandation, on va chercher les infos sur TMDB
    const enrichedRecommendations = await Promise.all(
      recommendations.map(async (rec: any) => {
        try {
          const searchRes = await fetch(
            `https://api.themoviedb.org/3/search/${rec.media_type}?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&query=${encodeURIComponent(rec.title)}&language=fr-FR`
          );
          const searchData = await searchRes.json();
          
          if (searchData.results && searchData.results.length > 0) {
            const item = searchData.results[0];
            return {
              ...rec,
              id: item.id,
              poster_path: item.poster_path,
              overview: item.overview,
              release_date: item.release_date || item.first_air_date,
            };
          }
          return null;
        } catch (e) {
          console.error('Erreur TMDB pour', rec.title, e);
          return null;
        }
      })
    );

    const finalRecommendations = enrichedRecommendations.filter(item => item !== null && item.poster_path);

    return NextResponse.json({ recommendations: finalRecommendations });
  } catch (error) {
    console.error('Erreur AI Recommendations:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
