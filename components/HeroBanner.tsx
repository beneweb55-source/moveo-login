"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { fetchDataFromApi } from "@/utils/api";
import { Play, Info, Star, Calendar, Film, Pencil, Check, X } from "lucide-react";
import { motion, useScroll, useTransform } from "motion/react";
import { useSelector } from "react-redux";
import { useLanguage } from "@/context/LanguageContext";

const HeroBanner = ({ endpoint, params, headline, themeColor, customMovie }: { endpoint?: string, params?: any, headline?: string, themeColor?: string, customMovie?: any }) => {
  const [background, setBackground] = useState("");
  const [movie, setMovie] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [isUserLoading, setIsUserLoading] = useState(true);
  const [customGreetingColor, setCustomGreetingColor] = useState<string | null>(null);
  const [isEditingColor, setIsEditingColor] = useState(false);
  const [tempColor, setTempColor] = useState<string>("#ffffff");
  const router = useRouter();
  const { genres } = useSelector((state: any) => state.home);
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 1000], [0, 400]);
  const opacity = useTransform(scrollY, [0, 500], [1, 0]);
  const { language, t } = useLanguage();

  // Default neutral color if no theme color provided
  const accentColor = themeColor || "#ffffff";

  useEffect(() => {
    // Load custom color from localStorage
    const savedColor = localStorage.getItem("moveo_greeting_color");
    if (savedColor) {
      setCustomGreetingColor(savedColor);
    }

    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        }
      } catch (error) {
        console.error('Failed to fetch user', error);
      } finally {
        setIsUserLoading(false);
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    if (customMovie) {
      setMovie(customMovie);
      setBackground(customMovie.backdrop_path ? `https://image.tmdb.org/t/p/original${customMovie.backdrop_path}` : "");
      return;
    }

    const langParam = language === 'fr' ? 'fr-FR' : 'en-US';
    const fetchEndpoint = endpoint || "/trending/all/day";
    const fetchParams = { language: langParam, ...params };

    fetchDataFromApi(fetchEndpoint, fetchParams).then((res) => {
      let results = res?.results || [];
      
      // Filter out future releases and unwanted genres
      const now = new Date();
      results = results.filter((item: any) => {
        const dateStr = item.release_date || item.first_air_date;
        if (!dateStr) return false;
        if (new Date(dateStr) > now) return false;
        
        // Manually filter out animes if without_genres includes 16
        if (params?.without_genres?.includes("16") && item.genre_ids?.includes(16)) {
          return false;
        }

        return true;
      });

      if (results.length > 0) {
        // Pick from top 15
        const pool = results.slice(0, 15);
        const currentHour = new Date().getHours();
        const randomNum = Math.floor(Math.random() * pool.length);
        const selectedIndex = (currentHour + randomNum) % pool.length;
        const randomMovie = pool[selectedIndex];
        
        // Infer media_type from endpoint if not present
        if (!randomMovie.media_type) {
          if (fetchEndpoint.includes('/tv')) {
            randomMovie.media_type = 'tv';
          } else if (fetchEndpoint.includes('/movie')) {
            randomMovie.media_type = 'movie';
          }
        }
        
        const bg = randomMovie?.backdrop_path 
          ? `https://image.tmdb.org/t/p/original${randomMovie.backdrop_path}`
          : "";
          
        setBackground(bg);
        setMovie(randomMovie);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, customMovie]);

  const getGenreNames = (genreIds: number[]) => {
    if (!genreIds || !genres) return [];
    return genreIds.map((id: number) => genres[id]).filter((g: any) => g);
  };

  const movieGenres = movie ? getGenreNames(movie.genre_ids) : [];

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (language === 'fr') {
      if (hour >= 5 && hour < 12) return { text: "bonjour,", color: "#FFD60A" };
      if (hour >= 12 && hour < 18) return { text: "bon après-midi,", color: "#0A84FF" };
      if (hour >= 18 && hour < 22) return { text: "bonsoir,", color: "#FF6B00" };
      return { text: "toujours debout,", color: "#BF5AF2" };
    } else {
      if (hour >= 5 && hour < 12) return { text: "morning sorted,", color: "#FFD60A" };
      if (hour >= 12 && hour < 18) return { text: "afternoon sorted,", color: "#0A84FF" };
      if (hour >= 18 && hour < 22) return { text: "evening sorted,", color: "#FF6B00" };
      return { text: "late night sorted,", color: "#BF5AF2" };
    }
  };

  const { text: greetingText, color: greetingColor } = getGreeting();
  const finalGreetingColor = customGreetingColor || greetingColor;

  const handleEditClick = () => {
    setTempColor(finalGreetingColor);
    setIsEditingColor(true);
  };

  const handleApplyColor = () => {
    setCustomGreetingColor(tempColor);
    localStorage.setItem("moveo_greeting_color", tempColor);
    setIsEditingColor(false);
  };

  const handleCancelColor = () => {
    setIsEditingColor(false);
  };

  return (
    <div ref={containerRef} className="relative w-full min-h-screen flex items-center justify-center overflow-hidden bg-moveo-bg pt-16 md:pt-20">
      {/* Blurred Abstract Background */}
      {background && (
        <motion.div
          className="absolute inset-0 w-[120%] h-[120%] -top-[10%] -left-[10%] blur-3xl opacity-40 mix-blend-screen pointer-events-none"
          style={{ y, opacity }}
        >
          <div 
            className="absolute inset-0 bg-cover bg-center bg-no-repeat saturate-[1.5]"
            style={{ backgroundImage: `url(${background})` }}
          />
        </motion.div>
      )}

      {/* Gradients */}
      <div className="absolute inset-0 bg-gradient-to-t from-moveo-bg via-moveo-bg/80 to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-r from-moveo-bg via-moveo-bg/60 to-transparent z-10 pointer-events-none" />

      {/* Main Content Grid */}
      <div className="relative z-20 w-full max-w-[1800px] mx-auto px-6 md:px-12 lg:px-20 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center h-full py-12 md:py-20">
        
        {/* Left Column: Typography & Actions */}
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="lg:col-span-7 xl:col-span-6 flex flex-col justify-center items-start pt-10 lg:pt-0"
        >
           {/* Greeting */}
           {isUserLoading ? (
             <div className="mb-4 h-8"></div>
           ) : user ? (
            <div className="mb-6 overflow-hidden">
              <motion.h2 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.8 }}
                className="text-sm md:text-base font-sans tracking-[0.2em] uppercase text-white/60 flex items-center gap-x-2"
              >
                <span>{greetingText}</span>
                <span className="font-medium text-white/90">
                  {user.name?.split(' ')[0]}.
                </span>
              </motion.h2>
            </div>
          ) : headline && (
            <div className="mb-6 overflow-hidden">
              <motion.h2 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.8 }}
                className="text-sm md:text-base font-sans tracking-[0.2em] uppercase text-white/60"
              >
                {headline}
              </motion.h2>
            </div>
          )}

          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-4 mb-6 font-sans text-[11px] md:text-xs font-bold tracking-widest text-white/50 uppercase">
            <span className="px-3 py-1.5 border border-white/20 rounded-full text-white/80 flex items-center gap-2">
              <Film className="w-3 h-3" />
              {movie?.media_type === "tv" ? t.nav.tvShows : t.nav.movies}
            </span>
            <span className="flex items-center gap-1.5 text-white/90">
              <Star className="w-3.5 h-3.5" />
              {movie?.vote_average?.toFixed(1)}
            </span>
            <span>
              {movie?.release_date || movie?.first_air_date
                ? new Date(movie.release_date || movie.first_air_date).getFullYear()
                : 'N/A'}
            </span>
          </div>

          {/* Title */}
          <h1 className="text-5xl sm:text-6xl md:text-8xl lg:text-[7rem] font-serif leading-[0.95] tracking-tight text-white mb-6 drop-shadow-2xl">
            {movie?.title || movie?.name}
          </h1>

          {/* Genres */}
          <div className="flex flex-wrap gap-2 mb-8">
            {movieGenres.map((genre: any, i: number) => {
              const genreName = typeof genre === 'object' ? genre.name : genre;
              return (
                <span key={i} className="text-white/60 text-xs font-sans tracking-wide px-3 py-1 rounded-full bg-white/5">
                  {genreName}
                </span>
              );
            })}
          </div>

          {/* Synopsis */}
          <p className="text-base md:text-lg text-white/70 mb-10 line-clamp-3 md:line-clamp-4 max-w-xl leading-relaxed font-sans font-light">
            {movie?.overview}
          </p>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <button
              onClick={() => router.push(`/${movie?.media_type || "movie"}/${movie?.id}`)}
              className="w-full sm:w-auto flex items-center justify-center gap-3 bg-white text-moveo-bg px-8 py-4 rounded-full font-sans font-bold text-sm tracking-wide transition-all duration-500 hover:scale-[1.02] hover:bg-white/90"
            >
              <Play className="w-4 h-4 fill-current" />
              {t.home.watchNow}
            </button>
            <button
              onClick={() => router.push(`/${movie?.media_type || "movie"}/${movie?.id}`)}
              className="w-full sm:w-auto flex items-center justify-center gap-3 bg-white/5 border border-white/10 text-white px-8 py-4 rounded-full font-sans font-bold text-sm tracking-wide transition-all duration-500 hover:bg-white/10"
            >
              <Info className="w-4 h-4" />
              {t.home.moreInfo}
            </button>
          </div>
        </motion.div>

        {/* Right Column: Poster Staging */}
        <motion.div
          initial={{ opacity: 0, x: 40, rotateY: 10 }}
          animate={{ opacity: 1, x: 0, rotateY: 0 }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
          className="lg:col-span-5 xl:col-span-6 hidden lg:flex justify-end items-center perspective-1000"
        >
          {movie && (
            <div className="relative w-[340px] xl:w-[420px] aspect-[2/3] rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 transform-gpu hover:scale-105 transition-transform duration-700 ease-out cursor-pointer group" onClick={() => router.push(`/${movie?.media_type || "movie"}/${movie?.id}`)}>
              <img
                src={movie.poster_path ? `https://image.tmdb.org/t/p/w780${movie.poster_path}` : background}
                alt={movie.title || movie.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-center justify-center">
                 <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center scale-90 group-hover:scale-100 transition-transform duration-500">
                    <Play className="w-6 h-6 text-white fill-current ml-1" />
                 </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default HeroBanner;
