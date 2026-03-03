import axios from 'axios';

// L'URL de votre API Consumet déployée sur Render
// Sera définie via la variable d'environnement NEXT_PUBLIC_CONSUMET_API_URL
// Fallback sur l'URL fournie par l'utilisateur si la variable n'est pas définie
const BASE_URL = process.env.NEXT_PUBLIC_CONSUMET_API_URL || "https://mon-api-stream.onrender.com";

interface StreamSource {
  url: string;
  quality?: string;
  isM3U8: boolean;
}

interface DirectStreamResult {
  url: string;
  referer?: string;
}

export const getDirectStreamUrl = async (
  tmdbId: string, 
  type: 'movie' | 'tv', 
  season?: number, 
  episode?: number
): Promise<DirectStreamResult | null> => {
  if (!BASE_URL) {
    console.warn("Direct Stream API: NEXT_PUBLIC_CONSUMET_API_URL n'est pas défini.");
    return null;
  }

  try {
    // 1. Recherche des infos du média via TMDB pour obtenir l'ID compatible Consumet
    // On utilise le provider 'tmdb' de Consumet qui est un méta-provider fiable
    const infoUrl = `${BASE_URL}/meta/tmdb/${tmdbId}`;
    
    const infoResponse = await axios.get(infoUrl, { timeout: 10000 }); // Timeout 10s comme demandé
    const data = infoResponse.data;

    let episodeId = '';

    if (type === 'movie') {
      // Pour un film, l'episodeId est souvent le même que l'ID du film dans la réponse
      episodeId = data.episodeId || data.id;
    } else if (type === 'tv' && season && episode) {
      // Pour une série, il faut trouver l'épisode spécifique
      const targetSeason = data.seasons?.find((s: any) => s.season === season);
      const targetEpisode = targetSeason?.episodes?.find((e: any) => e.episode === episode);
      
      if (targetEpisode) {
        episodeId = targetEpisode.id;
      }
    }

    if (!episodeId) {
      console.warn("Direct Stream API: Impossible de trouver l'ID de l'épisode/film.");
      return null;
    }

    // 2. Récupération des sources de streaming
    const watchUrl = `${BASE_URL}/meta/tmdb/watch/${episodeId}`;
    const watchResponse = await axios.get(watchUrl, { timeout: 10000 });
    const sources = watchResponse.data.sources;

    if (!sources || sources.length === 0) {
      return null;
    }

    // On cherche de préférence une source M3U8 (HLS) et la meilleure qualité "auto" ou la plus haute
    const m3u8Source = sources.find((s: StreamSource) => s.quality === 'auto') || sources[0];

    return {
      url: m3u8Source.url,
      referer: watchResponse.data.headers?.Referer
    };

  } catch (error) {
    console.error("Direct Stream API Error:", error);
    return null;
  }
};
