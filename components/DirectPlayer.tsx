"use client";

import React, { useState, useEffect, useCallback } from "react";
import ReactPlayer from "react-player";
import axios from "axios";
import { AlertCircle, Loader2, RefreshCw, Wifi, WifiOff } from "lucide-react";

interface DirectPlayerProps {
  id: string; // TMDB ID
  type: "movie" | "tv";
  season?: number;
  episode?: number;
}

// Liste de serveurs Consumet publics (à tester/configurer)
const CONSUMET_PROVIDERS = [
  "https://consumet-api.herokuapp.com", // Souvent stable
  "https://api.consumet.org",           // Officiel mais souvent surchargé
];

export default function DirectPlayer({ id, type, season, episode }: DirectPlayerProps) {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providerIndex, setProviderIndex] = useState(0);
  const [subtitles, setSubtitles] = useState<any[]>([]);

  const fetchStream = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStreamUrl(null);

    const baseUrl = CONSUMET_PROVIDERS[providerIndex];
    
    try {
      console.log(`Tentative de connexion à ${baseUrl}...`);
      
      // 1. Récupérer les infos via TMDB ID pour obtenir l'ID de l'épisode/film compatible
      // Note: L'endpoint /meta/tmdb/{id} est le plus direct
      const infoUrl = `${baseUrl}/meta/tmdb/${id}`;
      const { data: infoData } = await axios.get(infoUrl);

      if (!infoData || !infoData.id) {
        throw new Error("Média non trouvé sur ce serveur.");
      }

      let episodeId = "";

      if (type === "movie") {
        episodeId = infoData.episodeId; // Pour un film, c'est souvent directement l'ID
      } else {
        // Pour une série, il faut trouver le bon épisode
        const foundSeason = infoData.seasons?.find((s: any) => s.season === season);
        const foundEpisode = foundSeason?.episodes?.find((e: any) => e.episode === episode);
        
        if (!foundEpisode) {
          throw new Error(`Saison ${season} Épisode ${episode} non trouvé.`);
        }
        episodeId = foundEpisode.id;
      }

      if (!episodeId) {
        throw new Error("Impossible de récupérer l'identifiant de lecture.");
      }

      // 2. Récupérer les sources de streaming
      const watchUrl = `${baseUrl}/meta/tmdb/watch/${episodeId}`;
      const { data: watchData } = await axios.get(watchUrl);

      if (!watchData || !watchData.sources || watchData.sources.length === 0) {
        throw new Error("Aucune source de lecture disponible.");
      }

      // Prioriser la meilleure qualité (souvent la dernière ou celle marquée 'auto')
      const source = watchData.sources.find((s: any) => s.quality === "auto") || watchData.sources[0];
      
      setStreamUrl(source.url);
      setSubtitles(watchData.subtitles || []);

    } catch (err: any) {
      console.error("Erreur DirectPlayer:", err);
      
      // Gestion spécifique de l'erreur "Unexpected token <" (HTML renvoyé au lieu de JSON)
      if (err.message?.includes("Unexpected token") || err.response?.headers?.["content-type"]?.includes("text/html")) {
        setError("Le serveur de streaming est surchargé ou inaccessible (Erreur HTML).");
      } else {
        setError(err.message || "Erreur inconnue lors du chargement du flux.");
      }
    } finally {
      setLoading(false);
    }
  }, [id, type, season, episode, providerIndex]);

  useEffect(() => {
    fetchStream();
  }, [fetchStream]);

  const handleRetry = () => {
    // Essayer le prochain serveur si disponible, sinon revenir au premier
    setProviderIndex((prev) => (prev + 1) % CONSUMET_PROVIDERS.length);
  };

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-[#E50914]" />
        <p className="text-sm text-zinc-400 animate-pulse">Recherche des sources haute qualité...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white gap-6 p-6 text-center">
        <div className="bg-red-500/10 p-4 rounded-full">
          <AlertCircle className="w-12 h-12 text-[#E50914]" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold">Erreur de chargement</h3>
          <p className="text-zinc-400 max-w-md">{error}</p>
        </div>
        <button 
          onClick={handleRetry}
          className="flex items-center gap-2 px-6 py-3 bg-[#E50914] hover:bg-red-700 text-white rounded-full font-bold transition-all"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Changer de serveur ({providerIndex + 1}/{CONSUMET_PROVIDERS.length})</span>
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black group">
      <ReactPlayer
        url={streamUrl!}
        width="100%"
        height="100%"
        controls
        playing
        config={{
          file: {
            attributes: {
              crossOrigin: "anonymous", // Important pour les sous-titres
            },
            tracks: subtitles.map((sub: any) => ({
              kind: 'subtitles',
              src: sub.url,
              srcLang: sub.lang,
              label: sub.lang,
              default: sub.lang?.toLowerCase().includes('fre') || sub.lang?.toLowerCase().includes('fr'),
            })),
          },
        }}
      />
      
      {/* Indicateur de qualité */}
      <div className="absolute top-4 right-4 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full border border-white/10 flex items-center gap-2 text-xs font-bold text-green-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <Wifi className="w-3 h-3" />
        <span>HLS DIRECT</span>
      </div>
    </div>
  );
}
