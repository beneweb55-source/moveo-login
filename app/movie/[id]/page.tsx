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
    <div className="min-h-screen bg-moveo-bg text-white font-sans selection:bg-white/20 selection:text-white pb-20 overflow-x-hidden">
      <WatchTimer mediaType="movie" mediaId={id as string} />
      {/* Navigation */}
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-24 left-4 md:left-12 z-40"
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-white/50 hover:text-white px-4 py-2 transition-all duration-300 group"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-2 transition-transform" />
          <span className="font-serif tracking-widest uppercase text-xs hidden sm:inline">{t.details.back}</span>
        </button>
      </motion.nav>

      {/* Hero Section */}
      <div className="relative w-full min-h-[70vh] md:min-h-[85vh] flex items-center pt-32 pb-12">
        {/* Abstract Backdrop */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <motion.div style={{ y }} className="relative w-full h-[120%] -top-[10%] blur-3xl opacity-30 mix-blend-screen">
                <Image
                    src={backdropUrl}
                    alt="Backdrop"
                    fill
                    className="object-cover saturate-150"
                    priority
                    referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-moveo-bg via-moveo-bg/80 to-transparent" />
            </motion.div>
        </div>

        <ContentWrapper>
            <div className="relative z-10 flex flex-col-reverse xl:grid xl:grid-cols-12 gap-12 xl:gap-20 items-center mt-8 px-4 sm:px-8 lg:px-12">
                {/* Info (Left) */}
                <div className="xl:col-span-7 flex flex-col gap-6 md:gap-8 min-w-0">
                    <motion.div
                        initial={{ opacity: 0, x: -30 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
                    >
                        {/* Badges */}
                        <div className="flex flex-wrap items-center gap-3 mb-6 md:mb-8 font-sans text-[10px] md:text-xs font-bold tracking-widest text-white/50 uppercase">
                            {data?.status && (
                                <span className="px-3 py-1.5 border border-white/20 rounded-full text-white/90">
                                    {data.status}
                                </span>
                            )}
                            {data?.genres?.map((g: any) => (
                                <span key={g.id} className="px-3 py-1.5 bg-white/5 rounded-full">
                                    {g.name}
                                </span>
                            ))}
                        </div>

                        <h1 className="text-5xl sm:text-6xl md:text-8xl font-serif tracking-tight leading-[0.95] mb-6 drop-shadow-2xl break-words">
                            {data?.title}
                        </h1>

                        {data?.tagline && (
                            <p className="text-lg md:text-2xl text-white/40 italic font-serif mb-8 md:mb-12 leading-relaxed max-w-3xl">
                                &ldquo;{data.tagline}&rdquo;
                            </p>
                        )}

                        <div className="flex flex-wrap items-center gap-6 text-xs md:text-sm font-sans font-bold text-white/50 mb-10 md:mb-14 uppercase tracking-widest">
                            <div className="flex items-center gap-2 text-white/90">
                                <Star className="w-4 h-4 md:w-5 md:h-5" />
                                <span>{rating}</span>
                            </div>
                            <div className="w-1 h-1 rounded-full bg-white/20" />
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 md:w-5 md:h-5" />
                                <span>{year}</span>
                            </div>
                            <div className="w-1 h-1 rounded-full bg-white/20" />
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 md:w-5 md:h-5" />
                                <span>{runtime}</span>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col sm:flex-row flex-wrap items-center gap-4 md:gap-6 mb-12 md:mb-16">
                            <button
                                onClick={scrollToPlayer}
                                className="w-full sm:w-auto flex items-center justify-center gap-4 bg-white text-moveo-bg hover:bg-white/90 px-10 py-4 rounded-full font-sans font-bold transition-all duration-500 shadow-xl hover:scale-105 active:scale-95 cursor-pointer text-sm"
                            >
                                <Play className="w-4 h-4 fill-current" />
                                <span className="uppercase tracking-wide">{t.details.watch}</span>
                            </button>

                            {trailer && (
                                <button
                                    onClick={() => setShowTrailer(true)}
                                    className="w-full sm:w-auto flex items-center justify-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-8 py-4 rounded-full font-sans font-bold transition-all duration-500 hover:scale-105 active:scale-95 text-sm"
                                >
                                    <Play className="w-4 h-4" />
                                    <span className="uppercase tracking-wide">{t.details.watchTrailer}</span>
                                </button>
                            )}

                            {moveoFound === false && (
                                <button
                                    onClick={handleRequest}
                                    disabled={requestState === 'loading' || requestState === 'requested' || requestState === 'already'}
                                    className={`w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 rounded-full font-sans font-bold transition-all duration-500 whitespace-nowrap uppercase tracking-wide text-sm ${ requestState === 'requested' ? 'bg-white/10 text-white/50 cursor-default' : requestState === 'already' ? 'bg-white/5 text-white/30 cursor-default' : requestState === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'bg-transparent hover:bg-white/5 border border-white/20 text-white hover:scale-105 active:scale-95' }`}
                                >
                                    {requestState === 'loading' && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {requestState === 'requested' && <Check className="w-4 h-4" />}
                                    {requestState === 'idle' && <Plus className="w-4 h-4" />}
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
                        <div className="max-w-3xl mb-12">
                            <h3 className="text-sm font-sans font-bold mb-4 uppercase tracking-[0.2em] text-white/50">
                                {t.details.synopsis}
                            </h3>
                            <p className="text-base md:text-lg text-white/80 leading-relaxed font-light font-sans">
                                {data?.overview}
                            </p>
                        </div>
                        
                        {/* Cast */}
                        <div className="mb-12">
                            <CastList cast={data?.credits?.cast || []} />
                        </div>
                    </motion.div>
                </div>

                {/* Poster (Right) */}
                <motion.div
                    initial={{ opacity: 0, y: 40, rotateY: -10 }}
                    animate={{ opacity: 1, y: 0, rotateY: 0 }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                    className="xl:col-span-5 relative w-[280px] sm:w-[360px] xl:w-full max-w-md aspect-[2/3] rounded-3xl overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.5)] border border-white/10 group perspective-1000 mx-auto xl:mx-0 xl:ml-auto"
                >
                     {posterUrl ? (
                        <Image
                            src={posterUrl}
                            alt={data?.title}
                            fill
                            className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                            referrerPolicy="no-referrer"
                        />
                    ) : (
                        <div className="w-full h-full bg-moveo-surface flex items-center justify-center">
                            <Film className="w-20 h-20 text-white/20" />
                        </div>
                    )}
                </motion.div>
            </div>
        </ContentWrapper>
      </div>

      {/* Player Section */}
      <div ref={playerRef} className="relative z-20 bg-moveo-bg">
        <ContentWrapper>
            <div className="py-20 mt-10">
                <div className="flex items-center justify-between mb-8 px-4 sm:px-8 lg:px-12">
                    <h2 className="text-3xl font-serif">{t.details.nowPlaying}</h2>
                    
                    <button 
                        onClick={handleHardRefresh}
                        className="flex items-center gap-2 px-4 py-2 hover:bg-white/5 text-white/50 hover:text-white rounded-full text-xs font-sans font-medium transition-all duration-300 border border-white/5 hover:border-white/20 group cursor-pointer"
                        title={t.details.reloadPlayer}
                    >
                        <RefreshCw className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-500" />
                        <span className="hidden sm:inline uppercase tracking-widest">{t.details.reload}</span>
                    </button>
                </div>

                <div className="bg-moveo-surface rounded-2xl overflow-hidden border border-white/5 shadow-2xl mx-4 sm:mx-8 lg:mx-12">
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
        <div className="relative z-20 bg-moveo-bg pb-20">
          <ContentWrapper>
             <div className="px-4 sm:px-8 lg:px-12">
                <Carousel 
                  data={recommendations} 
                  loading={false} 
                  endpoint="movie" 
                  title={t.home.youMightLike || "You might also like"} 
                />
             </div>
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
            onClick={() => setShowTrailer(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-5xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <button 
                onClick={() => setShowTrailer(false)}
                className="absolute top-6 right-6 z-10 p-3 bg-black/50 hover:bg-white/10 text-white rounded-full transition-colors duration-300 backdrop-blur-md"
              >
                <X className="w-5 h-5" />
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
