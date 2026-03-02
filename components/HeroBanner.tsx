"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchDataFromApi } from "@/utils/api";
import { Play, Info } from "lucide-react";
import { motion } from "motion/react";
import { useLanguage } from "@/context/LanguageContext";

const HeroBanner = () => {
  const [background, setBackground] = useState("");
  const [movie, setMovie] = useState<any>(null);
  const router = useRouter();
  const { language, t } = useLanguage();

  useEffect(() => {
    const langParam = language === 'fr' ? 'fr-FR' : 'en-US';
    fetchDataFromApi("/trending/all/day", { language: langParam }).then((res) => {
      const results = res.results || [];
      if (results.length > 0) {
        const randomMovie = results[Math.floor(Math.random() * results.length)];
        const bg = `https://image.tmdb.org/t/p/original${randomMovie?.backdrop_path}`;
        setBackground(bg);
        setMovie(randomMovie);
      }
    });
  }, [language]);

  return (
    <div className="relative w-full h-[80vh] md:h-[90vh] flex items-center justify-center bg-[#0A0A0A]">
      {/* Background Image */}
      {background && (
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-50 transition-opacity duration-1000"
          style={{ backgroundImage: `url(${background})` }}
        />
      )}

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0A] via-[#0A0A0A]/40 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0A0A0A] to-transparent" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-start justify-end h-full pb-32 md:pb-48">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-3xl"
        >
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-4 text-white drop-shadow-lg">
            {movie?.title || movie?.name || t.home.welcome}
          </h1>
          <p className="text-lg md:text-xl text-white/80 mb-8 line-clamp-3 md:line-clamp-4 max-w-2xl drop-shadow-md font-medium">
            {movie?.overview || t.home.subtitle}
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <button
              onClick={() => router.push(`/${movie?.media_type || "movie"}/${movie?.id}`)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white text-black px-8 py-3 rounded-full font-bold text-lg hover:bg-[#E50914] hover:text-white transition-all duration-300 transform hover:scale-105"
            >
              <Play className="w-6 h-6 fill-current" />
              {t.home.watchNow}
            </button>
            <button
              onClick={() => router.push(`/${movie?.media_type || "movie"}/${movie?.id}`)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white/20 backdrop-blur-md text-white px-8 py-3 rounded-full font-bold text-lg hover:bg-white/30 transition-all duration-300"
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
