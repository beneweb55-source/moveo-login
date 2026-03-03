import axios from 'axios';

// L'URL de votre API Consumet déployée sur Render
// Sera définie via la variable d'environnement NEXT_PUBLIC_CONSUMET_API_URL
// Fallback sur l'URL fournie par l'utilisateur si la variable n'est pas définie
const BASE_URL = process.env.NEXT_PUBLIC_CONSUMET_API_URL || "https://mon-api-stream.onrender.com";
const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

interface StreamSource {
  url: string;
  quality?: string;
  isM3U8: boolean;
}

interface DirectStreamResult {
  url: string;
  referer?: string;
  subtitles?: { url: string; lang: string }[];
}

// Fonction utilitaire pour nettoyer les titres pour la recherche (enlève les caractères spéciaux)
const cleanTitle = (title: string) => {
  return title.replace(/[:&]/g, '').replace(/\s+/g, ' ').trim();
};

export const getDirectStreamUrl = async (
  tmdbId: string, 
  type: 'movie' | 'tv', 
  season?: number, 
  episode?: number,
  title?: string,
  year?: string
): Promise<DirectStreamResult | null> => {
  if (!BASE_URL) {
    console.warn("Direct Stream API: NEXT_PUBLIC_CONSUMET_API_URL n'est pas défini.");
    return null;
  }

  // Normalisation des paramètres
  const targetTitle = title ? cleanTitle(title) : '';
  const targetYear = year ? parseInt(year) : 0;

  console.log(`[DirectStream] Démarrage pour ${type} ID:${tmdbId} "${targetTitle}" (${targetYear})`);

  // --- STRATÉGIE 1 : Via meta/tmdb (Consumet TMDB Provider) ---
  const strategy1 = async (): Promise<DirectStreamResult | null> => {
    try {
      // console.log(`[DirectStream] Stratégie 1 (TMDB): Recherche...`);
      const infoUrl = `${BASE_URL}/meta/tmdb/${tmdbId}`;
      const infoResponse = await axios.get(infoUrl, { timeout: 6000 });
      const data = infoResponse.data;

      let episodeId = '';
      
      if (type === 'movie') {
        episodeId = data.episodeId;
      } else if (type === 'tv' && season && episode) {
        const targetSeason = data.seasons?.find((s: any) => s.season === season);
        const targetEpisode = targetSeason?.episodes?.find((e: any) => e.episode === episode);
        if (targetEpisode) episodeId = targetEpisode.id;
      }

      if (episodeId) {
        const watchUrl = `${BASE_URL}/meta/tmdb/watch/${episodeId}`;
        const watchResponse = await axios.get(watchUrl, { timeout: 8000 });
        const sources = watchResponse.data.sources;

        if (sources && sources.length > 0) {
          const m3u8Source = sources.find((s: StreamSource) => s.quality === 'auto') || sources[0];
          console.log(`[DirectStream] Stratégie 1: Succès !`);
          return {
            url: m3u8Source.url,
            referer: watchResponse.data.headers?.Referer,
            subtitles: watchResponse.data.subtitles
          };
        }
      }
    } catch (error) {
      // console.warn("[DirectStream] Stratégie 1 échouée ou timeout.");
    }
    return null;
  };

  // --- STRATÉGIE 2 : Fallback via Recherche FlixHQ ---
  const strategy2 = async (): Promise<DirectStreamResult | null> => {
    if (!targetTitle) return null;

    try {
      // console.log(`[DirectStream] Stratégie 2 (FlixHQ): Recherche pour "${targetTitle}"...`);
      const searchUrl = `${BASE_URL}/movies/flixhq/${encodeURIComponent(targetTitle)}`;
      const searchRes = await axios.get(searchUrl, { timeout: 6000 });
      const searchResults = searchRes.data.results;

      if (!searchResults || searchResults.length === 0) {
        console.warn("[DirectStream] Stratégie 2: Aucun résultat de recherche.");
        return null;
      }

      // Filtrage intelligent avec tolérance d'année (+/- 1 an)
      const match = searchResults.find((r: any) => {
        const rYearStr = r.releaseDate?.split('-')[0] || r.releaseDate;
        const rYear = rYearStr ? parseInt(rYearStr) : 0;
        
        const yearMatch = targetYear > 0 && rYear > 0 
          ? Math.abs(rYear - targetYear) <= 1 
          : true; // Si pas d'année, on ignore ce critère (risqué mais permissif)

        const typeMatch = r.type === (type === 'movie' ? 'Movie' : 'TV Series');
        const titleMatch = r.title.toLowerCase().includes(targetTitle.toLowerCase());

        return typeMatch && yearMatch && titleMatch;
      });

      if (!match) {
        console.warn("[DirectStream] Stratégie 2: Pas de correspondance trouvée après filtrage.");
        return null;
      }

      // console.log(`[DirectStream] Stratégie 2: Correspondance trouvée -> ${match.title} (${match.id})`);

      const infoUrl = `${BASE_URL}/movies/flixhq/info?id=${match.id}`;
      const infoRes = await axios.get(infoUrl, { timeout: 6000 });
      const mediaInfo = infoRes.data;

      let episodeId = '';
      if (type === 'movie') {
        episodeId = mediaInfo.episodes?.[0]?.id;
      } else {
        const targetEp = mediaInfo.episodes?.find((e: any) => e.season === season && e.number === episode);
        if (targetEp) episodeId = targetEp.id;
      }

      if (!episodeId) return null;

      const watchUrl = `${BASE_URL}/movies/flixhq/watch?episodeId=${episodeId}&mediaId=${match.id}`;
      const watchRes = await axios.get(watchUrl, { timeout: 8000 });
      const sources = watchRes.data.sources;

      if (sources && sources.length > 0) {
        const m3u8Source = sources.find((s: StreamSource) => s.quality === 'auto') || sources[0];
        console.log(`[DirectStream] Stratégie 2: Succès !`);
        return {
          url: m3u8Source.url,
          referer: watchRes.data.headers?.Referer,
          subtitles: watchRes.data.subtitles
        };
      }
    } catch (error) {
      // console.warn("[DirectStream] Stratégie 2 échouée.");
    }
    return null;
  };

  // Exécution parallèle : On lance les deux, mais on priorise le résultat de la Stratégie 1 s'il arrive vite.
  // Cependant, pour simplifier et être le plus rapide possible, on prend le premier qui réussit.
  // Promise.any serait idéal mais on veut essayer S1, et si S1 fail, S2.
  // Mais ici on veut la vitesse. Si S2 trouve avant S1, pourquoi pas ?
  // Sauf que S1 est souvent de meilleure qualité (TMDB mapping).
  
  // On lance les deux en parallèle
  const [res1, res2] = await Promise.allSettled([strategy1(), strategy2()]);

  // On privilégie le résultat 1 s'il existe
  if (res1.status === 'fulfilled' && res1.value) return res1.value;
  if (res2.status === 'fulfilled' && res2.value) return res2.value;

  return null;
};
