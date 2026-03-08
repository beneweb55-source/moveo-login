"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { fetchDataFromApi } from "@/utils/api";
import { Play, Info, Star, Calendar, Film } from "lucide-react";
import { motion, useScroll, useTransform } from "motion/react";
import { useSelector } from "react-redux";
import { useLanguage } from "@/context/LanguageContext";

const HeroBanner = ({ endpoint, params, headline, themeColor }: { endpoint?: string, params?: any, headline?: string, themeColor?: string }) => {
  const [background, setBackground] = useState("");
  const [movie, setMovie] = useState<any>(null);
  const router = useRouter();
  const { genres } = useSelector((state: any) => state.home);
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 1000], [0, 400]);
  const opacity = useTransform(scrollY, [0, 500], [1, 0]);
  const { language, t } = useLanguage();

  // Default red if no theme color provided
  const accentColor = themeColor || "#E50914";

  useEffect(() => {
    const langParam = language === 'fr' ? 'fr-FR' : 'en-US';
    const fetchEndpoint = endpoint || "/trending/all/day";
    const fetchParams = { language: langParam, ...params };

    fetchDataFromApi(fetchEndpoint, fetchParams).then((res) => {
      const results = res?.results || [];
      if (results.length > 0) {
        // Pick random from top 5
        const top5 = results.slice(0, 5);
        const randomMovie = top5[Math.floor(Math.random() * top5.length)];
        
        const bg = randomMovie?.backdrop_path 
          ? `https://image.tmdb.org/t/p/original${randomMovie.backdrop_path}`
          : "";
          
        setBackground(bg);
        setMovie(randomMovie);
      }
    });
  }, [language, endpoint, params]);

  const getGenreNames = (genreIds: number[]) => {
    if (!genreIds || !genres) return [];
    return genreIds.map((id: number) => genres[id]).filter((g: any) => g);
  };

  const movieGenres = movie ? getGenreNames(movie.genre_ids) : [];

  return (
    <div ref={containerRef} className="relative w-full h-[85vh] min-h-[700px] overflow-hidden bg-[#0A0A0A]">
      {/* Parallax Background */}
      {background && (
        <motion.div
          className="absolute inset-0 w-full h-[120%] -top-[10%]"
          style={{ y, opacity }}
        >
          <div 
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${background})` }}
          />
        </motion.div>
      )}

      {/* Complex Gradients for Vignette */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/40 to-transparent z-10" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0A] via-[#0A0A0A]/60 to-transparent z-10" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-[#0A0A0A] z-10" />

      {/* Content */}
      <div className="relative z-20 w-full h-full max-w-[1600px] mx-auto px-6 md:px-12 pb-20 md:pb-32 flex flex-col justify-end items-start">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
          className="max-w-4xl"
        >
           {/* Mood Headline */}
           {headline && (
            <div className="mb-4 overflow-hidden">
              <motion.h2 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.8 }}
                className="text-2xl md:text-3xl font-medium tracking-wide uppercase"
                style={{ color: accentColor }}
              >
                {headline}
              </motion.h2>
            </div>
          )}

          {/* Metadata Badge Row */}
          <div className="flex flex-wrap items-center gap-3 mb-4 text-sm md:text-base font-medium">
            <span className="px-3 py-1 bg-white/10 backdrop-blur-md border border-white/20 rounded-md text-white uppercase tracking-wider flex items-center gap-2">
              {movie?.media_type === "tv" ? <Film className="w-4 h-4" /> : <Film className="w-4 h-4" />}
              {movie?.media_type === "tv" ? t.explore.exploreTv : t.explore.exploreMovies}
            </span>
            <span className="flex items-center gap-1 text-[#FFD700]">
              <Star className="w-4 h-4 fill-current" />
              {movie?.vote_average?.toFixed(1)}
            </span>
            <span className="text-zinc-300">
              {new Date(movie?.release_date || movie?.first_air_date).getFullYear()}
            </span>
          </div>

          {/* Title */}
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter text-white mb-6 drop-shadow-2xl leading-[0.9]">
            {movie?.title || movie?.name}
          </h1>

          {/* Genres */}
          <div className="flex flex-wrap gap-2 mb-6">
            {movieGenres.map((genre: any, i: number) => {
              const genreName = typeof genre === 'object' ? genre.name : genre;
              return (
                <span key={i} className="text-zinc-300 text-sm md:text-base">
                  {genreName}
                  {i < movieGenres.length - 1 && <span className="mx-2 text-zinc-500">•</span>}
                </span>
              );
            })}
          </div>

          {/* Synopsis */}
          <p className="text-lg md:text-xl text-zinc-300 mb-10 line-clamp-3 md:line-clamp-4 max-w-2xl leading-relaxed drop-shadow-md">
            {movie?.overview}
          </p>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <button
              onClick={() => router.push(`/${movie?.media_type || "movie"}/${movie?.id}`)}
              className="group w-full sm:w-auto flex items-center justify-center gap-3 bg-white text-black px-8 py-4 rounded-full font-bold text-lg transition-all duration-300 shadow-lg hover:scale-105"
              style={{ 
                boxShadow: `0 0 20px -5px ${accentColor}80` // 80 is alpha
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = accentColor;
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#ffffff';
                e.currentTarget.style.color = '#000000';
              }}
            >
              <Play className="w-6 h-6 fill-current transition-transform group-hover:scale-110" />
              {t.home.watchNow}
            </button>
            <button
              onClick={() => router.push(`/${movie?.media_type || "movie"}/${movie?.id}`)}
              className="w-full sm:w-auto flex items-center justify-center gap-3 bg-white/10 backdrop-blur-md border border-white/20 text-white px-8 py-4 rounded-full font-bold text-lg hover:bg-white/20 transition-all duration-300"
            >
              <Info className="w-6 h-6" />
              {t.home.moreInfo}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default HeroBanner;
