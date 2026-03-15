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

  const slides = data?.slice(0, 8) || [];

  const nextSlide = useCallback(() => {
    setActiveIdx((prev) => (prev + 1) % slides.length);
  }, [slides.length]);

  const prevSlide = useCallback(() => {
    setActiveIdx((prev) => (prev - 1 + slides.length) % slides.length);
  }, [slides.length]);

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
      <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-2xl md:text-3xl font-bold mb-8 text-white">{title}</h2>
        <div className="w-full aspect-[4/5] sm:aspect-[16/9] md:aspect-[21/7] min-h-[450px] md:min-h-[500px] mb-4">
          {skeletonItem()}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex-shrink-0 w-[calc(12.5%-10px)] min-w-[80px] aspect-video">
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
    <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-16">
      <div className="flex items-center justify-between mb-6 md:mb-12">
        <h2 className="text-2xl md:text-5xl font-black text-white tracking-tighter uppercase">
          {title}
        </h2>
        <div className="h-px flex-grow bg-white/10 ml-4 md:ml-8" />
        <div className="ml-4 text-zinc-500 font-mono text-sm md:text-lg">
          {activeIdx + 1} / {slides.length}
        </div>
      </div>
      
      <div 
        className="relative group w-full"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* Main Card */}
        <div 
          className="relative cursor-pointer rounded-3xl md:rounded-[2.5rem] overflow-hidden shadow-2xl shadow-black/80 bg-zinc-900 aspect-[4/5] sm:aspect-[16/9] md:aspect-[21/7] min-h-[450px] md:min-h-[500px]"
          onClick={() => router.push(`/${mainItem.media_type || "movie"}/${mainItem.id}`)}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={activeIdx}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0"
            >
              <SafeImage
                src={mainItem.backdrop_path ? `https://image.tmdb.org/t/p/original${mainItem.backdrop_path}` : (mainItem.poster_path ? `https://image.tmdb.org/t/p/original${mainItem.poster_path}` : `https://picsum.photos/seed/${mainItem.id}/1920/1080`)}
                alt={mainItem.title || mainItem.name}
                fallbackId={mainItem.id}
                className="object-cover transition-transform duration-[6000ms] scale-100 group-hover:scale-105"
                sizes="100vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent z-10" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent z-10" />
              
              <div className="absolute bottom-0 left-0 p-6 md:p-16 z-20 w-full md:w-2/3">
                <span className="inline-flex items-center gap-2 bg-[#E50914] text-white text-[10px] md:text-sm font-black px-4 py-1.5 md:px-5 md:py-2 rounded-full mb-3 md:mb-6 shadow-xl tracking-widest uppercase">
                  {mainItem.media_type === 'tv' ? <Tv className="w-4 h-4 md:w-5 md:h-5" /> : <Film className="w-4 h-4 md:w-5 md:h-5" />}
                  #{activeIdx + 1} {t.home.trending}
                </span>
                
                <h3 className="text-3xl md:text-7xl lg:text-8xl font-black text-white mb-3 md:mb-6 tracking-tighter leading-[1] md:leading-[0.9] drop-shadow-2xl line-clamp-2">
                  {mainItem.title || mainItem.name}
                </h3>
                
                <p className="text-zinc-300 text-sm md:text-xl line-clamp-2 md:line-clamp-3 max-w-2xl mb-6 md:mb-8 font-medium leading-relaxed opacity-90">
                  {mainItem.overview}
                </p>
                
                <div className="flex flex-wrap items-center gap-3 md:gap-4 text-[10px] md:text-base text-white/80 font-bold">
                  <button className="flex items-center gap-2 bg-white text-black px-6 py-2 md:px-8 md:py-3 rounded-full hover:bg-zinc-200 transition-colors">
                    <Play className="w-4 h-4 md:w-5 md:h-5 fill-current" />
                    {t.home.watchNow}
                  </button>
                  <div className="flex items-center gap-2 md:gap-3 bg-white/10 backdrop-blur-md px-3 py-1.5 md:px-4 md:py-2 rounded-xl border border-white/10">
                    <Star className="w-4 h-4 md:w-5 md:h-5 text-yellow-400 fill-current" />
                    <span className="text-white">{mainItem.vote_average?.toFixed(1)}</span>
                  </div>
                  <div className="flex items-center gap-2 md:gap-3 bg-white/10 backdrop-blur-md px-3 py-1.5 md:px-4 md:py-2 rounded-xl border border-white/10">
                    <Calendar className="w-4 h-4 md:w-5 md:h-5 text-zinc-400" />
                    <span>{new Date(mainItem.release_date || mainItem.first_air_date).getFullYear()}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Decorative element */}
          <div className="absolute top-6 right-6 md:top-10 md:right-10 z-20 hidden sm:block">
            <div className="w-20 h-20 md:w-32 md:h-32 rounded-full border-2 border-white/10 flex items-center justify-center backdrop-blur-sm group-hover:border-[#E50914]/50 transition-colors duration-500">
              <Play className="w-8 h-8 md:w-12 md:h-12 text-white group-hover:text-[#E50914] transition-colors duration-500 fill-current" />
            </div>
          </div>

          {/* Navigation Arrows */}
          <button 
            onClick={(e) => { e.stopPropagation(); prevSlide(); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-30 p-2 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#E50914]"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); nextSlide(); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-30 p-2 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#E50914]"
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
        <div className="flex gap-2 mt-4 overflow-x-auto pb-4 scrollbar-hide">
          {slides.map((item, idx) => (
            <div 
              key={item.id}
              onClick={() => setActiveIdx(idx)}
              className={`relative flex-shrink-0 w-[calc(12.5%-10px)] min-w-[80px] aspect-video rounded-lg overflow-hidden cursor-pointer transition-all duration-300 ${activeIdx === idx ? 'ring-2 ring-[#E50914] scale-105 opacity-100 z-10' : 'opacity-50 hover:opacity-80'}`}
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
