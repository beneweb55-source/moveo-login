"use client";

import React, { useState } from "react";
import { ExternalLink, Server, Zap, Globe, Film, PlayCircle, MonitorPlay } from "lucide-react";
import DirectPlayer from "./DirectPlayer";

interface VideoPlayerProps {
  id: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
}

const SERVERS = [
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
  const [mode, setMode] = useState<"iframe" | "direct">("iframe");
  const [currentServer, setCurrentServer] = useState(0);

  const videoUrl = SERVERS[currentServer].url(type, id, season, episode);

  return (
    <div className="w-full max-w-5xl mx-auto mt-8 mb-12">
      {/* Mode Selection Tabs */}
      <div className="flex items-center gap-4 mb-6 border-b border-zinc-800 pb-1">
        <button
          onClick={() => setMode("iframe")}
          className={`
            flex items-center gap-2 px-6 py-3 border-b-2 font-bold text-sm transition-all duration-300
            ${mode === "iframe" 
              ? "border-[#E50914] text-white" 
              : "border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
            }
          `}
        >
          <MonitorPlay className="w-4 h-4" />
          <span>LECTURE STANDARD (IFRAME)</span>
        </button>
        
        <button
          onClick={() => setMode("direct")}
          className={`
            flex items-center gap-2 px-6 py-3 border-b-2 font-bold text-sm transition-all duration-300 relative overflow-hidden group
            ${mode === "direct" 
              ? "border-[#E50914] text-white" 
              : "border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
            }
          `}
        >
          <div className={`absolute inset-0 bg-gradient-to-r from-[#E50914]/10 to-transparent transition-opacity duration-300 ${mode === "direct" ? "opacity-100" : "opacity-0 group-hover:opacity-50"}`} />
          <PlayCircle className="w-4 h-4 relative z-10" />
          <span className="relative z-10">LECTURE DIRECTE (BETA)</span>
          {mode === "direct" && (
            <span className="ml-2 px-1.5 py-0.5 bg-[#E50914] text-[10px] rounded text-white font-bold relative z-10">
              PREMIUM
            </span>
          )}
        </button>
      </div>

      {/* Video Player Container */}
      <div className="relative w-full aspect-video bg-[#0A0A0A] rounded-xl overflow-hidden shadow-[0_0_40px_-10px_rgba(0,0,0,0.5)] border border-zinc-800 mb-8 group">
        {mode === "iframe" ? (
          <iframe
            src={videoUrl}
            className="w-full h-full"
            allowFullScreen
            referrerPolicy="no-referrer"
            title="Video Player"
          />
        ) : (
          <DirectPlayer id={id} type={type} season={season} episode={episode} />
        )}
      </div>

      {/* Server Selection Grid (Only for Iframe Mode) */}
      {mode === "iframe" && (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
          {/* Header & External Link */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="w-1 h-6 bg-[#E50914] rounded-full"></span>
              Sources de lecture
            </h3>
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white hover:border-[#E50914] hover:bg-zinc-800 transition-all duration-300 group"
            >
              <span>OUVRIR DANS UN NOUVEL ONGLET</span>
              <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </a>
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
              {SERVERS.filter(s => s.group !== "Recommended").map((server) => {
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
      )}

      {/* Direct Mode Info (Only for Direct Mode) */}
      {mode === "direct" && (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
           <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="w-1 h-6 bg-[#E50914] rounded-full"></span>
              Lecture Directe (HLS)
            </h3>
          </div>
          
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-[#E50914]/10 rounded-full">
                <Zap className="w-6 h-6 text-[#E50914]" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-white mb-2">Mode Expérimental</h4>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Ce mode utilise une connexion directe aux serveurs de streaming via le protocole HLS. 
                  Il offre généralement une meilleure qualité et moins de publicités, mais peut être instable selon la disponibilité des serveurs.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="px-2 py-1 bg-green-500/10 text-green-400 text-xs font-bold rounded border border-green-500/20">
                    NO ADS
                  </span>
                  <span className="px-2 py-1 bg-blue-500/10 text-blue-400 text-xs font-bold rounded border border-blue-500/20">
                    AUTO QUALITY
                  </span>
                  <span className="px-2 py-1 bg-purple-500/10 text-purple-400 text-xs font-bold rounded border border-purple-500/20">
                    MULTI-SUBTITLES
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
