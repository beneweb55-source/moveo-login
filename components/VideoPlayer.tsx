"use client";

import React, { useState, useEffect } from "react";
import { ExternalLink, Server, Zap, Globe, Film, PlayCircle, AlertTriangle } from "lucide-react";
import CustomVideoPlayer from "./CustomVideoPlayer";

interface VideoPlayerProps {
  id: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
}

const SERVERS = [
  // --- GROUPE 0 : Direct Stream (Custom) ---
  {
    name: "⭐ Mode Streaming Direct (HLS)",
    group: "Premium",
    icon: PlayCircle,
    isCustom: true,
    badge: "Optimisé VF/STFR",
    url: () => "", // Placeholder
  },
  // --- GROUPE 1 : Les Plus Fiables ---
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
    name: "VidSrc.rip",
    group: "Recommended",
    icon: Server,
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie"
        ? `https://vidsrc.rip/embed/movie/${id}`
        : `https://vidsrc.rip/embed/tv/${id}/${s}/${e}`,
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
  // --- GROUPE 2 : Nouveaux challengers ---
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
  // --- GROUPE 3 : Les Anciens ---
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

const VideoPlayer: React.FC<VideoPlayerProps> = ({ id, type, season, episode }) => {
  const [currentServer, setCurrentServer] = useState(0);
  const [customSource, setCustomSource] = useState<string | null>(null);
  const [isLoadingCustom, setIsLoadingCustom] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  const activeServer = SERVERS[currentServer];
  const isCustomMode = activeServer.isCustom;

  useEffect(() => {
    if (isCustomMode) {
      const fetchSource = async () => {
        setIsLoadingCustom(true);
        setCustomError(null);
        setCustomSource(null);

        try {
          const res = await fetch("/api/stream/source", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tmdbId: id, type, season, episode }),
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data.error || "Erreur lors de la récupération du flux");
          }

          if (data.source && data.source.url) {
            setCustomSource(data.source.url);
          } else {
            throw new Error("Aucune source compatible trouvée");
          }
        } catch (err: any) {
          console.error("Custom Stream Error:", err);
          setCustomError(err.message || "Erreur inconnue");
        } finally {
          setIsLoadingCustom(false);
        }
      };

      fetchSource();
    }
  }, [currentServer, id, type, season, episode, isCustomMode]);

  const handleRetryStandard = () => {
    // Switch to the first standard server (index 1)
    setCurrentServer(1);
  };

  return (
    <div className="w-full max-w-5xl mx-auto mt-8 mb-12">
      {/* Video Player Container */}
      <div className="relative w-full aspect-video bg-[#0A0A0A] rounded-xl overflow-hidden shadow-[0_0_40px_-10px_rgba(0,0,0,0.5)] border border-zinc-800 mb-8 group">
        {isCustomMode ? (
          isLoadingCustom ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-black text-white">
              <div className="w-12 h-12 border-4 border-[#E50914] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium animate-pulse">Recherche du meilleur flux...</p>
            </div>
          ) : customError ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-black text-white p-6 text-center">
              <AlertTriangle className="w-12 h-12 text-[#E50914]" />
              <h3 className="text-xl font-bold">Erreur de chargement</h3>
              <p className="text-zinc-400 max-w-md">{customError}</p>
              <button 
                onClick={handleRetryStandard}
                className="mt-4 px-6 py-2 bg-[#E50914] hover:bg-red-700 text-white rounded-full font-bold transition-all"
              >
                Revenir au lecteur standard
              </button>
            </div>
          ) : customSource ? (
            <CustomVideoPlayer 
              src={customSource} 
              autoPlay 
              onBack={handleRetryStandard}
              onError={(e) => setCustomError("Erreur de lecture du flux.")}
            />
          ) : null
        ) : (
          <iframe
            src={activeServer.url(type, id, season, episode)}
            className="w-full h-full"
            allowFullScreen
            referrerPolicy="no-referrer"
            title="Video Player"
          />
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
          {!isCustomMode && (
            <a
              href={activeServer.url(type, id, season, episode)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white hover:border-[#E50914] hover:bg-zinc-800 transition-all duration-300 group"
            >
              <span>OUVRIR DANS UN NOUVEL ONGLET</span>
              <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </a>
          )}
        </div>

        {/* Premium / Custom Servers */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-[#E50914] uppercase tracking-widest ml-1 flex items-center gap-2">
            <Zap className="w-3 h-3" /> Premium
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SERVERS.filter(s => s.group === "Premium").map((server) => {
              const index = SERVERS.indexOf(server);
              const isActive = currentServer === index;
              const Icon = server.icon;
              
              return (
                <button
                  key={server.name}
                  onClick={() => setCurrentServer(index)}
                  className={`
                    relative flex items-center justify-between gap-3 px-4 py-4 rounded-xl font-bold text-sm transition-all duration-300 overflow-hidden group
                    ${isActive 
                      ? "bg-gradient-to-r from-[#E50914] to-red-900 text-white shadow-[0_0_25px_rgba(229,9,20,0.4)] scale-[1.02]" 
                      : "bg-zinc-900 text-white border border-zinc-800 hover:border-[#E50914]/50 hover:bg-zinc-800"
                    }
                  `}
                >
                  <div className="flex items-center gap-3 relative z-10">
                    <div className={`p-2 rounded-full ${isActive ? "bg-white/20" : "bg-zinc-800 group-hover:bg-[#E50914]/20"} transition-colors`}>
                      <Icon className={`w-5 h-5 ${isActive ? "text-white" : "text-[#E50914]"}`} />
                    </div>
                    <div className="flex flex-col items-start">
                      <span>{server.name}</span>
                      {server.badge && (
                        <span className={`text-[10px] uppercase tracking-wider ${isActive ? "text-white/80" : "text-zinc-500"}`}>
                          {server.badge}
                        </span>
                      )}
                    </div>
                  </div>
                  {isActive && <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Recommended Servers */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Recommandés</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {SERVERS.filter(s => s.group === "Recommended").map((server) => {
              const index = SERVERS.indexOf(server);
              const isActive = currentServer === index;
              const Icon = server.icon;
              
              return (
                <button
                  key={server.name}
                  onClick={() => setCurrentServer(index)}
                  className={`
                    relative flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium text-sm transition-all duration-300
                    ${isActive 
                      ? "bg-zinc-800 text-white border-2 border-[#E50914] shadow-[0_0_20px_rgba(229,9,20,0.2)]" 
                      : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:bg-zinc-800 hover:text-white hover:border-zinc-700"
                    }
                  `}
                >
                  {isActive && (
                    <div className="absolute inset-0 bg-[#E50914]/5 rounded-lg animate-pulse" />
                  )}
                  <Icon className={`w-4 h-4 ${isActive ? "text-[#E50914]" : "text-zinc-500"}`} />
                  <span className="relative z-10">{server.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Alternative Servers */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Alternatifs</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {SERVERS.filter(s => s.group !== "Recommended" && s.group !== "Premium").map((server) => {
              const index = SERVERS.indexOf(server);
              const isActive = currentServer === index;
              
              return (
                <button
                  key={server.name}
                  onClick={() => setCurrentServer(index)}
                  className={`
                    flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg font-medium text-xs transition-all duration-300
                    ${isActive 
                      ? "bg-zinc-800 text-white border border-[#E50914] shadow-[0_0_15px_rgba(229,9,20,0.15)]" 
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
      </div>
    </div>
  );
};

export default VideoPlayer;
