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
  return title.normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Enlève les accents
              .replace(/[^a-zA-Z0-9\s]/g, ' ') // Remplace tout symbole par espace
              .replace(/\s+/g, ' ') // Réduit les espaces multiples
              .trim();
};

export const getDirectStreamUrl = async (
  tmdbId: string, 
  type: 'movie' | 'tv', 
  season?: number, 
  episode?: number,
  title?: string,
  originalTitle?: string,
  year?: string
): Promise<DirectStreamResult | null> => {
  if (!BASE_URL) {
    console.warn("Direct Stream API: NEXT_PUBLIC_CONSUMET_API_URL n'est pas défini.");
    return null;
  }

  // Normalisation des paramètres
  const targetTitle = title ? cleanTitle(title) : '';
  const targetOriginalTitle = originalTitle ? cleanTitle(originalTitle) : '';
  const targetYear = year ? parseInt(year) : 0;

  console.log(`[DirectStream] Démarrage pour ${type} ID:${tmdbId} "${targetTitle}" (Original: "${targetOriginalTitle}") (${targetYear})`);

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

  // --- STRATÉGIE GÉNÉRIQUE POUR LES PROVIDERS (FlixHQ, Goku, SFlix, HiMovies) ---
  const runProviderStrategy = async (provider: string): Promise<DirectStreamResult | null> => {
    // On construit une liste de titres à essayer (Titre local + Titre original)
    const titlesToTry = [targetTitle];
    if (targetOriginalTitle && targetOriginalTitle !== targetTitle) {
      titlesToTry.push(targetOriginalTitle);
    }
    const uniqueTitles = [...new Set(titlesToTry)].filter(t => t.length > 0);

    if (uniqueTitles.length === 0) return null;

    const searchAndFind = async (searchQuery: string) => {
      try {
        const searchUrl = `${BASE_URL}/movies/${provider}/${encodeURIComponent(searchQuery)}`;
        const searchRes = await axios.get(searchUrl, { timeout: 6000 });
        const searchResults = searchRes.data.results;

        if (!searchResults || searchResults.length === 0) return null;

        // Filtrage intelligent
        const match = searchResults.find((r: any) => {
          const rYearStr = r.releaseDate?.split('-')[0] || r.releaseDate;
          const rYear = rYearStr ? parseInt(rYearStr) : 0;
          
          const yearMatch = targetYear > 0 && rYear > 0 
            ? Math.abs(rYear - targetYear) <= 1 
            : true;

          const rType = r.type || '';
          const isMovie = type === 'movie';
          const typeMatch = isMovie 
            ? (rType === 'Movie' || rType === 'Film') 
            : (rType === 'TV Series' || rType === 'TV' || rType === 'Show');

          const rTitleClean = cleanTitle(r.title).toLowerCase();
          const tTitleClean = searchQuery.toLowerCase();
          const titleMatch = rTitleClean.includes(tTitleClean) || tTitleClean.includes(rTitleClean);

          return typeMatch && yearMatch && titleMatch;
        });

        return match || null;
      } catch (e) {
        return null;
      }
    };

    let bestMatch = null;
    
    // On réordonne pour mettre l'original en premier si dispo
    const prioritizedTitles = uniqueTitles.sort((a, b) => {
        if (a === targetOriginalTitle) return -1;
        return 1;
    });

    for (const t of prioritizedTitles) {
        bestMatch = await searchAndFind(t);
        if (bestMatch) break;
    }

    if (!bestMatch) return null;

    console.log(`[DirectStream] ${provider}: Correspondance trouvée -> ${bestMatch.title} (${bestMatch.id})`);

    try {
      const infoUrl = `${BASE_URL}/movies/${provider}/info?id=${bestMatch.id}`;
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

      // Fonction helper pour tenter de lire le flux avec retry sur les serveurs
      const tryWatch = async (server?: string) => {
        try {
            const url = `${BASE_URL}/movies/${provider}/watch?episodeId=${episodeId}&mediaId=${bestMatch.id}${server ? `&server=${server}` : ''}`;
            const res = await axios.get(url, { timeout: 8000 });
            return res.data;
        } catch (e) {
            return null;
        }
      };

      // 1. Essai par défaut
      let watchData = await tryWatch();
      
      // 2. Si échec, essai avec UpCloud
      if (!watchData || !watchData.sources || watchData.sources.length === 0) {
        watchData = await tryWatch('upcloud');
      }

      // 3. Si échec, essai avec VidCloud
      if (!watchData || !watchData.sources || watchData.sources.length === 0) {
        watchData = await tryWatch('vidcloud');
      }

      if (watchData && watchData.sources && watchData.sources.length > 0) {
        const m3u8Source = watchData.sources.find((s: StreamSource) => s.quality === 'auto') || watchData.sources[0];
        console.log(`[DirectStream] ${provider}: Succès !`);
        return {
          url: m3u8Source.url,
          referer: watchData.headers?.Referer,
          subtitles: watchData.subtitles
        };
      }
    } catch (error) {
       // Error handling
    }
    return null;
  };

  // Liste des providers à utiliser (basé sur la doc utilisateur)
  const providers = ['flixhq', 'goku', 'sflix', 'himovies'];

  // Exécution parallèle : On lance TMDB + tous les providers
  const strategies = [
      strategy1(),
      ...providers.map(p => runProviderStrategy(p))
  ];

  const results = await Promise.allSettled(strategies);

  // On retourne le premier résultat positif
  for (const res of results) {
      if (res.status === 'fulfilled' && res.value) return res.value;
  }

  return null;
};
