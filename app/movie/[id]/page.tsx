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
import { getWatchHistoryItem, saveWatchHistory } from "@/utils/historyManager";
import { watchRecord } from "@/lib/watchRecord";

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

  const scrollToPlayer = () => {
    playerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  /**
   * THE VIEWER CHOSE TO WATCH THIS FILM — so the page records it.
   *
   * WHY THE MOVIE PAGE NEEDED A WRITER OF ITS OWN: the two write paths this page
   * had — the provider's `postMessage`, and WatchTimer's minute ticks — both
   * begin at `parsePlaybackProgress`, which rejects every message from a provider
   * whose origin allowlist is empty. The source a first-time visitor is handed
   * for a film is such a provider, so a film watched in full left NOTHING at all:
   * no position, no minute, not even a local row. That is the reported defect,
   * and the measurements behind it are recorded in lib/movieWatchRecord.ts.
   *
   * WHY THIS MOMENT AND NO OTHER: opening a page is not watching it, so the mount
   * stays silent and only a DELIBERATE act records — the rule the series page
   * already applies to a chosen slot, and the one §13 states for progress.
   * Nothing here is inferred from a clock, an iframe load or a mounted player.
   *
   * WHAT THE ENTRY CLAIMS is decided in lib/watchRecord.ts and nowhere else:
   * this film, its name, its poster — and no position, because none has been
   * measured.
   */
  const handleWatch = () => {
    scrollToPlayer();
    try {
      const existing = getWatchHistoryItem("movie", String(id));
      const record = watchRecord({
        type: "movie",
        id,
        title: data?.title,
        posterPath: data?.poster_path,
        // Carried over so a later visit does not blank a badge the viewer has
        // already seen. A film opened for the first time claims no provider.
        provider: existing?.provider,
        now: Date.now(),
      });
      // `announce` is what makes the entry appear. Every list on the page is
      // built from the local store by `lib/useWatchHistory.ts`, which re-reads on
      // mount and on `HISTORY_UPDATED_EVENT` and on nothing else — so without
      // this, the title the viewer just started is stored and invisible until
      // something else remounts the list. The player's own writes stay silent
      // (§14, see the event's own note); this one is deliberate and happens once.
      if (record) saveWatchHistory(record, { announce: true });
    } catch (error) {
      // The store is a convenience: a browser that refuses to write must not
      // break the page, and the player below still scrolls into view.
      console.error("[movie] could not record the film the viewer opened", error);
    }
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
    <div className="min-h-screen bg-black text-white font-sans selection:bg-[#E50914] selection:text-white pb-20 overflow-x-hidden">
      {/*
        THE TITLE AND THE POSTER ARE NOT DECORATION HERE.

        WatchTimer is the only writer on this page that always carries a
        `session_id` to /api/watch-time, which makes it the only one this route
        can attribute for a viewer whose session it cannot verify — and it was
        mounted with `mediaType` and `mediaId` alone, so it posted `title: null`
        and the route's `COALESCE($5, watch_history.title)` stored NULL.

        Measured on the live database, 2026-09-23: 107 of the 108 rows in
        `watch_history` had a NULL title, and `GET /api/watch-time` filtered on
        `title IS NOT NULL`, so those rows could not be returned by any read. The
        viewer's own viewing was recorded, counted in every total, and invisible
        on every screen. A movie page has the title in `data` before this element
        is rendered; passing it costs nothing and is the difference between a
        history entry and a row nothing can name.
      */}
      <WatchTimer
        mediaType="movie"
        mediaId={id as string}
        title={data?.title}
        posterPath={data?.poster_path}
      />
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

                        <h1 className="text-4xl md:text-5xl xl:text-7xl font-black tracking-tighter leading-[1.1] mb-6 md:mb-10 drop-shadow-2xl break-words">
                            {data?.title}
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
                            <div className="flex items-center gap-2 md:gap-3">
                                <Clock className="w-4 h-4 md:w-5 md:h-5 text-[#E50914]" />
                                <span className="tracking-widest">{runtime}</span>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col sm:flex-row flex-wrap items-center gap-4 md:gap-6 mb-12 md:mb-20">
                            <button
                                onClick={handleWatch}
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

                            {/*
                              A "request this movie" button used to sit here, gated
                              on `moveoFound === false`. That flag came from
                              /api/catalogue and meant only this: no row in the
                              retired scraper database carried a non-null
                              voe_url/dood_url for this title. VOE and Dood are no
                              longer part of the player, and the URLs those columns
                              held were measured dead (voe.sx answered 404), so the
                              gate described a database rather than playability —
                              in both directions. It HID the button for titles whose
                              sole "availability" record was a dead link, and it
                              showed it for titles that play fine on the live
                              providers, for a reason that had nothing to do with
                              whether they play.
                              The action itself is still offered, by the player,
                              under the one condition the frontend can actually
                              observe: no source resolved for this title or episode.
                              See the sourceUnavailable state in VideoPlayer.tsx.
                            */}

                            <ActionButtons
                                id={id as string}
                                type="movie"
                                title={data?.title}
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
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-1 h-8 bg-[#E50914] rounded-full" />
                        {/*
                          Names the section. It used to read "Lecture en cours"
                          / "Now Playing", rendered unconditionally — before the
                          frame had sent anything, and whether or not anything
                          ever played. Measured on production 2026-09-22:
                          `/movie/969681` ran for 132 s, the only position-bearing
                          messages were the provider's stored snapshots at a
                          2000 ms cadence, and every one of them was `{watched: 0,
                          duration: 0}` — no playback occurred and the heading
                          claimed it throughout. §15: "Aucune UI ne doit annoncer
                          'Lecture en cours' sans signal fiable de lecture." See
                          lib/translations.ts for why the honest label is a name
                          rather than a state.
                        */}
                        <h2 className="text-3xl font-bold">{t.details.videoPlayer}</h2>
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
                        /* TMDB's original language, which is what tells the player
                           this is a Korean film or an anime rather than a Western
                           one. The player picks a different first source for each,
                           on measured grounds — see lib/playerStrategy.ts. */
                        originalLanguage={data?.original_language}
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
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
