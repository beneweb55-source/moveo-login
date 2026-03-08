'use client';

import { useState, useCallback } from 'react';
import { GoogleGenAI, Type } from "@google/genai";

export const useAIRecommendation = () => {
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<any[]>([]);

  const getRecommendations = useCallback(async (history: any[]) => {
    console.log('useAIRecommendation hook called with history:', history);
    if (history.length < 3) {
      console.log('useAIRecommendation: history too short, returning show: false');
      return { show: false };
    }

    setLoading(true);
    try {
      // 1. Get candidates from backend
      const response = await fetch('/api/ai-recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history }),
      });
      const { candidates, count, error } = await response.json();
      if (error) throw new Error(error);

      // 2. Call AI on client-side
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY! });
      
      const systemInstruction = `Tu es le moteur de recommandation de Moveo. Retourne UNIQUEMENT un JSON valide, sans markdown.
Règles de scoring :
3 à 5 films dans l'historique : scores max 85%
6 à 15 films : max 92%
15+ films : max 97%
Ne mets jamais dans les résultats un film déjà dans l'historique.`;

      const userPrompt = `Historique : ${JSON.stringify(history)}
Candidats TMDB : ${JSON.stringify(candidates)}
Nombre de films vus : ${count}
Retourne ce format :
{ "titreSection": "Moveo te recommande", "films": [{ "id": number, "score": number, "raison": string }] }`;

      const aiResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: userPrompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
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
                  required: ["id", "score", "raison"],
                },
              },
            },
            required: ["titreSection", "films"],
          },
        },
      });

      const result = JSON.parse(aiResponse.text || "{}");
      
      // 3. Sort and return top 10
      const sorted = (result.films || [])
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 10);

      setRecommendations(sorted);
      return { show: true, titreSection: result.titreSection, films: sorted };
    } catch (error) {
      console.error('AI Recommendation error:', error);
      return { show: false };
    } finally {
      setLoading(false);
    }
  }, []);

  return { getRecommendations, loading, recommendations };
};
