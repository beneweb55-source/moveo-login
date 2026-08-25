"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchDataFromApi } from "@/utils/api";
import ContentWrapper from "@/components/ContentWrapper";
import VideoPlayer from "@/components/VideoPlayer";
import ActionButtons from "@/components/ActionButtons";
import CastList from "@/components/CastList";
import BottomSheet from "@/components/BottomSheet";
import { Star, ArrowLeft, Calendar, Layers, Play, Info, ChevronDown, Tv, RefreshCw, X, Film, Loader2, Plus, Check } from "lucide-react";
import Image from "next/image";
import { motion, useScroll, useTransform, AnimatePresence } from "motion/react";
import Carousel from "@/components/Carousel";

import { useLanguage } from "@/context/LanguageContext";
import WatchTimer from "@/components/WatchTimer";

export default function TvDetails() {
  const { id } = useParams();
  const router = useRouter();
  const { language, t } = useLanguage();
  const langParam = language === "fr" ? "fr-FR" : "en-US";
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [playerKey, setPlayerKey] = useState(0);
  const playerRef = useRef<HTMLDivElement>(null);
  const [showTrailer, setShowTrailer] = useState(false);
  
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [selectedEpisode, setSelectedEpisode] = useState(1);
  const [episodesCount, setEpisodesCount] = useState(1);
  const [episodesData, setEpisodesData] = useState<any[]>([]);
  const [isEpisodeDropdownOpen, setIsEpisodeDropdownOpen] = useState(false);
  const [isSeasonDropdownOpen, setIsSeasonDropdownOpen] = useState(false);
  const episodeDropdownRef = useRef<HTMLDivElement>(null);
  const seasonDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (episodeDropdownRef.current && !episodeDropdownRef.current.contains(event.target as Node)) {
        setIsEpisodeDropdownOpen(false);
      }
      if (seasonDropdownRef.current && !seasonDropdownRef.current.contains(event.target as Node)) {
        setIsSeasonDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 500], [0, 200]);

  useEffect(() => {
    if (data?.name) {
      document.title = `${data.name} - Moveo`;
    } else {
      document.title = 'Moveo';
    }

    return () => {
      document.title = 'Moveo';
    };
  }, [data]);

  useEffect(() => {
    if (data?.name && selectedSeason !== undefined && selectedEpisode !== undefined) {
      document.title = `${data.name} S${selectedSeason}E${selectedEpisode} - Moveo`;
    }
  }, [data, selectedSeason, selectedEpisode]);

  useEffect(() => {
    const fetchDetails = async () => {
      setLoading(true);
      try {
        const res = await fetchDataFromApi(`/tv/${id}`, { 
          language: langParam,
          append_to_response: "videos,credits,recommendations"
        });
        setData(res);
        
        const firstSeason = res.seasons?.find((s: any) => s.season_number === 1) || res.seasons?.[0];
        if (firstSeason) {
          setSelectedSeason(firstSeason.season_number);
          setEpisodesCount(firstSeason.episode_count);
        }
      } catch (error) {
        console.error("Error fetching details:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [id, langParam]);

  const [isFetchingSeason, setIsFetchingSeason] = useState(false);

  useEffect(() => {
    if (!data || selectedSeason === undefined) return;
    
    const fetchSeasonDetails = async () => {
      setIsFetchingSeason(true);
      // Clear episodes data while fetching to prevent showing old episodes
      setEpisodesData([]);
      try {
        const res = await fetchDataFromApi(`/tv/${id}/season/${selectedSeason}`, { language: langParam });
        if (res && res.episodes) {
          const sortedEpisodes = [...res.episodes].sort((a: any, b: any) => a.episode_number - b.episode_number);
          setEpisodesCount(sortedEpisodes.length);
          setEpisodesData(sortedEpisodes);
        }
      } catch (error) {
        console.error("Error fetching season details:", error);
        const seasonInfo = data.seasons?.find((s: any) => s.season_number === selectedSeason);
        if (seasonInfo) {
          setEpisodesCount(seasonInfo.episode_count);
          setEpisodesData([]);
        }
      } finally {
        setIsFetchingSeason(false);
      }
    };
    
    fetchSeasonDetails();
  }, [selectedSeason, id, data, langParam]);

  const scrollToPlayer = () => {
    playerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleHardRefresh = () => {
    setPlayerKey(prev => prev + 1);
  };

  if (loading) {
    return (
      <div className="w-full h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#E50914] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data || data.error) {
    return (
      <div className="w-full h-screen bg-[#0A0A0A] flex flex-col items-center justify-center text-white">
        <h1 className="text-4xl font-bold mb-4">Contenu indisponible</h1>
        <p className="text-white/60 mb-8">Ce contenu a été retiré ou n&apos;existe pas.</p>
        <button onClick={() => router.push('/')} className="px-6 py-3 bg-[#E50914] rounded-full font-bold hover:bg-red-700 transition-colors">
          Retour à l&apos;accueil
        </button>
      </div>
    );
  }

  const backdropUrl = data?.backdrop_path 
    ? `https://image.tmdb.org/t/p/original${data.backdrop_path}`
    : "https://picsum.photos/seed/backdrop/1920/1080";
    
  const posterUrl = data?.poster_path
    ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
    : null;

  const releaseDate = data?.first_air_date;
  const year = releaseDate ? new Date(releaseDate).getFullYear() : "";
  const rating = data?.vote_average ? data.vote_average.toFixed(1) : "NR";
  const seasonsCount = data?.number_of_seasons || 0;

  const availableSeasons = [...(data?.seasons || [])].sort((a: any, b: any) => a.season_number - b.season_number);

  const cast = data?.credits?.cast?.slice(0, 10) || [];
  
  const videos = data?.videos?.results || [];
  const trailer = videos.find((v: any) => v.type === "Trailer" && v.site === "YouTube") 
    || videos.find((v: any) => v.type === "Teaser" && v.site === "YouTube");

  const recommendations = data?.recommendations?.results?.slice(0, 10) || [];

  const currentSeasonIndex = availableSeasons.findIndex((s: any) => s.season_number === selectedSeason);
  const hasPrev = selectedEpisode > 1 || currentSeasonIndex > 0;
  const hasNext = selectedEpisode < episodesCount || currentSeasonIndex < availableSeasons.length - 1;

  const handlePrev = () => {
    if (selectedEpisode > 1) {
      setSelectedEpisode(selectedEpisode - 1);
    } else if (currentSeasonIndex > 0) {
      const prevSeason = availableSeasons[currentSeasonIndex - 1];
      setSelectedSeason(prevSeason.season_number);
      setSelectedEpisode(prevSeason.episode_count);
    }
  };

  const handleNext = () => {
    if (selectedEpisode < episodesCount) {
      setSelectedEpisode(selectedEpisode + 1);
    } else if (currentSeasonIndex < availableSeasons.length - 1) {
      const nextSeason = availableSeasons[currentSeasonIndex + 1];
      setSelectedSeason(nextSeason.season_number);
      setSelectedEpisode(1);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-[#E50914] selection:text-white pb-20 overflow-x-hidden">
      <WatchTimer mediaType="tv" mediaId={id as string} />
      {/* Navigation */}
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-24 left-4 md:left-8 z-40"
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 bg-black/50 hover:bg-[#E50914] text-white px-4 py-2 rounded-full backdrop-blur-md border border-white/10 transition-all duration-300 group shadow-lg"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span className="font-medium hidden sm:inline">{t.details.back}</span>
        </button>
      </motion.nav>

      {/* Hero Section */}
      <div className="relative w-full min-h-[60vh] md:min-h-[70vh] xl:min-h-[85vh] flex items-start pt-20 pb-12 xl:items-start xl:pt-32 xl:pb-12">
        {/* Parallax Backdrop */}
        <div className="absolute inset-0 overflow-hidden">
            <motion.div style={{ y }} className="relative w-full h-[120%] -top-[10%]">
                <Image
                    src={backdropUrl}
                    alt="Backdrop"
                    fill
                    className="object-cover opacity-40 blur-[2px]"
                    priority
                    referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent" />
            </motion.div>
        </div>

        <ContentWrapper>
            <div className="relative z-10 grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-8 xl:gap-16 items-start mt-16 xl:mt-0 px-4 sm:px-0">
                {/* Poster - Hidden on mobile/tablet, visible on xl */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                    className="hidden xl:block relative aspect-[2/3] rounded-[2.5rem] overflow-hidden shadow-[0_40px_80px_-15px_rgba(0,0,0,0.8)] border border-white/10 group"
                >
                     {posterUrl ? (
                        <Image
                            src={posterUrl}
                            alt={data?.name}
                            fill
                            className="object-cover transition-transform duration-1000 group-hover:scale-110"
                            referrerPolicy="no-referrer"
                        />
                    ) : (
                        <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                            <Film className="w-20 h-20 text-white/20" />
                        </div>
                    )}
                </motion.div>

                {/* Info */}
                <div className="flex flex-col gap-6 md:gap-10 min-w-0">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    >
                        {/* Badges */}
                        <div className="flex flex-wrap items-center gap-3 md:gap-4 mb-6 md:mb-8">
                            {data?.status && (
                                <span className="px-4 py-1.5 md:px-6 md:py-2 text-[10px] md:text-xs font-black uppercase tracking-[0.2em] bg-[#E50914] text-white rounded-full shadow-2xl shadow-red-900/40">
                                    {data.status}
                                </span>
                            )}
                            {data?.genres?.map((g: any) => (
                                <span key={g.id} className="px-4 py-1.5 md:px-6 md:py-2 text-[10px] md:text-xs font-bold uppercase tracking-widest bg-white/5 backdrop-blur-2xl border border-white/10 rounded-full text-white/80">
                                    {g.name}
                                </span>
                            ))}
                        </div>

                        <h1 className="text-4xl md:text-5xl xl:text-7xl font-black tracking-tighter leading-[1.1] mb-6 md:mb-10 drop-shadow-2xl break-words">
                            {data?.name}
                        </h1>

                        {data?.tagline && (
                            <p className="text-lg md:text-xl xl:text-2xl text-white/50 italic font-serif mb-8 md:mb-12 leading-relaxed max-w-4xl">
                                &ldquo;{data.tagline}&rdquo;
                            </p>
                        )}

                        <div className="flex flex-wrap items-center gap-4 md:gap-8 text-xs md:text-sm xl:text-lg font-black text-white/60 mb-10 md:mb-16">
                            <div className="flex items-center gap-2 md:gap-3 bg-white/5 px-4 py-2 rounded-2xl border border-white/10 backdrop-blur-2xl">
                                <Star className="w-4 h-4 md:w-5 md:h-5 text-yellow-500 fill-yellow-500" />
                                <span className="text-white">{rating}</span>
                            </div>
                            <div className="flex items-center gap-2 md:gap-3">
                                <Calendar className="w-4 h-4 md:w-5 md:h-5 text-[#E50914]" />
                                <span className="tracking-widest">{year}</span>
                            </div>
                            {data?.number_of_seasons && (
                                <div className="flex items-center gap-2 md:gap-3">
                                    <Layers className="w-4 h-4 md:w-5 md:h-5 text-[#E50914]" />
                                    <span className="tracking-widest capitalize">{data.number_of_seasons} {t.details.season}{data.number_of_seasons > 1 ? 's' : ''}</span>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col sm:flex-row flex-wrap items-center gap-4 md:gap-6 mb-12 md:mb-20">
                            <button
                                onClick={scrollToPlayer}
                                className="w-full sm:w-auto flex items-center justify-center gap-4 bg-white text-black hover:bg-zinc-200 px-8 py-3 md:py-4 rounded-full font-black transition-all duration-500 shadow-2xl hover:scale-105 active:scale-95 group cursor-pointer"
                            >
                                <Play className="w-5 h-5 fill-current" />
                                <span className="uppercase tracking-widest text-sm md:text-base">{t.details.watch}</span>
                            </button>

                            {trailer && (
                                <button
                                    onClick={() => setShowTrailer(true)}
                                    className="w-full sm:w-auto flex items-center justify-center gap-4 bg-transparent hover:bg-white/10 border-2 border-white/20 text-white px-8 py-3 md:py-4 rounded-full font-black transition-all duration-500 shadow-2xl hover:border-white hover:scale-105 active:scale-95 group"
                                >
                                    <Play className="w-5 h-5" />
                                    <span className="uppercase tracking-widest text-sm md:text-base">{t.details.watchTrailer}</span>
                                </button>
                            )}

                            <ActionButtons
                                id={id as string}
                                type="tv"
                                title={data?.name}
                                posterPath={data?.poster_path}
                            />
                        </div>

                        {/* Synopsis */}
                        <div className="max-w-4xl mb-12 md:mb-16 xl:mb-20">
                            <h3 className="text-xl md:text-2xl font-black mb-4 md:mb-6 flex items-center gap-3 uppercase tracking-tighter">
                                <span className="w-1 h-6 md:h-8 bg-[#E50914] rounded-full" />
                                {t.details.synopsis}
                            </h3>
                            <p className="text-base md:text-lg xl:text-xl text-white/70 leading-relaxed font-medium">
                                {data?.overview}
                            </p>
                        </div>
                        
                        {/* Cast */}
                        <div className="mb-12 md:mb-20">
                            <CastList cast={data?.credits?.cast || []} />
                        </div>
                    </motion.div>
                </div>
            </div>
        </ContentWrapper>
      </div>

      {/* Player Section */}
      <div ref={playerRef} className="relative z-20 bg-[#0A0A0A]">
        <ContentWrapper>
            <div className="py-20 border-t border-white/5 mt-10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-1 h-8 bg-[#E50914] rounded-full" />
                        <h2 className="text-3xl font-bold">{t.details.nowPlaying}</h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                        <button 
                            onClick={handleHardRefresh}
                            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-full text-xs font-medium transition-all duration-300 border border-white/5 hover:border-white/20 group cursor-pointer"
                            title={t.details.reloadPlayer}
                        >
                            <RefreshCw className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-500" />
                            <span>{t.details.reload}</span>
                        </button>

                        {/* Selectors */}
                        <div className="flex flex-wrap gap-4">
                            {/* Season Selector */}
                            <div className="relative group" ref={seasonDropdownRef}>
                                <button
                                    onClick={() => {
                                        setIsSeasonDropdownOpen(!isSeasonDropdownOpen);
                                        setIsEpisodeDropdownOpen(false);
                                    }}
                                    className="flex items-center justify-between bg-[#1a1a1a] hover:bg-[#252525] border border-white/10 text-white pl-5 pr-4 py-3 rounded-xl outline-none cursor-pointer font-medium transition-all focus:border-[#E50914] min-w-[160px]"
                                >
                                    <span>{t.details.season} {selectedSeason}</span>
                                    <ChevronDown className={`w-4 h-4 text-white/50 transition-transform ${isSeasonDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {/* Desktop Season Dropdown */}
                                <AnimatePresence>
                                    {isSeasonDropdownOpen && (
                                        <motion.div 
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 10 }}
                                            className="hidden lg:block absolute left-0 top-full mt-2 w-full min-w-[160px] max-h-[60vh] overflow-y-auto bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl z-50 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/20"
                                        >
                                            {availableSeasons.map((season: any) => (
                                                <div
                                                    key={season.id}
                                                    onClick={() => {
                                                        setSelectedSeason(season.season_number);
                                                        setSelectedEpisode(1);
                                                        setIsSeasonDropdownOpen(false);
                                                    }}
                                                    className={`p-3 cursor-pointer transition-colors ${
                                                        selectedSeason === season.season_number 
                                                            ? 'bg-[#E50914]/20 border-l-2 border-[#E50914]' 
                                                            : 'hover:bg-white/5 border-l-2 border-transparent'
                                                    }`}
                                                >
                                                    <span className="text-sm font-medium">
                                                        {season.season_number === 0 ? (t.details.specials || "Hors-série") : `${t.details.season} ${season.season_number}`}
                                                    </span>
                                                </div>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Episode Selector */}
                            <div className="relative group" ref={episodeDropdownRef}>
                                <button
                                    onClick={() => {
                                        setIsEpisodeDropdownOpen(!isEpisodeDropdownOpen);
                                        setIsSeasonDropdownOpen(false);
                                    }}
                                    className="flex items-center justify-between bg-[#1a1a1a] hover:bg-[#252525] border border-white/10 text-white pl-5 pr-4 py-3 rounded-xl outline-none cursor-pointer font-medium transition-all focus:border-[#E50914] min-w-[160px] md:min-w-[200px]"
                                >
                                    <span>{t.details.episode} {selectedEpisode}</span>
                                    <ChevronDown className={`w-4 h-4 text-white/50 transition-transform ${isEpisodeDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {/* Desktop Episode Dropdown */}
                                <AnimatePresence>
                                    {isEpisodeDropdownOpen && (
                                        <motion.div 
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 10 }}
                                            className="hidden lg:block absolute left-0 top-full mt-2 w-[400px] max-h-[60vh] overflow-y-auto bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl z-50 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/20"
                                        >
                                            {isFetchingSeason ? (
                                                <div className="flex justify-center p-4">
                                                    <Loader2 className="w-6 h-6 animate-spin text-white/50" />
                                                </div>
                                            ) : episodesData.length > 0 ? (
                                                episodesData.map((ep: any) => (
                                                    <div
                                                        key={ep.id}
                                                        onClick={() => {
                                                            setSelectedEpisode(ep.episode_number);
                                                            setIsEpisodeDropdownOpen(false);
                                                        }}
                                                        className={`flex gap-3 p-3 cursor-pointer transition-colors ${
                                                            selectedEpisode === ep.episode_number 
                                                                ? 'bg-[#E50914]/20 border-l-2 border-[#E50914]' 
                                                                : 'hover:bg-white/5 border-l-2 border-transparent'
                                                        }`}
                                                    >
                                                        <div className="relative w-24 h-16 flex-shrink-0 rounded-md overflow-hidden bg-zinc-800">
                                                            {ep.still_path ? (
                                                                <Image
                                                                    src={`https://image.tmdb.org/t/p/w300${ep.still_path}`}
                                                                    alt={ep.name}
                                                                    fill
                                                                    className="object-cover"
                                                                    referrerPolicy="no-referrer"
                                                                />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-zinc-600">
                                                                    <Play className="w-6 h-6" />
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <h4 className="text-sm font-semibold text-white truncate">
                                                                {ep.episode_number}. {ep.name}
                                                            </h4>
                                                            <p className="text-xs text-zinc-400 line-clamp-2 mt-1">
                                                                {ep.overview || "Aucune description disponible."}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                Array.from({ length: episodesCount }, (_, i) => i + 1).map((ep) => (
                                                    <div
                                                        key={ep}
                                                        onClick={() => {
                                                            setSelectedEpisode(ep);
                                                            setIsEpisodeDropdownOpen(false);
                                                        }}
                                                        className={`p-3 cursor-pointer transition-colors ${
                                                            selectedEpisode === ep 
                                                                ? 'bg-[#E50914]/20 border-l-2 border-[#E50914]' 
                                                                : 'hover:bg-white/5 border-l-2 border-transparent'
                                                        }`}
                                                    >
                                                        <span className="text-sm font-medium">{t.details.episode} {ep}</span>
                                                    </div>
                                                ))
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* Mobile Bottom Sheets */}
                        <BottomSheet
                            isOpen={isSeasonDropdownOpen}
                            onClose={() => setIsSeasonDropdownOpen(false)}
                            title={`${t.details.season}s`}
                        >
                            <div className="flex flex-col gap-2">
                                {availableSeasons.map((season: any) => (
                                    <button
                                        key={season.id}
                                        onClick={() => {
                                            setSelectedSeason(season.season_number);
                                            setSelectedEpisode(1);
                                            setIsSeasonDropdownOpen(false);
                                        }}
                                        className={`w-full p-4 rounded-xl text-left transition-all ${
                                            selectedSeason === season.season_number 
                                                ? 'bg-[#E50914]/20 border border-[#E50914]/50 text-white' 
                                                : 'bg-white/5 border border-transparent text-white/60 hover:bg-white/10'
                                        }`}
                                    >
                                        <span className="text-base font-bold">
                                            {season.season_number === 0 ? (t.details.specials || "Hors-série") : `${t.details.season} ${season.season_number}`}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </BottomSheet>

                        <BottomSheet
                            isOpen={isEpisodeDropdownOpen}
                            onClose={() => setIsEpisodeDropdownOpen(false)}
                            title={`${t.details.episode}s`}
                        >
                            <div className="flex flex-col gap-3">
                                {isFetchingSeason ? (
                                    <div className="flex justify-center p-4">
                                        <Loader2 className="w-6 h-6 animate-spin text-white/50" />
                                    </div>
                                ) : episodesData.length > 0 ? (
                                    episodesData.map((ep: any) => (
                                        <button
                                            key={ep.id}
                                            onClick={() => {
                                                setSelectedEpisode(ep.episode_number);
                                                setIsEpisodeDropdownOpen(false);
                                            }}
                                            className={`flex gap-4 p-3 rounded-xl text-left transition-all ${
                                                selectedEpisode === ep.episode_number 
                                                    ? 'bg-[#E50914]/20 border border-[#E50914]/50' 
                                                    : 'bg-white/5 border border-transparent hover:bg-white/10'
                                            }`}
                                        >
                                            <div className="relative w-28 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-zinc-800">
                                                {ep.still_path ? (
                                                    <Image
                                                        src={`https://image.tmdb.org/t/p/w300${ep.still_path}`}
                                                        alt={ep.name}
                                                        fill
                                                        className="object-cover"
                                                        referrerPolicy="no-referrer"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-zinc-600">
                                                        <Play className="w-6 h-6" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                <h4 className="text-sm font-bold text-white truncate">
                                                    {ep.episode_number}. {ep.name}
                                                </h4>
                                                <p className="text-xs text-zinc-400 line-clamp-2 mt-1">
                                                    {ep.overview || "Aucune description disponible."}
                                                </p>
                                            </div>
                                        </button>
                                    ))
                                ) : (
                                    Array.from({ length: episodesCount }, (_, i) => i + 1).map((ep) => (
                                        <button
                                            key={ep}
                                            onClick={() => {
                                                setSelectedEpisode(ep);
                                                setIsEpisodeDropdownOpen(false);
                                            }}
                                            className={`w-full p-4 rounded-xl text-left transition-all ${
                                                selectedEpisode === ep 
                                                    ? 'bg-[#E50914]/20 border border-[#E50914]/50 text-white' 
                                                    : 'bg-white/5 border border-transparent text-white/60 hover:bg-white/10'
                                            }`}
                                        >
                                            <span className="text-base font-bold">{t.details.episode} {ep}</span>
                                        </button>
                                    ))
                                )}
                            </div>
                        </BottomSheet>
                    </div>
                </div>

                <div className="bg-[#141414] rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                    <VideoPlayer 
                        key={playerKey}
                        id={id as string} 
                        type="tv" 
                        season={selectedSeason} 
                        episode={selectedEpisode}
                        title={data?.name}
                        originalTitle={data?.original_name}
                        year={year ? String(year) : undefined}
                        genres={data?.genres}
                        posterPath={data?.poster_path}
                        hasNext={hasNext}
                        hasPrev={hasPrev}
                        onNext={handleNext}
                        onPrev={handlePrev}
                    />
                </div>
            </div>
        </ContentWrapper>
      </div>

      {/* Recommendations Section */}
      {recommendations.length > 0 && (
        <div className="relative z-20 bg-[#0A0A0A] pb-10">
          <ContentWrapper>
            <Carousel 
              data={recommendations} 
              loading={false} 
              endpoint="tv" 
              title={t.home.youMightLike || "You might also like"} 
            />
          </ContentWrapper>
        </div>
      )}

      {/* Trailer Modal */}
      {/* Trailer Modal */}
      <AnimatePresence>
        {showTrailer && trailer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
            onClick={() => setShowTrailer(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-5xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button 
                onClick={() => setShowTrailer(false)}
                className="absolute top-4 right-4 z-10 p-2 bg-black/50 hover:bg-[#E50914] text-white rounded-full transition-colors duration-300"
              >
                <X className="w-6 h-6" />
              </button>
              <iframe
                src={`https://www.youtube.com/embed/${trailer.key}?autoplay=1`}
                title="Trailer"
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
