"use client";

import React, { useState, useEffect } from "react";
import { ExternalLink, Server, Zap, Globe, Film, Loader2, AlertCircle } from "lucide-react";

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
    icon: Globe,
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie"
        ? `https://www.2embed.cc/embed/${id}`
        : `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`,
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

// Fonction utilitaire de test (Pre-Flight Check via API Route)
const checkServerHealth = async (url: string): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout global pour l'appel API

    // On passe par notre route API pour contourner les problèmes de CORS et avoir un vrai status code
    const response = await fetch(`/api/check-server?url=${encodeURIComponent(url)}`, {
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return data.status === 'ok';
    }
    
    return false;
  } catch (error) {
    return false;
  }
};

const VideoPlayer: React.FC<VideoPlayerProps> = ({ id, type, season, episode }) => {
  const [currentServer, setCurrentServer] = useState<number | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [checkingServerName, setCheckingServerName] = useState<string>("");
  const [allServersFailed, setAllServersFailed] = useState(false);

  // Logique de sélection intelligente au montage (Parallélisée)
  useEffect(() => {
    let isMounted = true;

    const findBestServer = async () => {
      setIsChecking(true);
      setAllServersFailed(false);
      setCurrentServer(null);

      // 1. Récupérer la préférence utilisateur
      const savedServerName = localStorage.getItem("preferredServer");
      let serverOrder = [...SERVERS.map((_, i) => i)]; // Liste des index [0, 1, 2...]

      // Si une préférence existe, on la met en premier dans la liste à tester
      if (savedServerName) {
        const prefIndex = SERVERS.findIndex(s => s.name === savedServerName);
        if (prefIndex !== -1) {
          serverOrder = [prefIndex, ...serverOrder.filter(i => i !== prefIndex)];
        }
      }

      // 2. Tester les serveurs par lots (Batch processing) pour plus de rapidité
      const BATCH_SIZE = 3;
      
      for (let i = 0; i < serverOrder.length; i += BATCH_SIZE) {
        if (!isMounted) return;

        const batchIndices = serverOrder.slice(i, i + BATCH_SIZE);
        const batchServers = batchIndices.map(index => SERVERS[index]);
        
        setCheckingServerName(batchServers.map(s => s.name).join(", "));

        // Lancer les tests en parallèle pour ce lot
        const promises = batchIndices.map(async (index) => {
          const server = SERVERS[index];
          const url = server.url(type, id, season, episode);
          const isHealthy = await checkServerHealth(url);
          return { index, isHealthy, name: server.name };
        });

        const results = await Promise.all(promises);

        // Trouver le premier serveur valide dans ce lot (en respectant l'ordre de priorité original du lot)
        const validResult = results.find(r => r.isHealthy);

        if (validResult) {
          if (!isMounted) return;
          
          console.log(`[SmartPlayer] Serveur validé (Batch) : ${validResult.name}`);
          setCurrentServer(validResult.index);
          setIsChecking(false);
          
          // Sauvegarder ce serveur comme fonctionnel pour la prochaine fois
          localStorage.setItem("preferredServer", validResult.name);
          return; // On a trouvé, on arrête tout
        } else {
          console.warn(`[SmartPlayer] Lot échoué : ${batchServers.map(s => s.name).join(", ")}`);
        }
      }

      // 3. Si on arrive ici, aucun serveur n'a répondu
      if (isMounted) {
        console.error("[SmartPlayer] Aucun serveur iframe n'est accessible.");
        setAllServersFailed(true);
        setIsChecking(false);
      }
    };

    findBestServer();

    return () => { isMounted = false; };
  }, [id, type, season, episode]);

  const videoUrl = currentServer !== null ? SERVERS[currentServer].url(type, id, season, episode) : "";

  return (
    <div className="w-full max-w-5xl mx-auto mt-8 mb-12">
      {/* Video Player Container */}
      <div className="relative w-full aspect-video bg-[#0A0A0A] rounded-xl overflow-hidden shadow-[0_0_40px_-10px_rgba(0,0,0,0.5)] border border-zinc-800 mb-8 group">
        
        {/* CAS 1 : En cours de vérification (Pre-Flight Check) */}
        {isChecking && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-950 text-white">
            <Loader2 className="w-12 h-12 text-[#E50914] animate-spin mb-4" />
            <h3 className="text-lg font-bold animate-pulse">Recherche du meilleur serveur...</h3>
            <p className="text-zinc-500 text-sm mt-2">Test de {checkingServerName}</p>
          </div>
        )}

        {/* CAS 2 : Tous les serveurs ont échoué */}
        {!isChecking && allServersFailed && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-950 text-white p-6 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
            <h3 className="text-xl font-bold mb-2">Aucune source disponible</h3>
            <p className="text-zinc-400 max-w-md mb-6">
              Désolé, aucun serveur de lecture n'est accessible pour ce contenu actuellement.
            </p>
          </div>
        )}

        {/* CAS 3 : Serveur trouvé et validé */}
        {!isChecking && currentServer !== null && (
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
          {currentServer !== null && (
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
        <div className={`space-y-3 transition-opacity duration-300 ${isChecking ? "opacity-50 pointer-events-none grayscale" : "opacity-100"}`}>
          <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Recommandés</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {SERVERS.filter(s => s.group === "Recommended").map((server) => {
              const index = SERVERS.indexOf(server);
              const isActive = currentServer === index;
              const Icon = server.icon;
              
              return (
                <button
                  key={server.name}
                  onClick={() => {
                    setCurrentServer(index);
                    localStorage.setItem("preferredServer", server.name);
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
        <div className={`space-y-3 transition-opacity duration-300 ${isChecking ? "opacity-50 pointer-events-none grayscale" : "opacity-100"}`}>
          <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Alternatifs</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {SERVERS.filter(s => s.group !== "Recommended").map((server) => {
              const index = SERVERS.indexOf(server);
              const isActive = currentServer === index;
              
              return (
                <button
                  key={server.name}
                  onClick={() => {
                    setCurrentServer(index);
                    localStorage.setItem("preferredServer", server.name);
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
