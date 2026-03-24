"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ExternalLink, Server, Globe, Loader2, AlertCircle, CheckCircle2, Database, Lock, Play, SkipBack, SkipForward, Zap, Settings2, ChevronRight } from "lucide-react";
import Image from "next/image";

import { saveWatchHistory, getWatchHistory } from "@/utils/historyManager";
import { useLanguage } from "@/context/LanguageContext";

import { useDeviceOS } from "@/hooks/useDeviceOS";
import BottomSheet from "./BottomSheet";

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
  hasNext?: boolean;
  hasPrev?: boolean;
  onNext?: () => void;
  onPrev?: () => void;
}

type Language = "VF" | "VOSTFR";

interface ServerObj {
  name: string;
  group: string;
  icon: React.ElementType;
  warningKey?: string;
  url: (type: string, id: string, s?: number, e?: number) => string;
}

const ALTERNATIVE_SERVERS: ServerObj[] = [
  {
    name: "Frembed",
    group: "Alternative",
    icon: Globe,
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie" ? `https://frembed.work/api/film.php?id=${id}` : `https://frembed.work/api/serie.php?id=${id}&sa=${s}&epi=${e}`,
  },
  {
    name: "SuperEmbed",
    group: "Alternative",
    icon: Server,
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie" ? `https://multiembed.mov/?video_id=${id}&tmdb=1` : `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`,
  },
  {
    name: "VidSrc.to",
    group: "Alternative",
    icon: Server,
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie" ? `https://vidsrc.to/embed/movie/${id}` : `https://vidsrc.to/embed/tv/${id}/${s}/${e}`,
  },
  {
    name: "VidSrc.me",
    group: "Alternative",
    icon: Globe,
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie" ? `https://vidsrc.me/embed/movie?tmdb=${id}` : `https://vidsrc.me/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
  },
  {
    name: "2Embed",
    group: "Alternative",
    icon: Globe,
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie" ? `https://www.2embed.cc/embed/${id}` : `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`,
  },
  {
    name: "SmashyStream",
    group: "Alternative",
    icon: Zap,
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie"
        ? `https://player.smashy.stream/movie/${id}`
        : `https://player.smashy.stream/tv/${id}?s=${s}&e=${e}`,
  },
  {
    name: "VidLink",
    group: "Alternative",
    icon: Server,
    warningKey: "disableAdblock",
    url: (type: string, id: string, s?: number, e?: number) =>
      type === "movie" ? `https://vidlink.pro/movie/${id}` : `https://vidlink.pro/tv/${id}/${s}/${e}`,
  },
];

const checkServerHealth = async (url: string): Promise<boolean> => {
  try {
    const cacheKey = `health_${url}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const { status, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < 1000 * 60 * 5) return status;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(`/api/check-server?url=${encodeURIComponent(url)}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (response.ok) {
      const data = await response.json();
      const isHealthy = data.status === 'ok';
      sessionStorage.setItem(cacheKey, JSON.stringify({ status: isHealthy, timestamp: Date.now() }));
      return isHealthy;
    }
    return false;
  } catch (error) {
    return false;
  }
};

const toVoeEmbed = (url: string): string => {
  if (!url) return "";
  if (url.includes('/e/')) return url;
  try {
    const urlObj = new URL(url);
    if (!urlObj.pathname.startsWith('/e/')) {
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      if (pathParts.length > 0 && pathParts[0] !== 'e') {
        urlObj.pathname = '/e/' + pathParts.join('/');
      }
    }
    return urlObj.toString();
  } catch (e) {
    if (url && !url.includes('http')) return `https://voe.sx/e/${url}`;
    return url;
  }
};

const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  id, type, season, episode, genres, title, posterPath, year,
  hasNext, hasPrev, onNext, onPrev
}) => {
  const { t } = useLanguage();
  const os = useDeviceOS();
  
  const [activeLang, setActiveLang] = useState<Language>("VF");
  // Stocke les URLs premium trouvées par langue
  const [premiumUrls, setPremiumUrls] = useState<Record<string, string>>({});
  
  // Le serveur actif peut être "MOVEO PREMIUM" ou un serveur alternatif
  const [activeServerName, setActiveServerName] = useState<string>("Frembed");
  
  const [isChecking, setIsChecking] = useState(true);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [requestStatus, setRequestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [isSourceSheetOpen, setIsSourceSheetOpen] = useState(false);

  const lastSaveTime = useRef(0);

  // 1. Initialisation : Fetch Premium Servers
  useEffect(() => {
    let isMounted = true;
    const fetchPremium = async () => {
      setIsChecking(true);
      try {
        const fetchUrl = type === 'movie' 
          ? `/api/catalogue?tmdb_id=${id}`
          : `/api/catalogue?tmdb_id=${id}&season=${season}&episode=${episode}`;
          
        const res = await fetch(fetchUrl);
        const data = await res.json();
        
        let moveoWorks = false;
        if (data.voe_url && isMounted) {
          const serverLang = data.lang === "VOSTFR" ? "VOSTFR" : "VF";
          const voeUrl = toVoeEmbed(data.voe_url);
          setPremiumUrls(prev => ({ ...prev, [serverLang]: voeUrl }));
          setActiveLang(serverLang);
          
          // Vérifier si Moveo Premium fonctionne (pas d'erreur 404)
          moveoWorks = await checkServerHealth(voeUrl);
          if (moveoWorks && isMounted) {
            setActiveServerName("MOVEO PREMIUM");
          }
        }
        
        if (isMounted && !moveoWorks) {
          // Moveo indisponible ou en erreur 404 → tenter Frembed d'abord
          const frembedServer = ALTERNATIVE_SERVERS.find(s => s.name === "Frembed");
          if (frembedServer) {
            const frembedUrl = frembedServer.url(type, id, season, episode);
            const frembedHealthy = await checkServerHealth(frembedUrl);
            if (frembedHealthy && isMounted) {
              setActiveServerName("Frembed");
            } else if (isMounted) {
              // Frembed en erreur → fallback SuperEmbed
              setActiveServerName("SuperEmbed");
            }
          }
        }
      } catch (error) {
        console.error("Catalogue fetch error", error);
        if (isMounted) setActiveServerName("SuperEmbed");
      } finally {
        if (isMounted) setIsChecking(false);
      }
    };

    fetchPremium();
    return () => { isMounted = false; };
  }, [id, type, season, episode]);

  // 2. Handle Language Change
  const handleLangChange = (lang: Language) => {
    setActiveLang(lang);
    setIframeLoaded(false);
    setRequestStatus('idle');
  };

  // 3. Handle Server Change
  const handleServerChange = (serverName: string) => {
    setActiveServerName(serverName);
    setIframeLoaded(false);
    setRequestStatus('idle');
    localStorage.setItem("preferredServer", serverName);
  };

  // 4. Request Film Logic
  const handleRequestFilm = async () => {
    setRequestStatus('loading');
    try {
      const res = await fetch('/api/film-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tmdb_id: id,
          title: title,
          year: year,
          type: type,
          season: season,
          episode: episode
        })
      });
      
      if (res.ok) {
        setRequestStatus('success');
      } else {
        setRequestStatus('error');
      }
    } catch (error) {
      setRequestStatus('error');
    }
  };

  // 5. Watchdog & History
  useEffect(() => {
    if (activeServerName === "MOVEO PREMIUM" || isChecking || iframeLoaded) return;
    const timeoutId = setTimeout(() => {
      setIsSwitching(true);
      setTimeout(() => {
        const currentIndex = ALTERNATIVE_SERVERS.findIndex(s => s.name === activeServerName);
        const nextServer = ALTERNATIVE_SERVERS[(Math.max(0, currentIndex) + 1) % ALTERNATIVE_SERVERS.length];
        setActiveServerName(nextServer.name);
        setIsSwitching(false);
        setIframeLoaded(false);
      }, 1500);
    }, 30000);
    return () => clearTimeout(timeoutId);
  }, [activeServerName, isChecking, iframeLoaded]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || !title) return;
      
      let currentTime = 0, duration = 0, eventType = "";
      if (event.data.event === "timeupdate" && event.data.data) {
        currentTime = event.data.data.currentTime; duration = event.data.data.duration; eventType = "timeupdate";
      } else if (event.data.type === "MEDIA_DATA" && event.data.data) {
        currentTime = event.data.data.currentTime; duration = event.data.data.duration; eventType = "timeupdate";
      } else if (event.data.type === "timeupdate") {
        currentTime = event.data.currentTime; duration = event.data.duration; eventType = "timeupdate";
      }

      if (eventType === "timeupdate" && duration > 0) {
        const now = Date.now();
        if (now - lastSaveTime.current > 5000) {
          saveWatchHistory({
            id, type, title, poster_path: posterPath || "", season, episode,
            provider: activeServerName, last_watched: now, timestamp: currentTime, duration
          });
          lastSaveTime.current = now;
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [id, type, title, posterPath, season, episode, activeServerName]);

  useEffect(() => {
    const handleFullscreenChange = async () => {
      if (document.fullscreenElement) {
        try {
          const orientation = screen.orientation as any;
          if (orientation && orientation.lock) {
            await orientation.lock('landscape');
          }
        } catch (err) {
          console.log("Orientation lock failed", err);
        }
      } else {
        try {
          const orientation = screen.orientation as any;
          if (orientation && orientation.unlock) {
            orientation.unlock();
          }
        } catch (err) {
          console.log("Orientation unlock failed", err);
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Determine current video URL
  let videoUrl = "";
  let isPremiumAvailable = false;
  
  if (activeServerName === "MOVEO PREMIUM") {
    if (premiumUrls[activeLang]) {
      videoUrl = premiumUrls[activeLang];
      isPremiumAvailable = true;
    }
  } else {
    const altServer = ALTERNATIVE_SERVERS.find(s => s.name === activeServerName);
    if (altServer) {
      videoUrl = altServer.url(type, id, season, episode);
    }
  }

  return (
    <div className="w-full max-w-6xl mx-auto mt-8 mb-16 px-0">
      
      {/* --- MOVEO PLAYER WRAPPER (DARK LUXURY) --- */}
      <div className="relative w-full aspect-video bg-[#030303] rounded-2xl overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.9)] border border-white/10 ring-1 ring-white/5 mb-6 group">
        
        {/* Background Poster Blur (Subtle Luxury Effect) */}
        {posterPath && (
          <div className="absolute inset-0 z-0 pointer-events-none opacity-20 mix-blend-luminosity">
            <Image
              src={`https://image.tmdb.org/t/p/original${posterPath}`}
              alt="Background"
              fill
              unoptimized={true}
              className="object-cover blur-[100px] scale-110"
            />
          </div>
        )}

        <AnimatePresence mode="wait">
          {isChecking ? (
            <motion.div 
              key="checking"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#030303]/80 backdrop-blur-xl text-white"
            >
              <Loader2 className="w-8 h-8 text-white/50 animate-spin mb-6" />
              <h3 className="text-sm font-medium tracking-widest uppercase text-white/70">{t.details.searchingServer || "Initialisation du flux..."}</h3>
            </motion.div>
          ) : isSwitching ? (
            <motion.div 
              key="switching"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#030303]/90 backdrop-blur-xl text-white"
            >
              <Loader2 className="w-8 h-8 text-white/50 animate-spin mb-4" />
              <h3 className="text-sm font-medium tracking-widest uppercase text-white/70">{t.details.slowServerDetected || "Recherche d'une source optimale..."}</h3>
            </motion.div>
          ) : activeServerName === "MOVEO PREMIUM" && !isPremiumAvailable ? (
            <motion.div 
              key="not-available"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#030303]/60 backdrop-blur-2xl text-white p-6 text-center"
            >
              <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(255,255,255,0.03)]">
                <Lock className="w-6 h-6 text-white/50" />
              </div>
              <h3 className="text-xl font-light tracking-tight text-white mb-2">
                {t.interpolate(t.details.encodingTitle, { lang: activeLang }) || "Contenu en cours d'encodage"}
              </h3>
              <p className="text-sm text-white/40 max-w-md mb-8 leading-relaxed">
                {t.details.encodingDesc || "Ce contenu n'est pas encore disponible sur nos serveurs sécurisés Moveo Premium en " + activeLang + ". Vous pouvez demander son encodage prioritaire ou utiliser une source alternative ci-dessous."}
              </p>
              
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleRequestFilm}
                disabled={requestStatus !== 'idle'}
                className={`px-6 py-3 rounded-xl flex items-center gap-3 text-sm font-medium transition-all duration-300 ${
                  requestStatus === 'success' ? 'bg-white/10 text-white border border-white/20' :
                  requestStatus === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                  'bg-white text-black hover:bg-zinc-200 shadow-[0_0_20px_rgba(255,255,255,0.1)]'
                }`}
              >
                {requestStatus === 'idle' && <><Database className="w-4 h-4" /> {t.details.requestEncoding || "Demander l'encodage prioritaire"}</>}
                {requestStatus === 'loading' && <><Loader2 className="w-4 h-4 animate-spin" /> {t.details.sending || "Envoi en cours..."}</>}
                {requestStatus === 'success' && <><CheckCircle2 className="w-4 h-4" /> {t.details.requestSent || "Demande envoyée avec succès"}</>}
                {requestStatus === 'error' && <><AlertCircle className="w-4 h-4" /> {t.details.error || "Une erreur est survenue"}</>}
              </motion.button>
            </motion.div>
          ) : videoUrl ? (
            <motion.div
              key={videoUrl}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}
              className="w-full h-full relative z-10"
            >
              {!iframeLoaded && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#030303]">
                  <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
                </div>
              )}
              <iframe
                src={videoUrl}
                className="w-full h-full relative z-20"
                allowFullScreen
                webkitAllowFullScreen
                mozAllowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture"
                title="Video Player"
                onLoad={() => setIframeLoaded(true)}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* --- NAVIGATION DES ÉPISODES (Séries Uniquement) --- */}
      {type === "tv" && (
        <div className="flex items-center justify-between w-full mb-6 bg-[#141414] p-2 md:p-3 rounded-2xl border border-white/10 shadow-lg">
          <motion.button
            whileHover={hasPrev ? { scale: 1.02, backgroundColor: "rgba(255,255,255,0.1)" } : {}}
            whileTap={hasPrev ? { scale: 0.95 } : {}}
            onClick={hasPrev ? onPrev : undefined}
            disabled={!hasPrev}
            className={`flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all duration-300 ${
              hasPrev ? "bg-white/5 text-white cursor-pointer hover:bg-white/10" : "bg-transparent text-white/20 cursor-not-allowed"
            }`}
          >
            <SkipBack className="w-4 h-4" />
            <span className="hidden sm:inline">{t.details.prevEpisode || "Précédent"}</span>
          </motion.button>
          
          <div className="flex flex-col items-center justify-center px-2 md:px-4">
            <span className="text-[10px] md:text-xs text-white/40 uppercase tracking-widest font-semibold mb-0.5">{t.details.season || "Saison"} {season}</span>
            <span className="text-sm md:text-base text-white font-bold">{t.details.episode || "Épisode"} {episode}</span>
          </div>

          <motion.button
            whileHover={hasNext ? { scale: 1.02, backgroundColor: "rgba(255,255,255,0.1)" } : {}}
            whileTap={hasNext ? { scale: 0.95 } : {}}
            onClick={hasNext ? onNext : undefined}
            disabled={!hasNext}
            className={`flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all duration-300 ${
              hasNext ? "bg-[#E50914]/10 text-[#E50914] cursor-pointer hover:bg-[#E50914]/20" : "bg-transparent text-white/20 cursor-not-allowed"
            }`}
          >
            <span className="hidden sm:inline">{t.details.nextEpisode || "Suivant"}</span>
            <SkipForward className="w-4 h-4" />
          </motion.button>
        </div>
      )}

      {/* --- CONTRÔLES (DARK LUXURY) --- */}
      {/* Mobile Controls Trigger */}
      <div className="lg:hidden w-full mb-4">
        <button
          onClick={() => setIsSourceSheetOpen(true)}
          className="w-full flex items-center justify-between p-4 bg-[#141414] rounded-2xl border border-white/10 shadow-lg group active:scale-[0.98] transition-all"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
              <Settings2 className="w-5 h-5 text-[#E50914]" />
            </div>
            <div className="text-left">
              <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Source & Audio</p>
              <p className="text-sm font-bold text-white flex items-center gap-2">
                {activeServerName} • {activeLang}
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/20 group-hover:text-white/50 transition-colors" />
        </button>
      </div>

      {/* Desktop Controls */}
      <div className={`hidden lg:flex flex-row gap-8 items-start p-0 ${
        os === 'ios' ? 'bg-white/5 backdrop-blur-xl rounded-[32px] border border-white/10' : 
        os === 'android' ? 'bg-[#1a1a1a] rounded-2xl shadow-xl border border-white/5' : 
        ''
      }`}>
        
        {/* Colonne Gauche : Langue & Premium */}
        <div className="w-1/3 flex flex-col gap-8">
          
          {/* Sélecteur de Langue (Segmented Control) */}
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold text-white/30 uppercase tracking-widest ml-1">Audio</h3>
            <div className={`flex p-1 w-fit ${
              os === 'ios' ? 'bg-black/20 rounded-full border border-white/10' :
              os === 'android' ? 'bg-black/40 rounded-lg border border-white/5 shadow-inner' :
              'bg-[#0a0a0a] rounded-xl border border-white/10 shadow-inner'
            }`}>
              {(["VF", "VOSTFR"] as Language[]).map((lang) => {
                const isActive = activeLang === lang;
                return (
                  <button
                    key={lang}
                    onClick={() => handleLangChange(lang)}
                    className={`relative px-8 py-2.5 text-xs font-bold transition-all duration-300 z-10 ${
                      os === 'ios' ? 'rounded-full' :
                      os === 'android' ? 'rounded-md' :
                      'rounded-lg'
                    } ${
                      isActive ? "text-white" : "text-white/40 hover:text-white/70"
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeLangBg"
                        className={`absolute inset-0 bg-white/10 border border-white/5 shadow-[0_2px_10px_rgba(0,0,0,0.2)] ${
                          os === 'ios' ? 'rounded-full' :
                          os === 'android' ? 'rounded-md' :
                          'rounded-lg'
                        }`}
                        initial={false}
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span className="relative z-20 flex items-center gap-2">
                      {lang}
                      {premiumUrls[lang] && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Serveur Premium */}
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold text-white/30 uppercase tracking-widest ml-1">Source Principale</h3>
            <button
              onClick={() => handleServerChange("MOVEO PREMIUM")}
              className={`relative w-full p-4 text-left overflow-hidden transition-all duration-500 border ${
                os === 'ios' ? 'rounded-[24px]' : os === 'android' ? 'rounded-xl' : 'rounded-xl'
              } ${
                activeServerName === "MOVEO PREMIUM" 
                  ? "bg-white/5 border-white/20 shadow-[0_0_30px_rgba(255,255,255,0.03)]" 
                  : "bg-black/20 border-white/5 hover:bg-white/5"
              }`}
            >
              <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg flex items-center justify-center ${activeServerName === "MOVEO PREMIUM" ? "bg-white/10" : "bg-white/5"}`}>
                    <Image 
                      src="/favicon.png" 
                      alt="Moveo" 
                      width={20} 
                      height={20} 
                      unoptimized={true} 
                      className={`w-5 h-5 object-contain transition-opacity duration-300 ${activeServerName === "MOVEO PREMIUM" ? "opacity-100" : "opacity-50"}`}
                    />
                  </div>
                  <div>
                    <h4 className={`font-medium text-sm flex items-center gap-2 ${activeServerName === "MOVEO PREMIUM" ? "text-white" : "text-white/60"}`}>
                      MOVEO PREMIUM
                    </h4>
                    <p className="text-xs text-white/40 mt-0.5">Réseau Sécurisé Privé</p>
                  </div>
                </div>
                {activeServerName === "MOVEO PREMIUM" && <CheckCircle2 className="w-4 h-4 text-white/50" />}
              </div>
            </button>
          </div>
        </div>

        {/* Colonne Droite : Serveurs Alternatifs */}
        <div className="w-2/3 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-white/30 uppercase tracking-widest ml-1">Sources Alternatives</h3>
            {videoUrl && (
              <a
                href={videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/5 text-xs font-medium text-white/40 hover:text-white/80 transition-all group"
              >
                <span>{t.details.openInNewTab || "Ouvrir"}</span>
                <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </a>
            )}
          </div>
          
          <div className={`border border-white/5 p-2 flex flex-wrap gap-2 ${
            os === 'ios' ? 'bg-black/20 rounded-[24px]' : os === 'android' ? 'bg-black/40 rounded-xl' : 'bg-[#0a0a0a] rounded-xl'
          }`}>
            {ALTERNATIVE_SERVERS.map((server) => {
              const isActive = activeServerName === server.name;
              const Icon = server.icon;
              return (
                <button
                  key={server.name}
                  onClick={() => handleServerChange(server.name)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all duration-300 ${
                    os === 'ios' ? 'rounded-full' : 'rounded-lg'
                  } ${
                    isActive 
                      ? "bg-white/10 text-white shadow-sm ring-1 ring-white/10" 
                      : "bg-transparent text-white/40 hover:bg-white/5 hover:text-white/70"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-white/30"}`} />
                  {server.name}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-white/20 px-2 mt-2 uppercase tracking-wider">
            Les sources alternatives proviennent de serveurs tiers publics.
          </p>
        </div>
      </div>

      {/* Mobile Bottom Sheet for Sources */}
      <BottomSheet
        isOpen={isSourceSheetOpen}
        onClose={() => setIsSourceSheetOpen(false)}
        title="Source & Audio"
      >
        <div className="flex flex-col gap-8">
          {/* Audio Selection */}
          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-bold text-white/40 uppercase tracking-widest">Langue Audio</h3>
            <div className="grid grid-cols-2 gap-3">
              {(["VF", "VOSTFR"] as Language[]).map((lang) => {
                const isActive = activeLang === lang;
                return (
                  <button
                    key={lang}
                    onClick={() => handleLangChange(lang)}
                    className={`flex items-center justify-center gap-3 p-4 rounded-2xl border transition-all ${
                      isActive 
                        ? "bg-[#E50914] border-[#E50914] text-white shadow-lg shadow-red-900/20" 
                        : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                    }`}
                  >
                    <Globe className="w-4 h-4" />
                    <span className="font-bold">{lang}</span>
                    {premiumUrls[lang] && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Premium Source */}
          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-bold text-white/40 uppercase tracking-widest">Source Principale</h3>
            <button
              onClick={() => {
                handleServerChange("MOVEO PREMIUM");
                setIsSourceSheetOpen(false);
              }}
              className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                activeServerName === "MOVEO PREMIUM"
                  ? "bg-white/10 border-white/20 shadow-lg"
                  : "bg-white/5 border-white/10"
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
                  <Image src="/favicon.png" alt="Moveo" width={24} height={24} unoptimized={true} />
                </div>
                <div className="text-left">
                  <h4 className="font-bold text-white">MOVEO PREMIUM</h4>
                  <p className="text-xs text-white/40">Réseau Privé Haute Qualité</p>
                </div>
              </div>
              {activeServerName === "MOVEO PREMIUM" && <CheckCircle2 className="w-5 h-5 text-[#E50914]" />}
            </button>
          </div>

          {/* Alternative Sources */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white/40 uppercase tracking-widest">Sources Alternatives</h3>
              {videoUrl && (
                <a
                  href={videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-[#E50914] flex items-center gap-1"
                >
                  Ouvrir externe <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {ALTERNATIVE_SERVERS.map((server) => {
                const isActive = activeServerName === server.name;
                const Icon = server.icon;
                return (
                  <button
                    key={server.name}
                    onClick={() => {
                      handleServerChange(server.name);
                      setIsSourceSheetOpen(false);
                    }}
                    className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${
                      isActive 
                        ? "bg-white/10 border-white/20 shadow-lg" 
                        : "bg-white/5 border-white/10 text-white/60"
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? "text-[#E50914]" : ""}`} />
                    <span className="font-bold text-sm">{server.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-[10px] text-white/20 text-center uppercase tracking-widest leading-relaxed">
            Les sources alternatives proviennent de serveurs tiers publics.
            Certaines peuvent contenir des publicités.
          </p>
        </div>
      </BottomSheet>
    </div>
  );
};

export default VideoPlayer;
