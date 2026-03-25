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

  // Default red if no theme color provided
  const accentColor = themeColor || "#E50914";

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
    const fetchEndpoint = "/trending/all/day";
    const fetchParams = { language: langParam };

    fetchDataFromApi(fetchEndpoint, fetchParams).then((res) => {
      let results = res?.results || [];
      
      // Filter out future releases
      const now = new Date();
      results = results.filter((item: any) => {
        const dateStr = item.release_date || item.first_air_date;
        if (!dateStr) return false;
        return new Date(dateStr) <= now;
      });

      if (results.length > 0) {
        // Pick from top 15
        const pool = results.slice(0, 15);
        const currentHour = new Date().getHours();
        const randomNum = Math.floor(Math.random() * pool.length);
        const selectedIndex = (currentHour + randomNum) % pool.length;
        const randomMovie = pool[selectedIndex];
        
        const bg = randomMovie?.backdrop_path 
          ? `https://image.tmdb.org/t/p/original${randomMovie.backdrop_path}`
          : "";
          
        setBackground(bg);
        setMovie(randomMovie);
      }
    });
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
    <div ref={containerRef} className="relative w-full h-[70vh] md:h-[85vh] min-h-[550px] md:min-h-[700px] overflow-hidden bg-[#0A0A0A]">
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
      <div className="relative z-20 w-full h-full max-w-[1600px] mx-auto px-4 md:px-12 pb-12 md:pb-32 flex flex-col justify-end items-start">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
          className="max-w-4xl w-full"
        >
           {/* Mood Headline / Greeting */}
           {isUserLoading ? (
             <div className="mb-4 h-8 md:h-10"></div>
           ) : user ? (
            <div className="mb-3 md:mb-4 overflow-hidden">
              <motion.h2 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.8 }}
                className="text-sm md:text-lg xl:text-xl font-extralight tracking-[0.15em] uppercase text-white/70 flex items-center flex-wrap gap-x-2"
              >
                <span>{greetingText}</span>
                <span className="font-light flex items-center gap-2" style={{ color: isEditingColor ? tempColor : finalGreetingColor }}>
                  {user.name?.split(' ')[0]}.
                  
                  {isEditingColor ? (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9, x: -10 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      className="flex items-center gap-1.5 ml-3 bg-white/10 backdrop-blur-xl rounded-full px-3 py-1.5 border border-white/20 shadow-xl"
                    >
                      <div className="relative w-6 h-6 rounded-full overflow-hidden border-2 border-white/50 shadow-inner cursor-pointer hover:scale-110 transition-transform">
                        <input 
                          type="color" 
                          value={tempColor}
                          onChange={(e) => setTempColor(e.target.value)}
                          className="absolute -top-2 -left-2 w-10 h-10 cursor-pointer border-0 p-0 bg-transparent"
                        />
                      </div>
                      
                      <div className="w-[1px] h-4 bg-white/20 mx-1" />
                      
                      <button 
                        onClick={handleApplyColor}
                        className="text-emerald-400 hover:text-emerald-300 hover:bg-white/10 rounded-full p-1.5 transition-all cursor-pointer"
                        title="Apply"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={handleCancelColor}
                        className="text-rose-400 hover:text-rose-300 hover:bg-white/10 rounded-full p-1.5 transition-all cursor-pointer"
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </motion.div>
                  ) : (
                    <button 
                      onClick={handleEditClick}
                      className="text-white/30 hover:text-white transition-colors focus:outline-none ml-1 cursor-pointer"
                      title="Change color"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </span>
              </motion.h2>
            </div>
          ) : headline && (
            <div className="mb-3 md:mb-4 overflow-hidden">
              <motion.h2 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.8 }}
                className="text-xl md:text-3xl font-medium tracking-wide uppercase"
                style={{ color: accentColor }}
              >
                {headline}
              </motion.h2>
            </div>
          )}

          {/* Metadata Badge Row */}
          <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-4 text-xs md:text-sm xl:text-base font-medium">
            <span className="px-2 py-1 md:px-3 md:py-1 bg-white/10 backdrop-blur-md border border-white/20 rounded-md text-white uppercase tracking-wider flex items-center gap-2">
              <Film className="w-3 h-3 md:w-4 md:h-4" />
              {movie?.media_type === "tv" ? t.nav.tvShows : t.nav.movies}
            </span>
            <span className="flex items-center gap-1 text-[#FFD700]">
              <Star className="w-3.5 h-3.5 md:w-4 md:h-4 fill-current" />
              {movie?.vote_average?.toFixed(1)}
            </span>
            <span className="text-zinc-300">
              {movie?.release_date || movie?.first_air_date
                ? new Date(movie.release_date || movie.first_air_date).getFullYear()
                : 'N/A'}
            </span>
          </div>

          {/* Title */}
          <h1 className="text-4xl md:text-6xl xl:text-8xl font-black tracking-tighter text-white mb-4 md:mb-6 drop-shadow-2xl leading-[1.1] md:leading-[0.9]">
            {movie?.title || movie?.name}
          </h1>

          {/* Genres */}
          <div className="flex flex-wrap gap-x-2 gap-y-1 mb-4 md:mb-6">
            {movieGenres.map((genre: any, i: number) => {
              const genreName = typeof genre === 'object' ? genre.name : genre;
              return (
                <span key={i} className="text-zinc-300 text-[10px] md:text-base whitespace-nowrap">
                  {genreName}
                  {i < movieGenres.length - 1 && <span className="ml-2 text-zinc-500">•</span>}
                </span>
              );
            })}
          </div>

          {/* Synopsis */}
          <p className="text-sm md:text-lg xl:text-xl text-zinc-300 mb-6 md:mb-10 line-clamp-3 md:line-clamp-4 max-w-2xl leading-relaxed drop-shadow-md opacity-80">
            {movie?.overview}
          </p>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 md:gap-4">
            <button
              onClick={() => router.push(`/${movie?.media_type || "movie"}/${movie?.id}`)}
              className="group w-full sm:w-auto flex items-center justify-center gap-3 bg-white text-black px-6 py-3 md:px-8 md:py-4 rounded-full font-bold text-base md:text-lg transition-all duration-300 shadow-lg hover:scale-105"
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
              <Play className="w-5 h-5 md:w-6 md:h-6 fill-current transition-transform group-hover:scale-110" />
              {t.home.watchNow}
            </button>
            <button
              onClick={() => router.push(`/${movie?.media_type || "movie"}/${movie?.id}`)}
              className="w-full sm:w-auto flex items-center justify-center gap-3 bg-white/10 backdrop-blur-md border border-white/20 text-white px-6 py-3 md:px-8 md:py-4 rounded-full font-bold text-base md:text-lg hover:bg-white/20 transition-all duration-300"
            >
              <Info className="w-5 h-5 md:w-6 md:h-6" />
              {t.home.moreInfo}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default HeroBanner;
