"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchDataFromApi } from "@/utils/api";
import ContentWrapper from "@/components/ContentWrapper";
import VideoPlayer from "@/components/VideoPlayer";
import ActionButtons from "@/components/ActionButtons";
import CastList from "@/components/CastList";
import { Star, ArrowLeft, Calendar, Layers, Play, Info, ChevronDown, Tv, RefreshCw, X } from "lucide-react";
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

  useEffect(() => {
    if (!data || selectedSeason === undefined) return;
    
    const fetchSeasonDetails = async () => {
      try {
        const res = await fetchDataFromApi(`/tv/${id}/season/${selectedSeason}`, { language: langParam });
        if (res && res.episodes) {
          setEpisodesCount(res.episodes.length);
          setEpisodesData(res.episodes);
          setSelectedEpisode(1);
        }
      } catch (error) {
        console.error("Error fetching season details:", error);
        const seasonInfo = data.seasons?.find((s: any) => s.season_number === selectedSeason);
        if (seasonInfo) {
          setEpisodesCount(seasonInfo.episode_count);
          setEpisodesData([]);
          setSelectedEpisode(1);
        }
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

  const availableSeasons = data?.seasons?.filter((s: any) => s.season_number > 0) || [];

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
    <div className="min-h-screen bg-[#0A0A0A] text-white font-sans selection:bg-[#E50914] selection:text-white pb-20">
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
      <div className="relative w-full min-h-[60vh] md:min-h-[80vh] flex items-start pt-20 pb-12 lg:items-start lg:pt-32 lg:pb-12">
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
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/60 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0A] via-[#0A0A0A]/40 to-transparent" />
            </motion.div>
        </div>

        <ContentWrapper>
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[350px_1fr] gap-6 lg:gap-12 items-start mt-12 lg:mt-0">
                {/* Poster - Hidden on mobile, visible on lg */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8 }}
                    className="hidden lg:block relative aspect-[2/3] rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 group lg:sticky lg:top-32"
                >
                     {posterUrl ? (
                        <Image
                            src={posterUrl}
                            alt={data?.name}
                            fill
                            className="object-cover transition-transform duration-700 group-hover:scale-105"
                            referrerPolicy="no-referrer"
                        />
                    ) : (
                        <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                            <Tv className="w-16 h-16 text-white/20" />
                        </div>
                    )}
                </motion.div>

                {/* Info */}
                <div className="flex flex-col gap-4 md:gap-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                    >
                        {/* Badges */}
                        <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-3 md:mb-4">
                            {data?.status && (
                                <span className="px-2 py-0.5 md:px-3 md:py-1 text-[9px] md:text-xs font-bold uppercase tracking-wider bg-[#E50914] text-white rounded-full shadow-lg shadow-red-900/20">
                                    {data.status}
                                </span>
                            )}
                            {data?.genres?.map((g: any) => (
                                <span key={g.id} className="px-2 py-0.5 md:px-3 md:py-1 text-[9px] md:text-xs font-medium uppercase tracking-wider bg-white/10 backdrop-blur-md border border-white/10 rounded-full">
                                    {g.name}
                                </span>
                            ))}
                        </div>

                        <h1 className="text-3xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[1.1] mb-2 md:mb-4">
                            {data?.name}
                        </h1>

                        {data?.tagline && (
                            <p className="text-sm md:text-xl text-white/60 italic font-serif mb-4 md:mb-6">
                                &ldquo;{data.tagline}&rdquo;
                            </p>
                        )}

                        <div className="flex flex-wrap items-center gap-3 md:gap-6 text-[10px] md:text-base font-medium text-white/80 mb-6 md:mb-8">
                            <div className="flex items-center gap-1.5 md:gap-2 bg-black/30 px-2 py-0.5 md:px-3 md:py-1.5 rounded-full border border-white/10 backdrop-blur-sm">
                                <Star className="w-3 h-3 md:w-4 md:h-4 text-yellow-500 fill-yellow-500" />
                                <span className="text-white">{rating}</span>
                            </div>
                            <div className="flex items-center gap-1.5 md:gap-2">
                                <Calendar className="w-3 h-3 md:w-4 md:h-4 text-[#E50914]" />
                                <span>{year}</span>
                            </div>
                            {data?.number_of_seasons && (
                                <div className="flex items-center gap-1.5 md:gap-2">
                                    <Layers className="w-3 h-3 md:w-4 md:h-4 text-[#E50914]" />
                                    <span>{data.number_of_seasons} {t.details.season}{data.number_of_seasons > 1 ? 's' : ''}</span>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col sm:flex-row items-center gap-3 md:gap-4 mb-8">
                            <button
                                onClick={scrollToPlayer}
                                className="w-full sm:w-auto flex items-center justify-center gap-3 bg-[#E50914] hover:bg-red-700 text-white px-8 py-3 md:py-4 rounded-full font-bold transition-all duration-300 shadow-lg shadow-red-900/30 hover:shadow-red-900/50 hover:scale-105 group cursor-pointer"
                            >
                                <Play className="w-5 h-5 fill-current" />
                                <span>{t.details.watch}</span>
                            </button>

                            {trailer && (
                                <button
                                    onClick={() => setShowTrailer(true)}
                                    className="w-full sm:w-auto flex items-center justify-center gap-3 bg-transparent hover:bg-[#E50914] border border-white text-white px-8 py-3 md:py-4 rounded-full font-bold transition-all duration-300 shadow-lg hover:border-transparent hover:shadow-red-900/50 hover:scale-105 group"
                                >
                                    <Play className="w-5 h-5" />
                                    <span>{t.details.watchTrailer}</span>
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
                        <div className="max-w-3xl mb-8">
                            <h3 className="text-base md:text-lg font-bold mb-2 flex items-center gap-2">
                                {t.details.synopsis}
                            </h3>
                            <p className="text-sm md:text-lg text-white/70 leading-relaxed line-clamp-4 md:line-clamp-none">
                                {data?.overview}
                            </p>
                        </div>
                        
                        {/* Cast */}
                        <CastList cast={data?.credits?.cast || []} />
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

                                {isSeasonDropdownOpen && (
                                    <div className="absolute left-0 top-full mt-2 w-full min-w-[160px] max-h-[300px] overflow-y-auto bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl z-50 scrollbar-hide">
                                        {availableSeasons.map((season: any) => (
                                            <div
                                                key={season.id}
                                                onClick={() => {
                                                    setSelectedSeason(season.season_number);
                                                    setIsSeasonDropdownOpen(false);
                                                }}
                                                className={`p-3 cursor-pointer transition-colors ${
                                                    selectedSeason === season.season_number 
                                                        ? 'bg-[#E50914]/20 border-l-2 border-[#E50914]' 
                                                        : 'hover:bg-white/5 border-l-2 border-transparent'
                                                }`}
                                            >
                                                <span className="text-sm font-medium">{t.details.season} {season.season_number}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
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

                                {isEpisodeDropdownOpen && (
                                    <div className="absolute left-0 top-full mt-2 w-[85vw] sm:w-[400px] max-w-[400px] max-h-[400px] overflow-y-auto bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl z-50 scrollbar-hide">
                                        {episodesData.length > 0 ? (
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
                                    </div>
                                )}
                            </div>
                        </div>
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
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
