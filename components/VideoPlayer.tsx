"use client";

import React, { useState, useEffect, useRef } from "react";
import { ExternalLink, Server, Zap, Globe, Film, Loader2, AlertCircle } from "lucide-react";

import { saveWatchHistory, getWatchHistory } from "@/utils/historyManager";
import { useLanguage } from "@/context/LanguageContext";

interface VideoPlayerProps {
  id: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
  title?: string;
  originalTitle?: string;
  year?: string;
  genres?: { id: number; name: string }[];
  posterPath?: string;
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
  {
    name: "AutoEmbed",
    group: "Recommended",
    icon: Server,
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie"
        ? `https://player.autoembed.cc/embed/movie/${id}`
        : `https://player.autoembed.cc/embed/tv/${id}/${s}/${e}`,
  },
  {
    name: "SuperEmbed",
    group: "Recommended",
    icon: Zap,
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie"
        ? `https://multiembed.mov/?video_id=${id}&tmdb=1`
        : `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`,
  },
  // --- GROUPE 2 : Nouveaux challengers ---
  {
    name: "VidLink",
    group: "Alternative",
    icon: Zap,
    warningKey: "disableAdblock",
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie"
        ? `https://vidlink.pro/movie/${id}`
        : `https://vidlink.pro/tv/${id}/${s}/${e}`,
  },
  {
    name: "Frembed",
    group: "Alternative",
    icon: Globe,
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie"
        ? `https://frembed.work/api/film.php?id=${id}`
        : `https://frembed.work/api/serie.php?id=${id}&sa=${s}&epi=${e}`,
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
];

// Fonction utilitaire de test (Pre-Flight Check via API Route)
const checkServerHealth = async (url: string): Promise<boolean> => {
  try {
    const cacheKey = `health_${url}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const { status, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < 1000 * 60 * 5) { // 5 minutes cache
        return status;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout global pour l'appel API

    // On passe par notre route API pour contourner les problèmes de CORS et avoir un vrai status code
    const response = await fetch(`/api/check-server?url=${encodeURIComponent(url)}`, {
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const isHealthy = data.status === 'ok';
      sessionStorage.setItem(cacheKey, JSON.stringify({ status: isHealthy, timestamp: Date.now() }));
      return isHealthy;
    }
    
    sessionStorage.setItem(cacheKey, JSON.stringify({ status: false, timestamp: Date.now() }));
    return false;
  } catch (error) {
    return false;
  }
};

const VideoPlayer: React.FC<VideoPlayerProps> = ({ id, type, season, episode, genres, title, posterPath }) => {
  const { t } = useLanguage();
  const [currentServer, setCurrentServer] = useState<number | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [checkingServerName, setCheckingServerName] = useState<string>("");
  const [allServersFailed, setAllServersFailed] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  const isAnime = genres?.some(g => g.id === 16);

  // Watchdog pour surveiller le chargement de l'iframe
  useEffect(() => {
    if (currentServer === null || isChecking || iframeLoaded) return;

    const timeoutId = setTimeout(() => {
      // Si après 6s l'iframe n'a pas chargé, on passe au suivant
      console.warn(`[SmartPlayer] Timeout (6s) sur le serveur ${SERVERS[currentServer].name}. Changement automatique...`);
      setIsSwitching(true);
      
      // Petit délai pour afficher le message avant de changer
      setTimeout(() => {
        const nextIndex = (currentServer + 1) % SERVERS.length;
        // On évite de boucler à l'infini si on revient au début et qu'on a déjà tout testé, 
        // mais ici on suppose que le pre-flight a déjà filtré les morts.
        // On passe juste au suivant dans la liste.
        setCurrentServer(nextIndex);
        localStorage.setItem("preferredServer", SERVERS[nextIndex].name);
        setIsSwitching(false);
        setIframeLoaded(false); // Reset pour le nouveau serveur
      }, 1500);

    }, 6000);

    return () => clearTimeout(timeoutId);
  }, [currentServer, isChecking, iframeLoaded]);

  // Reset iframeLoaded quand on change de serveur manuellement ou automatiquement
  // useEffect(() => {
  //   setIframeLoaded(false);
  //   setIsSwitching(false);
  // }, [currentServer]);

  // Logique de sélection intelligente au montage (Parallélisée)
  useEffect(() => {
    let isMounted = true;

    const findBestServer = async () => {
      setIsChecking(true);
      setAllServersFailed(false);
      setCurrentServer(null);
      setIframeLoaded(false);

      // 1. Récupérer la préférence utilisateur (Historique spécifique > Préférence globale)
      const history = getWatchHistory();
      const historyItem = history.find((item) => item.id === id);
      const savedServerName = historyItem?.provider || localStorage.getItem("preferredServer");
      
      let serverOrder = [...SERVERS.map((_, i) => i)]; // Liste des index [0, 1, 2...]

      // Si une préférence existe, on l'utilise directement pour éviter le throttling Vercel sur les onglets dupliqués
      if (savedServerName) {
        const prefIndex = SERVERS.findIndex(s => s.name === savedServerName);
        if (prefIndex !== -1) {
          console.log(`[SmartPlayer] Utilisation directe du serveur préféré : ${savedServerName}`);
          setCurrentServer(prefIndex);
          setIsChecking(false);
          return;
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
          
          // Sauvegarder dans l'historique
          if (title) {
            saveWatchHistory({
              id,
              type,
              title,
              poster_path: posterPath || "",
              season,
              episode,
              provider: validResult.name,
              last_watched: Date.now(),
            });
          }
          
          return; // On a trouvé, on arrête tout
        } else {
          console.warn(`[SmartPlayer] Lot échoué : ${batchServers.map(s => s.name).join(", ")}`);
        }
      }

      // 3. Si on arrive ici, aucun serveur n'a répondu
      if (isMounted) {
        console.warn("[SmartPlayer] Aucun serveur validé. Fallback sur le premier choix.");
        // Au lieu d'afficher l'erreur, on force le premier serveur de la liste (qui est le préféré si dispo)
        setCurrentServer(serverOrder[0]);
        setAllServersFailed(false);
        setIsChecking(false);
      }
    };

    findBestServer();

    return () => { isMounted = false; };
  }, [id, type, season, episode, title, posterPath]);

  const lastSaveTime = useRef(0);

  // Listen for messages from iframe (for progress tracking)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data) return;
      
      // Try to extract currentTime and duration from various common formats
      let currentTime = 0;
      let duration = 0;
      let eventType = "";

      // Format 1: { event: "timeupdate", data: { currentTime, duration } }
      if (event.data.event === "timeupdate" && event.data.data) {
        currentTime = event.data.data.currentTime;
        duration = event.data.data.duration;
        eventType = "timeupdate";
      }
      // Format 2: { type: "MEDIA_DATA", data: { currentTime, duration } }
      else if (event.data.type === "MEDIA_DATA" && event.data.data) {
        currentTime = event.data.data.currentTime;
        duration = event.data.data.duration;
        eventType = "timeupdate";
      }
      // Format 3: { type: "timeupdate", currentTime, duration } (Direct)
      else if (event.data.type === "timeupdate") {
        currentTime = event.data.currentTime;
        duration = event.data.duration;
        eventType = "timeupdate";
      }

      if (eventType === "timeupdate" && duration > 0 && title && currentServer !== null) {
        const now = Date.now();
        // Throttle updates to every 5 seconds
        if (now - lastSaveTime.current > 5000) {
          saveWatchHistory({
            id,
            type,
            title,
            poster_path: posterPath || "",
            season,
            episode,
            provider: SERVERS[currentServer].name,
            last_watched: now,
            timestamp: currentTime,
            duration: duration
          });
          lastSaveTime.current = now;
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [id, type, title, posterPath, season, episode, currentServer]);

  // Mettre à jour l'historique périodiquement (toutes les minutes) pour le "last_watched"
  useEffect(() => {
    if (currentServer === null || !title) return;

    const interval = setInterval(() => {
      saveWatchHistory({
        id,
        type,
        title,
        poster_path: posterPath || "",
        season,
        episode,
        provider: SERVERS[currentServer].name,
        last_watched: Date.now(),
      });
    }, 60000);

    return () => clearInterval(interval);
  }, [currentServer, id, type, title, posterPath, season, episode]);

  const videoUrl = currentServer !== null ? SERVERS[currentServer].url(type, id, season, episode) : "";

  return (
    <div className="w-full max-w-5xl mx-auto mt-8 mb-12">
      {/* Video Player Container */}
      <div className="relative w-full aspect-video bg-[#0A0A0A] rounded-xl overflow-hidden shadow-[0_0_40px_-10px_rgba(0,0,0,0.5)] border border-zinc-800 mb-8 group">
        
        {/* CAS 1 : En cours de vérification (Pre-Flight Check) */}
        {isChecking && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-950 text-white">
            <Loader2 className="w-12 h-12 text-[#E50914] animate-spin mb-4" />
            <h3 className="text-lg font-bold animate-pulse">{t.details.searchingServer}</h3>
            <p className="text-zinc-500 text-sm mt-2">{t.details.testing} {checkingServerName}</p>
          </div>
        )}

        {/* CAS 1.5 : Changement automatique (Watchdog) */}
        {isSwitching && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-zinc-950/90 backdrop-blur-sm text-white transition-all duration-300">
            <Loader2 className="w-10 h-10 text-orange-500 animate-spin mb-3" />
            <h3 className="text-lg font-bold text-orange-500">{t.details.slowServerDetected}</h3>
            <p className="text-zinc-300 text-sm mt-1">{t.details.autoSwitching}</p>
          </div>
        )}

        {/* CAS 3 : Serveur trouvé et validé */}
        {!isChecking && currentServer !== null && (
          <>
            {(SERVERS[currentServer] as any).warningKey && (
              <div className="absolute top-0 left-0 right-0 z-10 bg-yellow-500/90 text-black text-xs font-bold px-4 py-2 text-center backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-500">
                ⚠️ {(t.details as any)[(SERVERS[currentServer] as any).warningKey]}
              </div>
            )}
            <iframe
              src={videoUrl}
              className="w-full h-full"
              allowFullScreen
              referrerPolicy="no-referrer"
              title="Video Player"
              onLoad={() => {
                console.log(`[SmartPlayer] Iframe chargée pour ${SERVERS[currentServer].name}`);
                setIframeLoaded(true);
              }}
              onError={() => {
                 // Note: onError ne se déclenche pas souvent pour les iframes cross-origin, 
                 // mais on le met au cas où.
                 console.error(`[SmartPlayer] Erreur iframe pour ${SERVERS[currentServer].name}`);
                 // On force le switch immédiatement
                 setIsSwitching(true);
                 setTimeout(() => {
                   const nextIndex = (currentServer + 1) % SERVERS.length;
                   setCurrentServer(nextIndex);
                   localStorage.setItem("preferredServer", SERVERS[nextIndex].name);
                   setIsSwitching(false);
                   setIframeLoaded(false);
                 }, 1000);
              }}
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
            {t.details.playbackSources}
          </h3>
          {currentServer !== null && (
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white hover:border-[#E50914] hover:bg-zinc-800 transition-all duration-300 group"
            >
              <span>{t.details.openInNewTab}</span>
              <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </a>
          )}
        </div>

        {/* Recommended Servers */}
        <div className={`space-y-3 transition-opacity duration-300 ${isChecking ? "opacity-50 pointer-events-none grayscale" : "opacity-100"}`}>
          <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">{t.details.recommended}</h4>
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
                    setIframeLoaded(false);
                    setIsSwitching(false);
                  }}
                  className={`
                    relative flex flex-col items-center justify-center gap-1.5 px-3 py-3 rounded-lg font-medium text-sm transition-all duration-300
                    ${isActive 
                      ? "bg-zinc-800 text-white border-2 border-[#E50914] shadow-[0_0_20px_rgba(229,9,20,0.2)]" 
                      : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:bg-zinc-800 hover:text-white hover:border-zinc-700"
                    }
                  `}
                >
                  {isActive && (
                    <div className="absolute inset-0 bg-[#E50914]/5 rounded-lg animate-pulse" />
                  )}
                  <div className="flex items-center gap-2 relative z-10">
                    <Icon className={`w-4 h-4 ${isActive ? "text-[#E50914]" : "text-zinc-500"}`} />
                    <span>{server.name}</span>
                  </div>
                  
                  {/* Badges intuitifs */}
                  <div className="flex items-center gap-1.5 mt-1 relative z-10">
                    {server.name === "2Embed" && (
                      <>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">VF/VO</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-300 border border-zinc-600/50" title={t.details.internalServerChoice}>⚙️ Multi</span>
                      </>
                    )}
                    {(server.name === "VidSrc.to" || server.name === "VidSrc.me" || server.name === "AutoEmbed") && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">VO/EN</span>
                    )}
                    {(server.name === "VidSrc.to" || server.name === "VidSrc.me") && isAnime && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-500 border border-yellow-500/30" title={t.details.wrongEpisodeWarning}>⚠️ {t.details.errors}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Alternative Servers */}
        <div className={`space-y-3 transition-opacity duration-300 ${isChecking ? "opacity-50 pointer-events-none grayscale" : "opacity-100"}`}>
          <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">{t.details.alternative}</h4>
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
                    setIframeLoaded(false);
                    setIsSwitching(false);
                  }}
                  className={`
                    relative flex flex-col items-center justify-center gap-1 px-2 py-2.5 rounded-lg font-medium text-xs transition-all duration-300
                    ${isActive 
                      ? "bg-zinc-800 text-white border border-[#E50914] shadow-[0_0_15px_rgba(229,9,20,0.15)]" 
                      : "bg-zinc-900/50 text-zinc-500 border border-zinc-800/50 hover:bg-zinc-900 hover:text-zinc-300 hover:border-zinc-700"
                    }
                  `}
                >
                  <span className="relative z-10">{server.name}</span>
                  
                  {/* Badges intuitifs */}
                  <div className="flex items-center gap-1 mt-0.5 relative z-10">
                    {server.name === "Frembed" && (
                      <>
                        <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">🇫🇷 VF/VO</span>
                        <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-zinc-700/50 text-zinc-300 border border-zinc-600/50" title={t.details.internalServerChoice}>⚙️ Multi</span>
                      </>
                    )}
                    {server.name === "VidLink" && isAnime && (
                      <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-[#E50914]/20 text-[#E50914] border border-[#E50914]/30">VOSTFR</span>
                    )}
                  </div>
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
