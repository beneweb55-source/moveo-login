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
        <h2 className="text-3xl sm:text-5xl lg:text-7xl font-serif text-white tracking-tighter uppercase leading-none">
          {title}
        </h2>
        <div className="h-px flex-grow bg-white/10 ml-6 sm:ml-12" />
        <div className="ml-6 text-white/40 font-mono text-sm sm:text-xl">
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
          className="relative cursor-pointer rounded-2xl sm:rounded-3xl lg:rounded-[2.5rem] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] bg-moveo-surface aspect-[4/5] sm:aspect-[16/10] lg:aspect-[21/8] w-full max-w-full border border-white/5"
          onClick={() => router.push(`/${mainItem.media_type || "movie"}/${mainItem.id}`)}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={activeIdx}
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0"
            >
              <SafeImage
                src={mainItem.poster_path ? `https://image.tmdb.org/t/p/original${mainItem.poster_path}` : (mainItem.backdrop_path ? `https://image.tmdb.org/t/p/original${mainItem.backdrop_path}` : `https://picsum.photos/seed/${mainItem.id}/1920/1080`)}
                alt={mainItem.title || mainItem.name}
                fallbackId={mainItem.id}
                className="object-cover transition-transform duration-[10000ms] scale-100 sm:group-hover:scale-105"
                sizes="100vw"
              />
              {/* Enhanced Gradient for better readability */}
              <div className="absolute inset-0 bg-gradient-to-t from-moveo-bg via-moveo-bg/60 to-transparent z-10" />
              <div className="absolute inset-0 bg-gradient-to-r from-moveo-bg via-moveo-bg/20 to-transparent z-10 sm:block hidden" />
              
              <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-12 lg:p-16 z-20 flex flex-col items-center text-center sm:items-start sm:text-left">
                <motion.div 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="inline-flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/20 text-[10px] sm:text-xs font-medium px-4 py-1.5 sm:px-5 sm:py-2 rounded-full mb-4 sm:mb-6 tracking-[0.2em] uppercase text-white/90"
                >
                  {mainItem.media_type === 'tv' ? <Tv className="w-3 h-3 sm:w-4 sm:h-4" /> : <Film className="w-3 h-3 sm:w-4 sm:h-4" />}
                  #{activeIdx + 1} {t.home.trending}
                </motion.div>
                
                <motion.h3 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-3xl sm:text-5xl lg:text-6xl font-serif text-white mb-4 sm:mb-6 tracking-tight leading-[1] drop-shadow-lg line-clamp-2 max-w-2xl lg:max-w-4xl"
                >
                  {mainItem.title || mainItem.name}
                </motion.h3>
                
                <motion.p 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-white/70 text-sm sm:text-base lg:text-lg line-clamp-2 max-w-xl lg:max-w-2xl mb-6 sm:mb-10 font-light leading-relaxed sm:block hidden"
                >
                  {mainItem.overview}
                </motion.p>
                
                <motion.div 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="flex flex-col items-center sm:items-start gap-4 sm:gap-6 w-full sm:w-auto"
                >
                  <button className="flex items-center justify-center gap-3 bg-white text-moveo-bg w-[90%] sm:w-auto px-8 sm:px-10 py-3 sm:py-3.5 rounded-full hover:bg-white/90 transition-all cursor-pointer active:scale-95 shadow-xl font-bold text-sm sm:text-base">
                    <Play className="w-5 h-5 sm:w-5 sm:h-5 fill-current" />
                    {t.home.watchNow}
                  </button>
                  
                  {/* Grouped Metadata on a single line below the button */}
                  <div className="flex items-center gap-4 text-xs sm:text-sm font-bold text-white/50 uppercase tracking-widest">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 sm:w-4 sm:h-4 text-white/80" />
                      <span>{mainItem.vote_average?.toFixed(1)}</span>
                    </div>
                    <div className="w-1 h-1 rounded-full bg-white/20" />
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 sm:w-4 sm:h-4 text-white/50" />
                      <span>{new Date(mainItem.release_date || mainItem.first_air_date).getFullYear()}</span>
                    </div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Decorative element - Hide on mobile */}
          <div className="absolute top-10 right-10 z-20 hidden sm:block">
            <div className="w-32 h-32 rounded-full border border-white/10 flex items-center justify-center backdrop-blur-md group-hover:border-white/30 transition-colors duration-500">
              <Play className="w-10 h-10 text-white/70 group-hover:text-white transition-colors duration-500 fill-current ml-2" />
            </div>
          </div>

          {/* Navigation Arrows - Hide on mobile, use swipe instead */}
          <button 
            onClick={(e) => { e.stopPropagation(); prevSlide(); }}
            className="absolute left-6 top-1/2 -translate-y-1/2 z-30 p-3 rounded-full bg-moveo-surface/80 backdrop-blur-md text-white opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-white/10 hidden sm:block border border-white/10"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); nextSlide(); }}
            className="absolute right-6 top-1/2 -translate-y-1/2 z-30 p-3 rounded-full bg-moveo-surface/80 backdrop-blur-md text-white opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-white/10 hidden sm:block border border-white/10"
          >
            <ChevronRight className="w-6 h-6" />
          </button>

          {/* Progress Bar */}
          <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10 z-30">
            <AnimatePresence mode="wait">
              {!paused && (
                <motion.div
                  key={activeIdx}
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 6, ease: "linear" }}
                  className="h-full bg-white/50"
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
              className={`relative flex-shrink-0 w-20 sm:w-[calc(12.5%-10px)] aspect-video rounded-lg overflow-hidden cursor-pointer transition-all duration-300 snap-start ${activeIdx === idx ? 'border border-white scale-105 opacity-100 z-10' : 'opacity-40 hover:opacity-80'}`}
            >
              <SafeImage
                src={item.backdrop_path ? `https://image.tmdb.org/t/p/w500${item.backdrop_path}` : (item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : `https://picsum.photos/seed/${item.id}/500/300`)}
                alt={item.title || item.name}
                fallbackId={item.id}
                className="object-cover"
                sizes="(max-width: 768px) 100px, 200px"
              />
              <div className="absolute bottom-1 left-1 bg-moveo-bg/80 text-white/80 text-[10px] font-medium px-1.5 py-0.5 rounded backdrop-blur-sm">
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
