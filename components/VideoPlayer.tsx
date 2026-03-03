"use client";

import React, { useState, useEffect, useRef } from "react";
import { ExternalLink, Server, Zap, Globe, Film, Rocket, AlertCircle, CheckCircle } from "lucide-react";
import DirectPlayer from "./DirectPlayer";

interface VideoPlayerProps {
  id: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
  title?: string;
  originalTitle?: string;
  year?: string;
}

const SERVERS = [
  // --- PRIORITÉ 1 : Les Leaders ---
  {
    name: "VidSrc.to",
    group: "Recommended",
    icon: Zap,
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie"
        ? `https://vidsrc.to/embed/movie/${id}`
        : `https://vidsrc.to/embed/tv/${id}/${s}/${e}`,
  },
  {
    name: "VidSrc.me",
    group: "Recommended",
    icon: Globe,
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie"
        ? `https://vidsrc.me/embed/movie?tmdb=${id}`
        : `https://vidsrc.me/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
  },
  {
    name: "2Embed",
    group: "Recommended",
    icon: Server,
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie"
        ? `https://www.2embed.cc/embed/${id}`
        : `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`,
  },
  // --- PRIORITÉ 2 : Les Alternatives ---
  {
    name: "VidSrc.rip",
    group: "Alternative",
    icon: Server,
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie"
        ? `https://vidsrc.rip/embed/movie/${id}`
        : `https://vidsrc.rip/embed/tv/${id}/${s}/${e}`,
  },
  {
    name: "VidLink",
    group: "Alternative",
    icon: Zap,
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie"
        ? `https://vidlink.pro/movie/${id}`
        : `https://vidlink.pro/tv/${id}/${s}/${e}`,
  },
  {
    name: "SmashyStream",
    group: "Alternative",
    icon: Globe,
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie"
        ? `https://embed.smashystream.com/playere.php?tmdb=${id}`
        : `https://embed.smashystream.com/playere.php?tmdb=${id}&season=${s}&episode=${e}`,
  },
  {
    name: "VidBinge",
    group: "Alternative",
    icon: Film,
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie"
        ? `https://vidbinge.dev/embed/movie/${id}`
        : `https://vidbinge.dev/embed/tv/${id}/${s}/${e}`,
  },
  // --- PRIORITÉ 3 : Les Anciens ---
  {
    name: "MoviesAPI",
    group: "Legacy",
    icon: Film,
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie"
        ? `https://moviesapi.club/movie/${id}`
        : `https://moviesapi.club/tv/${id}-${s}-${e}`,
  },
  {
    name: "AutoEmbed",
    group: "Legacy",
    icon: Server,
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie"
        ? `https://player.autoembed.cc/embed/movie?tmdb=${id}`
        : `https://player.autoembed.cc/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
  },
];

const VideoPlayer: React.FC<VideoPlayerProps> = ({ id, type, season, episode, title, originalTitle, year }) => {
  const [currentServer, setCurrentServer] = useState(0);
  const [isDirectMode, setIsDirectMode] = useState(false);
  const [failedServers, setFailedServers] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [autoSwitchEnabled, setAutoSwitchEnabled] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 1. Initialisation intelligente au montage
  useEffect(() => {
    const savedServerName = localStorage.getItem("lastWorkingServer");
    if (savedServerName) {
      const index = SERVERS.findIndex(s => s.name === savedServerName);
      if (index !== -1) {
        console.log(`[SmartPlayer] Serveur favori trouvé: ${savedServerName}`);
        setCurrentServer(index);
        return;
      }
    }
    // Sinon, on commence par le premier de la liste (VidSrc.to)
    setCurrentServer(0);
  }, []);

  // Reset state quand l'ID change (nouveau film/épisode)
  useEffect(() => {
    setFailedServers([]);
    setIsLoading(true);
    setAutoSwitchEnabled(true);
  }, [id, season, episode]);

  const videoUrl = SERVERS[currentServer].url(type, id, season, episode);

  const handleIframeLoad = () => {
    setIsLoading(false);
    // Si ça charge, on considère que c'est un succès (pour l'instant)
    // On sauvegarde ce serveur comme "favori" pour la prochaine fois
    if (!failedServers.includes(currentServer)) {
      localStorage.setItem("lastWorkingServer", SERVERS[currentServer].name);
      console.log(`[SmartPlayer] Serveur ${SERVERS[currentServer].name} chargé avec succès. Sauvegardé.`);
    }
  };

  const handleIframeError = () => {
    console.warn(`[SmartPlayer] Erreur de chargement sur ${SERVERS[currentServer].name}`);
    handleServerFailure();
  };

  const handleServerFailure = React.useCallback(() => {
    if (!autoSwitchEnabled) return;

    // Marquer comme échoué
    setFailedServers(prev => {
      if (!prev.includes(currentServer)) {
        return [...prev, currentServer];
      }
      return prev;
    });

    // Trouver le prochain serveur non échoué
    // On cherche simplement le suivant dans la liste
    const nextServerIndex = SERVERS.findIndex((_, idx) => idx > currentServer);
    
    if (nextServerIndex !== -1) {
      console.log(`[SmartPlayer] Bascule automatique vers ${SERVERS[nextServerIndex].name}`);
      setCurrentServer(nextServerIndex);
      setIsLoading(true);
    } else {
      console.log(`[SmartPlayer] Tous les serveurs ont été tentés.`);
      setAutoSwitchEnabled(false); // On arrête d'essayer automatiquement
    }
  }, [autoSwitchEnabled, currentServer]);

  // Timeout de sécurité : si l'iframe ne charge pas après 8 secondes, on considère ça comme un échec
  useEffect(() => {
    if (!isLoading || !autoSwitchEnabled || isDirectMode) return;

    const timeoutId = setTimeout(() => {
      console.warn(`[SmartPlayer] Timeout sur ${SERVERS[currentServer].name} (8s)`);
      handleServerFailure();
    }, 8000);

    return () => clearTimeout(timeoutId);
  }, [currentServer, isLoading, autoSwitchEnabled, isDirectMode, handleServerFailure]);

  return (
    <div className="w-full max-w-5xl mx-auto mt-8 mb-12">
      {/* Video Player Container */}
      <div className="relative w-full aspect-video bg-[#0A0A0A] rounded-xl overflow-hidden shadow-[0_0_40px_-10px_rgba(0,0,0,0.5)] border border-zinc-800 mb-8 group">
        {isDirectMode ? (
          <DirectPlayer
            tmdbId={id}
            type={type}
            season={season}
            episode={episode}
            title={title}
            originalTitle={originalTitle}
            year={year}
            onClose={() => setIsDirectMode(false)}
          />
        ) : (
          <>
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 z-10">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-[#E50914] border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-zinc-400 animate-pulse">Connexion à {SERVERS[currentServer].name}...</p>
                </div>
              </div>
            )}
            <iframe
              ref={iframeRef}
              key={videoUrl} // Force reload on URL change
              src={videoUrl}
              className="w-full h-full"
              allowFullScreen
              referrerPolicy="no-referrer"
              title="Video Player"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
            />
          </>
        )}
      </div>

      {/* Server Selection Grid */}
      <div className="space-y-6">
        {/* Header & External Link */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="w-1 h-6 bg-[#E50914] rounded-full"></span>
            Sources de lecture
          </h3>
          {!isDirectMode && (
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white hover:border-[#E50914] hover:bg-zinc-800 transition-all duration-300 group"
            >
              <span>OUVRIR DANS UN NOUVEL ONGLET</span>
              <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </a>
          )}
        </div>

        {/* Recommended Servers */}
        <div className={`space-y-3 transition-opacity duration-300 ${isDirectMode ? "opacity-50 pointer-events-none grayscale" : "opacity-100"}`}>
          <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1 flex items-center gap-2">
            Recommandés
            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700">Auto-test</span>
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {SERVERS.filter(s => s.group === "Recommended").map((server) => {
              const index = SERVERS.indexOf(server);
              const isActive = currentServer === index && !isDirectMode;
              const isFailed = failedServers.includes(index);
              const Icon = server.icon;
              
              return (
                <button
                  key={server.name}
                  onClick={() => {
                    setIsDirectMode(false);
                    setCurrentServer(index);
                    setAutoSwitchEnabled(false); // Manual override disables auto-switch
                  }}
                  disabled={isFailed}
                  className={`
                    relative flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium text-sm transition-all duration-300
                    ${isActive 
                      ? "bg-zinc-800 text-white border-2 border-[#E50914] shadow-[0_0_20px_rgba(229,9,20,0.2)]" 
                      : isFailed
                        ? "bg-zinc-900/30 text-zinc-600 border border-zinc-800/30 cursor-not-allowed"
                        : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:bg-zinc-800 hover:text-white hover:border-zinc-700"
                    }
                  `}
                >
                  {isActive && (
                    <div className="absolute inset-0 bg-[#E50914]/5 rounded-lg animate-pulse" />
                  )}
                  <Icon className={`w-4 h-4 ${isActive ? "text-[#E50914]" : isFailed ? "text-zinc-700" : "text-zinc-500"}`} />
                  <span className="relative z-10">{server.name}</span>
                  {isFailed && <AlertCircle className="w-3 h-3 text-red-900 absolute top-2 right-2" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Alternative Servers */}
        <div className={`space-y-3 transition-opacity duration-300 ${isDirectMode ? "opacity-50 pointer-events-none grayscale" : "opacity-100"}`}>
          <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Alternatifs</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {SERVERS.filter(s => s.group !== "Recommended").map((server) => {
              const index = SERVERS.indexOf(server);
              const isActive = currentServer === index && !isDirectMode;
              const isFailed = failedServers.includes(index);
              
              return (
                <button
                  key={server.name}
                  onClick={() => {
                    setIsDirectMode(false);
                    setCurrentServer(index);
                    setAutoSwitchEnabled(false);
                  }}
                  disabled={isFailed}
                  className={`
                    flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg font-medium text-xs transition-all duration-300
                    ${isActive 
                      ? "bg-zinc-800 text-white border border-[#E50914] shadow-[0_0_15px_rgba(229,9,20,0.15)]" 
                      : isFailed
                        ? "bg-zinc-900/30 text-zinc-600 border border-zinc-800/30 cursor-not-allowed"
                        : "bg-zinc-900/50 text-zinc-500 border border-zinc-800/50 hover:bg-zinc-900 hover:text-zinc-300 hover:border-zinc-700"
                    }
                  `}
                >
                  {server.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Mode Direct Button (Dernier recours) */}
        <div className="pt-4 border-t border-zinc-800">
          <button
            onClick={() => setIsDirectMode(true)}
            className={`
              w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-bold text-sm transition-all duration-300
              ${isDirectMode
                ? "bg-gradient-to-r from-[#E50914] to-red-600 text-white shadow-[0_0_30px_rgba(229,9,20,0.4)] scale-[1.02]"
                : "bg-zinc-900 text-zinc-300 border border-zinc-700 hover:border-[#E50914] hover:text-white hover:bg-zinc-800"
              }
            `}
          >
            <Rocket className={`w-5 h-5 ${isDirectMode ? "animate-pulse" : ""}`} />
            <div className="flex flex-col items-start">
              <span>Mode Direct (Voe/Uqload)</span>
              <span className="text-[10px] font-normal opacity-70">Utiliser si les lecteurs ci-dessus ne fonctionnent pas</span>
            </div>
            {isDirectMode && <span className="ml-2 text-xs bg-white/20 px-2 py-0.5 rounded-full">ACTIF</span>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
