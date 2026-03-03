"use client";

import React, { useState } from "react";
import { ExternalLink, Server, Zap, Globe, Film, Rocket } from "lucide-react";
import DirectPlayer from "./DirectPlayer";

interface VideoPlayerProps {
  id: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
  title?: string;
  year?: string;
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

const VideoPlayer: React.FC<VideoPlayerProps> = ({ id, type, season, episode, title, year }) => {
  const [currentServer, setCurrentServer] = useState(0);
  const [isDirectMode, setIsDirectMode] = useState(false);

  const videoUrl = SERVERS[currentServer].url(type, id, season, episode);

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
            year={year}
            onClose={() => setIsDirectMode(false)}
          />
        ) : (
          <iframe
            src={videoUrl}
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

        {/* Mode Direct Button */}
        <div className="mb-6">
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
            <span>🚀 Mode Direct (Voe/Uqload)</span>
            {isDirectMode && <span className="ml-2 text-xs bg-white/20 px-2 py-0.5 rounded-full">ACTIF</span>}
          </button>
        </div>

        {/* Recommended Servers */}
        <div className={`space-y-3 transition-opacity duration-300 ${isDirectMode ? "opacity-50 pointer-events-none grayscale" : "opacity-100"}`}>
          <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Recommandés</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {SERVERS.filter(s => s.group === "Recommended").map((server) => {
              const index = SERVERS.indexOf(server);
              const isActive = currentServer === index && !isDirectMode;
              const Icon = server.icon;
              
              return (
                <button
                  key={server.name}
                  onClick={() => {
                    setIsDirectMode(false);
                    setCurrentServer(index);
                  }}
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
        <div className={`space-y-3 transition-opacity duration-300 ${isDirectMode ? "opacity-50 pointer-events-none grayscale" : "opacity-100"}`}>
          <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Alternatifs</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {SERVERS.filter(s => s.group !== "Recommended").map((server) => {
              const index = SERVERS.indexOf(server);
              const isActive = currentServer === index && !isDirectMode;
              
              return (
                <button
                  key={server.name}
                  onClick={() => {
                    setIsDirectMode(false);
                    setCurrentServer(index);
                  }}
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
