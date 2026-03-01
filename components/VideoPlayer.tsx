"use client";

import React, { useState } from "react";
import { ExternalLink, Server, Zap, Globe, Film, MessageCircle, Mic } from "lucide-react";

interface VideoPlayerProps {
  id: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
}

const SERVERS = [
  // --- GROUPE 1 : Version Française (VF) ---
  {
    name: "VidLink (VF)",
    group: "Version Française",
    icon: Mic,
    badges: ["VF", "Multi-Audio"],
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie"
        ? `https://vidlink.pro/movie/${id}?primaryColor=E50914&language=fr`
        : `https://vidlink.pro/tv/${id}/${s}/${e}?primaryColor=E50914&language=fr`,
  },
  {
    name: "SmashyStream (VF)",
    group: "Version Française",
    icon: Mic,
    badges: ["VF", "Pubs"],
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie"
        ? `https://embed.smashystream.com/playere.php?tmdb=${id}&lang=fr`
        : `https://embed.smashystream.com/playere.php?tmdb=${id}&season=${s}&episode=${e}&lang=fr`,
  },
  
  // --- GROUPE 2 : Recommandés (VOSTFR) ---
  {
    name: "VidSrc.to",
    group: "Recommandés (VOSTFR)",
    icon: Zap,
    badges: ["Sous-titres FR", "HD"],
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie"
        ? `https://vidsrc.to/embed/movie/${id}?ds_lang=fr`
        : `https://vidsrc.to/embed/tv/${id}/${s}/${e}?ds_lang=fr`,
  },
  {
    name: "VidSrc.rip",
    group: "Recommandés (VOSTFR)",
    icon: Server,
    badges: ["Sous-titres FR", "Rapide"],
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie"
        ? `https://vidsrc.rip/embed/movie/${id}?ds_lang=fr`
        : `https://vidsrc.rip/embed/tv/${id}/${s}/${e}?ds_lang=fr`,
  },
  {
    name: "VidSrc.me",
    group: "Recommandés (VOSTFR)",
    icon: Globe,
    badges: ["Sous-titres FR"],
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie"
        ? `https://vidsrc.me/embed/movie?tmdb=${id}&ds_lang=fr`
        : `https://vidsrc.me/embed/tv?tmdb=${id}&season=${s}&episode=${e}&ds_lang=fr`,
  },

  // --- GROUPE 3 : Alternatifs ---
  {
    name: "VidLink (Multi)",
    group: "Alternatifs",
    icon: Zap,
    badges: ["Multi-Lang"],
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie"
        ? `https://vidlink.pro/movie/${id}?primaryColor=E50914`
        : `https://vidlink.pro/tv/${id}/${s}/${e}?primaryColor=E50914`,
  },
  {
    name: "VidBinge",
    group: "Alternatifs",
    icon: Film,
    badges: ["Backup"],
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie"
        ? `https://vidbinge.dev/embed/movie/${id}`
        : `https://vidbinge.dev/embed/tv/${id}/${s}/${e}`,
  },
  {
    name: "AutoEmbed",
    group: "Alternatifs",
    icon: Server,
    badges: ["Backup"],
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie"
        ? `https://player.autoembed.cc/embed/movie?tmdb=${id}&lang=fr`
        : `https://player.autoembed.cc/embed/tv?tmdb=${id}&season=${s}&episode=${e}&lang=fr`,
  },
];

const VideoPlayer: React.FC<VideoPlayerProps> = ({ id, type, season, episode }) => {
  const [currentServer, setCurrentServer] = useState(0);

  const videoUrl = SERVERS[currentServer].url(type, id, season, episode);

  // Group servers by group name
  const groupedServers = SERVERS.reduce((acc, server, index) => {
    if (!acc[server.group]) {
      acc[server.group] = [] as (typeof SERVERS[0] & { originalIndex: number })[];
    }
    acc[server.group].push({ ...server, originalIndex: index });
    return acc;
  }, {} as Record<string, (typeof SERVERS[0] & { originalIndex: number })[]>);

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
      <div className="space-y-8">
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

        {/* Render Groups */}
        {Object.entries(groupedServers).map(([groupName, servers]) => (
          <div key={groupName} className="space-y-3">
            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1 flex items-center gap-2">
              {groupName.includes("VF") && <Mic className="w-3 h-3 text-[#E50914]" />}
              {groupName.includes("VOSTFR") && <MessageCircle className="w-3 h-3 text-blue-400" />}
              {groupName}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {servers.map((server) => {
                const isActive = currentServer === server.originalIndex;
                const Icon = server.icon;
                
                return (
                  <button
                    key={server.name}
                    onClick={() => setCurrentServer(server.originalIndex)}
                    className={`
                      relative flex flex-col items-start justify-center gap-1 px-4 py-3 rounded-lg font-medium text-sm transition-all duration-300 text-left
                      ${isActive 
                        ? "bg-zinc-800 text-white border-2 border-[#E50914] shadow-[0_0_20px_rgba(229,9,20,0.2)]" 
                        : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:bg-zinc-800 hover:text-white hover:border-zinc-700"
                      }
                    `}
                  >
                    {isActive && (
                      <div className="absolute inset-0 bg-[#E50914]/5 rounded-lg animate-pulse pointer-events-none" />
                    )}
                    
                    <div className="flex items-center gap-2 w-full">
                      <Icon className={`w-4 h-4 ${isActive ? "text-[#E50914]" : "text-zinc-500"}`} />
                      <span className="relative z-10 font-bold">{server.name}</span>
                    </div>

                    {/* Badges */}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {server.badges?.map((badge, i) => (
                        <span 
                          key={i} 
                          className={`
                            text-[10px] px-1.5 py-0.5 rounded border
                            ${badge === "VF" 
                              ? "bg-[#E50914]/10 border-[#E50914]/30 text-[#E50914]" 
                              : badge.includes("FR") 
                                ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                                : "bg-zinc-800 border-zinc-700 text-zinc-500"
                            }
                          `}
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default VideoPlayer;
