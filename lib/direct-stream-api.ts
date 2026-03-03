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
  episode?: number
): Promise<DirectStreamResult | null> => {
  if (!BASE_URL) {
    console.warn("Direct Stream API: NEXT_PUBLIC_CONSUMET_API_URL n'est pas défini.");
    return null;
  }

    let title = '';
    let year = '';
    let originalTitle = '';

    // --- STRATÉGIE 1 : Via meta/tmdb (Rapide mais peut échouer sur les IDs) ---
    try {
      console.log(`[DirectStream] Stratégie 1: meta/tmdb/${tmdbId}`);
      const infoUrl = `${BASE_URL}/meta/tmdb/${tmdbId}`;
      const infoResponse = await axios.get(infoUrl, { timeout: 5000 });
      const data = infoResponse.data;

      // Sauvegarde des métadonnées pour la stratégie 2 si besoin
      title = data.title;
      year = (data.releaseDate || data.firstAirDate)?.split('-')[0];
      originalTitle = data.originalTitle;

      let episodeId = '';
      // ... (reste du code de recherche d'episodeId)
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
          return {
            url: m3u8Source.url,
            referer: watchResponse.data.headers?.Referer,
            subtitles: watchResponse.data.subtitles
          };
        }
      }
    } catch (error) {
      console.warn("[DirectStream] Stratégie 1 échouée, passage à la Stratégie 2 (Fallback FlixHQ)");
    }

    // --- STRATÉGIE 2 : Fallback via Recherche FlixHQ (Plus robuste pour les IDs) ---
    try {
      // Si on n'a pas pu récupérer les infos via Consumet (Stratégie 1 échouée totalement),
      // on essaie via l'API TMDB officielle si la clé est présente.
      if (!title || !year) {
        if (TMDB_API_KEY) {
          const tmdbDetailsUrl = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
          const tmdbRes = await axios.get(tmdbDetailsUrl);
          title = tmdbRes.data.title || tmdbRes.data.name;
          year = (tmdbRes.data.release_date || tmdbRes.data.first_air_date)?.split('-')[0];
          originalTitle = tmdbRes.data.original_title || tmdbRes.data.original_name;
        } else {
          console.warn("[DirectStream] Pas de métadonnées (titre/année) et pas de clé TMDB. Impossible d'utiliser le fallback.");
          return null;
        }
      }

      console.log(`[DirectStream] Stratégie 2: Recherche FlixHQ pour "${title}" (${year})`);
      
      // ... (reste du code de recherche FlixHQ)

    // 2. Rechercher sur FlixHQ via Consumet
    // On essaie d'abord avec le titre anglais, puis original si différent
    let searchResults = [];
    try {
      const searchUrl = `${BASE_URL}/movies/flixhq/${encodeURIComponent(cleanTitle(title))}`;
      const searchRes = await axios.get(searchUrl, { timeout: 5000 });
      searchResults = searchRes.data.results;
    } catch (e) {
      // Si la recherche échoue, on continue
    }

    if ((!searchResults || searchResults.length === 0) && originalTitle && originalTitle !== title) {
       try {
        const searchUrl = `${BASE_URL}/movies/flixhq/${encodeURIComponent(cleanTitle(originalTitle))}`;
        const searchRes = await axios.get(searchUrl, { timeout: 5000 });
        searchResults = searchRes.data.results;
       } catch (e) {}
    }

    if (!searchResults || searchResults.length === 0) {
      console.warn("[DirectStream] Aucun résultat trouvé sur FlixHQ.");
      return null;
    }

    // 3. Filtrer pour trouver le bon média (Année + Titre proche)
    // FlixHQ retourne 'releaseDate' ou 'type'
    const match = searchResults.find((r: any) => {
      const rYear = r.releaseDate?.split('-')[0] || r.releaseDate;
      // Correspondance stricte sur l'année si disponible, sinon on prend le premier résultat pertinent
      return rYear === year || (r.type === (type === 'movie' ? 'Movie' : 'TV Series') && r.title.toLowerCase().includes(title.toLowerCase()));
    });

    if (!match) {
      console.warn("[DirectStream] Pas de correspondance exacte trouvée.");
      return null;
    }

    console.log(`[DirectStream] Correspondance trouvée: ${match.title} (${match.id})`);

    // 4. Récupérer les infos détaillées du média trouvé (pour avoir les IDs d'épisodes internes)
    const infoUrl = `${BASE_URL}/movies/flixhq/info?id=${match.id}`;
    const infoRes = await axios.get(infoUrl, { timeout: 5000 });
    const mediaInfo = infoRes.data;

    let episodeId = '';

    if (type === 'movie') {
      episodeId = mediaInfo.episodes?.[0]?.id;
    } else {
      // Pour les séries, trouver la bonne saison et épisode
      // FlixHQ structure: episodes: [{ id, number, season, title }]
      const targetEp = mediaInfo.episodes?.find((e: any) => e.season === season && e.number === episode);
      if (targetEp) episodeId = targetEp.id;
    }

    if (!episodeId) {
      console.warn("[DirectStream] Épisode introuvable dans les infos FlixHQ.");
      return null;
    }

    // 5. Récupérer le lien de streaming final
    // FlixHQ requiert souvent mediaId ET episodeId
    const watchUrl = `${BASE_URL}/movies/flixhq/watch?episodeId=${episodeId}&mediaId=${match.id}`;
    const watchRes = await axios.get(watchUrl, { timeout: 8000 });
    const sources = watchRes.data.sources;

    if (!sources || sources.length === 0) return null;

    const m3u8Source = sources.find((s: StreamSource) => s.quality === 'auto') || sources[0];

    return {
      url: m3u8Source.url,
      referer: watchRes.data.headers?.Referer,
      subtitles: watchRes.data.subtitles
    };

  } catch (error) {
    console.error("[DirectStream] Erreur globale Stratégie 2:", error);
    return null;
  }
};
