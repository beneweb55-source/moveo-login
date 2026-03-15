"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchDataFromApi } from "@/utils/api";
import ContentWrapper from "@/components/ContentWrapper";
import VideoPlayer from "@/components/VideoPlayer";
import ActionButtons from "@/components/ActionButtons";
import CastList from "@/components/CastList";
import { Star, ArrowLeft, Clock, Calendar, Play, Film, RefreshCw, X } from "lucide-react";
import Image from "next/image";
import { motion, useScroll, useTransform, AnimatePresence } from "motion/react";
import Carousel from "@/components/Carousel";

import { useLanguage } from "@/context/LanguageContext";
import WatchTimer from "@/components/WatchTimer";

export default function MovieDetails() {
  const { id } = useParams();
  const router = useRouter();
  const { language, t } = useLanguage();
  const langParam = language === "fr" ? "fr-FR" : "en-US";
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [playerKey, setPlayerKey] = useState(0);
  const playerRef = useRef<HTMLDivElement>(null);
  const [showTrailer, setShowTrailer] = useState(false);

  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 500], [0, 200]);

  useEffect(() => {
    if (data?.title) {
      document.title = `Moveo — ${data.title}`;
    } else {
      document.title = 'Moveo';
    }

    return () => {
      document.title = 'Moveo';
    };
  }, [data]);

  useEffect(() => {
    const fetchDetails = async () => {
      setLoading(true);
      try {
        const res = await fetchDataFromApi(`/movie/${id}`, { 
          language: langParam,
          append_to_response: "videos,credits,recommendations"
        });
        setData(res);
      } catch (error) {
        console.error("Error fetching details:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [id, langParam]);

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

  const releaseDate = data?.release_date;
  const year = releaseDate ? new Date(releaseDate).getFullYear() : "";
  const rating = data?.vote_average ? data.vote_average.toFixed(1) : "NR";
  const hours = Math.floor(data?.runtime / 60);
  const minutes = data?.runtime % 60;
  const runtime = `${hours}h ${minutes}m`;

  const cast = data?.credits?.cast?.slice(0, 10) || [];
  
  const videos = data?.videos?.results || [];
  const trailer = videos.find((v: any) => v.type === "Trailer" && v.site === "YouTube") 
    || videos.find((v: any) => v.type === "Teaser" && v.site === "YouTube");

  const recommendations = data?.recommendations?.results?.slice(0, 10) || [];

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-sans selection:bg-[#E50914] selection:text-white pb-20">
      <WatchTimer mediaType="movie" mediaId={id as string} />
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
      <div className="relative w-full min-h-[60vh] md:min-h-[80vh] flex items-start pt-20 pb-12 lg:items-center lg:pt-0 lg:pb-0">
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
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[350px_1fr] gap-6 lg:gap-12 items-start lg:items-center mt-12 lg:mt-0">
                {/* Poster - Hidden on mobile, visible on lg */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8 }}
                    className="hidden lg:block relative aspect-[2/3] rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 group"
                >
                     {posterUrl ? (
                        <Image
                            src={posterUrl}
                            alt={data?.title}
                            fill
                            className="object-cover transition-transform duration-700 group-hover:scale-105"
                            referrerPolicy="no-referrer"
                        />
                    ) : (
                        <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                            <Film className="w-16 h-16 text-white/20" />
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
                            {data?.title}
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
                            <div className="flex items-center gap-1.5 md:gap-2">
                                <Clock className="w-3 h-3 md:w-4 md:h-4 text-[#E50914]" />
                                <span>{runtime}</span>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col sm:flex-row items-center gap-3 md:gap-4 mb-8">
                            <button
                                onClick={scrollToPlayer}
                                className="w-full sm:w-auto flex items-center justify-center gap-3 bg-[#E50914] hover:bg-red-700 text-white px-8 py-3 md:py-4 rounded-full font-bold transition-all duration-300 shadow-lg shadow-red-900/30 hover:shadow-red-900/50 hover:scale-105 group"
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
                                type="movie"
                                title={data?.title}
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
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-1 h-8 bg-[#E50914] rounded-full" />
                        <h2 className="text-3xl font-bold">{t.details.nowPlaying}</h2>
                    </div>
                    
                    <button 
                        onClick={handleHardRefresh}
                        className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-full text-xs font-medium transition-all duration-300 border border-white/5 hover:border-white/20 group"
                        title={t.details.reloadPlayer}
                    >
                        <RefreshCw className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-500" />
                        <span>{t.details.reload}</span>
                    </button>
                </div>

                <div className="bg-[#141414] rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                    <VideoPlayer 
                        key={playerKey}
                        id={id as string} 
                        type="movie" 
                        title={data?.title}
                        originalTitle={data?.original_title}
                        year={year ? String(year) : undefined}
                        genres={data?.genres}
                        posterPath={data?.poster_path}
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
              endpoint="movie" 
              title={t.home.youMightLike || "You might also like"} 
            />
          </ContentWrapper>
        </div>
      )}

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
