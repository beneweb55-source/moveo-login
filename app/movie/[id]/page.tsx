"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchDataFromApi } from "@/utils/api";
import ContentWrapper from "@/components/ContentWrapper";
import VideoPlayer from "@/components/VideoPlayer";
import ActionButtons from "@/components/ActionButtons";
import CastList from "@/components/CastList";
import { Star, ArrowLeft, Clock, Calendar, Play, Film, RefreshCw, X, Loader2, Check, Plus } from "lucide-react";
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
  const [moveoFound, setMoveoFound] = useState<boolean | null>(null);
  type RequestState = 'idle' | 'loading' | 'requested' | 'already' | 'error';
  const [requestState, setRequestState] = useState<RequestState>('idle');

  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 500], [0, 200]);

  useEffect(() => {
    if (data?.title) {
      document.title = `${data.title} - Moveo`;
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

  useEffect(() => {
    if (!id) return;
    fetch(`/api/catalogue?tmdb_id=${id}`)
      .then(r => r.json())
      .then(d => setMoveoFound(d.found))
      .catch(() => setMoveoFound(false));
  }, [id]);

  const scrollToPlayer = () => {
    playerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleHardRefresh = () => {
    setPlayerKey(prev => prev + 1);
  };

  const handleRequest = async () => {
    setRequestState('loading');
    try {
      const res = await fetch('/api/film-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmdb_id: id, title: data?.title, year: String(year) })
      });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const json = await res.json();
      if (json.status === 'requested') setRequestState('requested');
      else if (json.status === 'already_available' || json.status === 'already_requested') setRequestState('already');
      else setRequestState('error');
    } catch {
      setRequestState('error');
    }
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
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-8 lg:gap-16 items-start mt-16 lg:mt-0 px-4 sm:px-0">
                {/* Poster - Hidden on mobile, visible on lg */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                    className="hidden lg:block relative aspect-[2/3] rounded-[2.5rem] overflow-hidden shadow-[0_40px_80px_-15px_rgba(0,0,0,0.8)] border border-white/10 group"
                >
                     {posterUrl ? (
                        <Image
                            src={posterUrl}
                            alt={data?.title}
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

                        <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tighter leading-[1.1] mb-6 md:mb-10 drop-shadow-2xl break-words">
                            {data?.title}
                        </h1>

                        {data?.tagline && (
                            <p className="text-lg md:text-xl lg:text-2xl text-white/50 italic font-serif mb-8 md:mb-12 leading-relaxed max-w-4xl">
                                &ldquo;{data.tagline}&rdquo;
                            </p>
                        )}

                        <div className="flex flex-wrap items-center gap-4 md:gap-8 text-xs md:text-base lg:text-lg font-black text-white/60 mb-10 md:mb-16">
                            <div className="flex items-center gap-2 md:gap-3 bg-white/5 px-4 py-2 rounded-2xl border border-white/10 backdrop-blur-2xl">
                                <Star className="w-4 h-4 md:w-5 md:h-5 text-yellow-500 fill-yellow-500" />
                                <span className="text-white">{rating}</span>
                            </div>
                            <div className="flex items-center gap-2 md:gap-3">
                                <Calendar className="w-4 h-4 md:w-5 md:h-5 text-[#E50914]" />
                                <span className="tracking-widest">{year}</span>
                            </div>
                            <div className="flex items-center gap-2 md:gap-3">
                                <Clock className="w-4 h-4 md:w-5 md:h-5 text-[#E50914]" />
                                <span className="tracking-widest">{runtime}</span>
                            </div>
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

                            {moveoFound === false && (
                                <button
                                    onClick={handleRequest}
                                    disabled={requestState === 'loading' || requestState === 'requested' || requestState === 'already'}
                                    className={`w-full sm:w-auto flex items-center justify-center gap-4 px-8 py-3 md:py-4 rounded-full font-black transition-all duration-500 shadow-2xl whitespace-nowrap uppercase tracking-widest text-sm md:text-base ${ requestState === 'requested' ? 'bg-emerald-500/20 text-emerald-400 border-2 border-emerald-500/50 cursor-default' : requestState === 'already' ? 'bg-zinc-800/80 text-zinc-400 border-2 border-zinc-700 cursor-default' : requestState === 'error' ? 'bg-red-500/20 text-red-400 border-2 border-red-500/50 hover:bg-red-500/30' : 'bg-transparent hover:bg-white/10 border-2 border-white/20 text-white hover:border-white hover:scale-105 active:scale-95 group' }`}
                                >
                                    {requestState === 'loading' && <Loader2 className="w-5 h-5 animate-spin" />}
                                    {requestState === 'requested' && <Check className="w-5 h-5" />}
                                    {requestState === 'idle' && <Plus className="w-5 h-5" />}
                                    <span>
                                      {requestState === 'requested' ? t.details.requestSent
                                       : requestState === 'already' ? t.details.requestAlready
                                       : requestState === 'error' ? t.details.requestError
                                       : t.details.requestMovie}
                                    </span>
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
                        <div className="max-w-4xl mb-12 md:mb-20">
                            <h3 className="text-xl md:text-2xl font-black mb-4 md:mb-6 flex items-center gap-3 uppercase tracking-tighter">
                                <span className="w-1 h-6 md:h-8 bg-[#E50914] rounded-full" />
                                {t.details.synopsis}
                            </h3>
                            <p className="text-base md:text-lg lg:text-xl text-white/70 leading-relaxed font-medium">
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
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-1 h-8 bg-[#E50914] rounded-full" />
                        <h2 className="text-3xl font-bold">{t.details.nowPlaying}</h2>
                    </div>
                    
                    <button 
                        onClick={handleHardRefresh}
                        className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-full text-xs font-medium transition-all duration-300 border border-white/5 hover:border-white/20 group cursor-pointer"
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
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture"
                allowFullScreen
                webkitAllowFullScreen
                mozAllowFullScreen
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
