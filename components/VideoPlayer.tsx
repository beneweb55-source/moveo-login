"use client";

import React, { useState } from "react";
import { ExternalLink, Server, Zap, Globe, Film } from "lucide-react";

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
  const [currentServer, setCurrentServer] = useState(0);

  const videoUrl = SERVERS[currentServer].url(type, id, season, episode);

  return (
    <div className="w-full max-w-5xl mx-auto mt-8 mb-12">
      {/* Video Player Container */}
      <div className="relative w-full aspect-video bg-[#0A0A0A] rounded-xl overflow-hidden shadow-[0_0_40px_-10px_rgba(0,0,0,0.5)] border border-zinc-800 mb-8 group">
        <iframe
          src={videoUrl}
          className="w-full h-full"
          allowFullScreen
          referrerPolicy="no-referrer"
          title="Video Player"
        />
      </div>

      {/* Server Selection Grid */}
      <div className="space-y-6">
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
    </div>
  );
};

export default VideoPlayer;
