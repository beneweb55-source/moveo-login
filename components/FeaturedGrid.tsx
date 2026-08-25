"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Play, Star, Calendar, ChevronLeft, ChevronRight, Tv, Film } from "lucide-react";
import { useSelector } from "react-redux";
import { motion, AnimatePresence } from "motion/react";

import { useLanguage } from "@/context/LanguageContext";

const SafeImage = ({ src, alt, fallbackId, className, sizes }: { src: string, alt: string, fallbackId: string | number, className?: string, sizes?: string }) => {
  const fallbackUrl = `https://picsum.photos/seed/${fallbackId}/800/1200`;
  const [errored, setErrored] = useState(false);

  // Reset error state when src changes by using a key or this pattern
  const [currentSrc, setCurrentSrc] = useState(src);
  if (src !== currentSrc) {
    setCurrentSrc(src);
    setErrored(false);
  }

  return (
    <Image
      src={errored ? fallbackUrl : (src || fallbackUrl)}
      alt={alt}
      fill
      referrerPolicy="no-referrer"
      className={className}
      sizes={sizes}
      onError={() => setErrored(true)}
    />
  );
};

interface FeaturedGridProps {
  data: any[];
  loading: boolean;
  title: string;
}

const FeaturedGrid: React.FC<FeaturedGridProps> = ({ data, loading, title }) => {
  const router = useRouter();
  const { t } = useLanguage();
  const [activeIdx, setActiveIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartX = useRef<number | null>(null);

  const slides = data?.slice(0, 8) || [];

  const nextSlide = useCallback(() => {
    setActiveIdx((prev) => (prev + 1) % slides.length);
  }, [slides.length]);

  const prevSlide = useCallback(() => {
    setActiveIdx((prev) => (prev - 1 + slides.length) % slides.length);
  }, [slides.length]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;

    if (Math.abs(diff) > 50) {
      if (diff > 0) nextSlide();
      else prevSlide();
    }
    touchStartX.current = null;
  };

  useEffect(() => {
    if (!paused && slides.length > 0) {
      intervalRef.current = setInterval(nextSlide, 6000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [paused, nextSlide, slides.length]);

  const skeletonItem = () => {
    return (
      <div className="relative w-full h-full rounded-xl overflow-hidden bg-zinc-900 animate-pulse">
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
      </div>
    );
  };

  if (loading) {
    return (
      <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-8 py-8 sm:py-12">
        <h2 className="text-xl sm:text-3xl font-bold mb-4 sm:mb-8 text-white">{title}</h2>
        <div className="w-full aspect-video sm:aspect-[21/7] min-h-[300px] sm:min-h-[500px] mb-4">
          {skeletonItem()}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex-shrink-0 w-24 sm:w-[calc(12.5%-10px)] aspect-video">
              {skeletonItem()}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (slides.length === 0) return null;

  const mainItem = slides[activeIdx];

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-8 py-10 sm:py-20 lg:py-24">
      <div className="flex items-center justify-between mb-8 sm:mb-16">
        <h2 className="text-3xl sm:text-5xl lg:text-7xl font-black text-white tracking-tighter uppercase leading-none">
          {title}
        </h2>
        <div className="h-px flex-grow bg-white/10 ml-6 sm:ml-12" />
        <div className="ml-6 text-zinc-500 font-mono text-sm sm:text-xl">
          {activeIdx + 1} / {slides.length}
        </div>
      </div>
      
      <div 
        className="relative group w-full"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Main Card */}
        <div 
          className="relative cursor-pointer rounded-[2rem] sm:rounded-[3rem] lg:rounded-[4rem] overflow-hidden shadow-[0_40px_80px_-15px_rgba(0,0,0,0.9)] bg-zinc-900 aspect-[4/5] sm:aspect-[16/10] lg:aspect-[21/8] w-full max-w-full border border-white/5"
          onClick={() => router.push(`/${mainItem.media_type || "movie"}/${mainItem.id}`)}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={activeIdx}
              initial={{ opacity: 0, scale: 1.1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0"
            >
              <SafeImage
                src={mainItem.poster_path ? `https://image.tmdb.org/t/p/original${mainItem.poster_path}` : (mainItem.backdrop_path ? `https://image.tmdb.org/t/p/original${mainItem.backdrop_path}` : `https://picsum.photos/seed/${mainItem.id}/1920/1080`)}
                alt={mainItem.title || mainItem.name}
                fallbackId={mainItem.id}
                className="object-cover transition-transform duration-[10000ms] scale-100 sm:group-hover:scale-110"
                sizes="100vw"
              />
              {/* Enhanced Gradient for better readability */}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent z-10" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/20 to-transparent z-10 sm:block hidden" />
              
              <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-12 lg:p-16 z-20 flex flex-col items-center text-center sm:items-start sm:text-left">
                <motion.div 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="inline-flex items-center gap-3 bg-[#E50914] text-[10px] sm:text-xs font-black px-4 py-1.5 sm:px-5 sm:py-2 rounded-full mb-4 sm:mb-6 shadow-2xl tracking-[0.2em] uppercase"
                >
                  {mainItem.media_type === 'tv' ? <Tv className="w-3 h-3 sm:w-4 sm:h-4" /> : <Film className="w-3 h-3 sm:w-4 sm:h-4" />}
                  #{activeIdx + 1} {t.home.trending}
                </motion.div>
                
                <motion.h3 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-3xl sm:text-5xl lg:text-6xl font-black text-white mb-4 sm:mb-6 tracking-tighter leading-[0.9] drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)] line-clamp-2 max-w-2xl lg:max-w-4xl"
                >
                  {mainItem.title || mainItem.name}
                </motion.h3>
                
                <motion.p 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-zinc-300 text-sm sm:text-base lg:text-lg line-clamp-2 max-w-xl lg:max-w-2xl mb-6 sm:mb-10 font-medium leading-relaxed opacity-80 sm:block hidden"
                >
                  {mainItem.overview}
                </motion.p>
                
                <motion.div 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="flex flex-col items-center sm:items-start gap-4 sm:gap-6 w-full sm:w-auto"
                >
                  <button className="flex items-center justify-center gap-3 bg-white text-black w-[90%] sm:w-auto px-6 sm:px-10 py-3 sm:py-3.5 rounded-full hover:bg-zinc-200 transition-all cursor-pointer active:scale-95 shadow-2xl font-black text-sm sm:text-base">
                    <Play className="w-5 h-5 sm:w-5 sm:h-5 fill-current" />
                    {t.home.watchNow}
                  </button>
                  
                  {/* Grouped Metadata on a single line below the button */}
                  <div className="flex items-center gap-4 text-xs sm:text-sm font-black text-white/60">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 sm:w-4 sm:h-4 text-yellow-400 fill-current" />
                      <span>{mainItem.vote_average?.toFixed(1)}</span>
                    </div>
                    <div className="w-1 h-1 rounded-full bg-white/20" />
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 sm:w-4 sm:h-4 text-zinc-400" />
                      <span>{new Date(mainItem.release_date || mainItem.first_air_date).getFullYear()}</span>
                    </div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Decorative element - Hide on mobile */}
          <div className="absolute top-10 right-10 z-20 hidden sm:block">
            <div className="w-32 h-32 rounded-full border-2 border-white/10 flex items-center justify-center backdrop-blur-sm group-hover:border-[#E50914]/50 transition-colors duration-500">
              <Play className="w-12 h-12 text-white group-hover:text-[#E50914] transition-colors duration-500 fill-current" />
            </div>
          </div>

          {/* Navigation Arrows - Hide on mobile, use swipe instead */}
          <button 
            onClick={(e) => { e.stopPropagation(); prevSlide(); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-30 p-2 rounded-full bg-black/50 text-white opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-[#E50914] hidden sm:block"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); nextSlide(); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-30 p-2 rounded-full bg-black/50 text-white opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-[#E50914] hidden sm:block"
          >
            <ChevronRight className="w-8 h-8" />
          </button>

          {/* Progress Bar */}
          <div className="absolute bottom-0 left-0 w-full h-1 bg-white/20 z-30">
            <AnimatePresence mode="wait">
              {!paused && (
                <motion.div
                  key={activeIdx}
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 6, ease: "linear" }}
                  className="h-full bg-[#E50914]"
                />
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Thumbnails */}
        <div className="flex gap-2 mt-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
          {slides.map((item, idx) => (
            <div 
              key={item.id}
              onClick={() => setActiveIdx(idx)}
              className={`relative flex-shrink-0 w-20 sm:w-[calc(12.5%-10px)] aspect-video rounded-lg overflow-hidden cursor-pointer transition-all duration-300 snap-start ${activeIdx === idx ? 'ring-2 ring-[#E50914] scale-105 opacity-100 z-10' : 'opacity-50 hover:opacity-80'}`}
            >
              <SafeImage
                src={item.backdrop_path ? `https://image.tmdb.org/t/p/w500${item.backdrop_path}` : (item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : `https://picsum.photos/seed/${item.id}/500/300`)}
                alt={item.title || item.name}
                fallbackId={item.id}
                className="object-cover"
                sizes="(max-width: 768px) 100px, 200px"
              />
              <div className="absolute bottom-1 left-1 bg-black/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                #{idx + 1}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FeaturedGrid;
