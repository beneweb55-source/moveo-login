"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Play, Star, Calendar } from "lucide-react";
import { useSelector } from "react-redux";
import { motion } from "motion/react";

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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-[800px] md:h-[600px]">
          <div className="md:col-span-2 md:row-span-2 h-full">{skeletonItem()}</div>
          <div className="md:col-span-1 md:row-span-1 h-full">{skeletonItem()}</div>
          <div className="md:col-span-1 md:row-span-1 h-full">{skeletonItem()}</div>
          <div className="md:col-span-1 md:row-span-1 h-full">{skeletonItem()}</div>
          <div className="md:col-span-1 md:row-span-1 h-full">{skeletonItem()}</div>
        </div>
      </div>
    );
  }

  // Ensure we have enough data
  const mainItem = data?.[0];
  const secondaryItems = data?.slice(1, 5);

  if (!mainItem) return null;

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemAnim = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-16">
      <div className="flex items-center justify-between mb-6 md:mb-12">
        <h2 className="text-2xl md:text-5xl font-black text-white tracking-tighter uppercase">
          {title}
        </h2>
        <div className="h-px flex-grow bg-white/10 ml-4 md:ml-8" />
      </div>
      
      <motion.div 
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        className="w-full"
      >
        {/* Main Card (#1) - Full width cinematic feature */}
        <motion.div 
          variants={itemAnim}
          className="relative group cursor-pointer rounded-3xl md:rounded-[2.5rem] overflow-hidden shadow-2xl shadow-black/80 bg-zinc-900 aspect-[4/5] sm:aspect-[16/9] md:aspect-[21/7] min-h-[450px] md:min-h-[500px]"
          onClick={() => router.push(`/${mainItem.media_type || "movie"}/${mainItem.id}`)}
        >
          <SafeImage
            src={mainItem.backdrop_path ? `https://image.tmdb.org/t/p/original${mainItem.backdrop_path}` : (mainItem.poster_path ? `https://image.tmdb.org/t/p/original${mainItem.poster_path}` : `https://picsum.photos/seed/${mainItem.id}/1920/1080`)}
            alt={mainItem.title || mainItem.name}
            fallbackId={mainItem.id}
            className="object-cover transition-transform duration-[3000ms] group-hover:scale-105"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent z-10" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent z-10" />
          
          <div className="absolute bottom-0 left-0 p-6 md:p-16 z-20 w-full md:w-2/3">
            <motion.span 
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="inline-flex items-center gap-2 bg-[#E50914] text-white text-[10px] md:text-sm font-black px-4 py-1.5 md:px-5 md:py-2 rounded-full mb-3 md:mb-6 shadow-xl tracking-widest uppercase"
            >
              <Star className="w-3 h-3 md:w-4 md:h-4 fill-current" />
              #1 {t.home.trending}
            </motion.span>
            
            <h3 className="text-3xl md:text-7xl lg:text-8xl font-black text-white mb-3 md:mb-6 tracking-tighter leading-[1] md:leading-[0.9] drop-shadow-2xl">
              {mainItem.title || mainItem.name}
            </h3>
            
            <p className="text-zinc-300 text-sm md:text-xl line-clamp-3 md:line-clamp-3 max-w-2xl mb-6 md:mb-8 font-medium leading-relaxed opacity-90">
              {mainItem.overview}
            </p>
            
            <div className="flex flex-wrap items-center gap-3 md:gap-8 text-[10px] md:text-base text-white/80 font-bold">
              <div className="flex items-center gap-2 md:gap-3 bg-white/10 backdrop-blur-md px-3 py-1.5 md:px-4 md:py-2 rounded-xl border border-white/10">
                <Star className="w-4 h-4 md:w-5 md:h-5 text-yellow-400 fill-current" />
                <span className="text-white">{mainItem.vote_average?.toFixed(1)}</span>
              </div>
              <div className="flex items-center gap-2 md:gap-3 bg-white/10 backdrop-blur-md px-3 py-1.5 md:px-4 md:py-2 rounded-xl border border-white/10">
                <Calendar className="w-4 h-4 md:w-5 md:h-5 text-zinc-400" />
                <span>{new Date(mainItem.release_date || mainItem.first_air_date).getFullYear()}</span>
              </div>
              <div className="flex items-center gap-2 md:gap-3 bg-white/10 backdrop-blur-md px-3 py-1.5 md:px-4 md:py-2 rounded-xl border border-white/10">
                <Play className="w-4 h-4 md:w-5 md:h-5 text-[#E50914] fill-current" />
                <span className="uppercase tracking-wider">{t.home.trending}</span>
              </div>
            </div>
          </div>
          
          {/* Decorative element */}
          <div className="absolute top-6 right-6 md:top-10 md:right-10 z-20 hidden sm:block">
            <div className="w-20 h-20 md:w-32 md:h-32 rounded-full border-2 border-white/10 flex items-center justify-center backdrop-blur-sm group-hover:border-[#E50914]/50 transition-colors duration-500">
              <Play className="w-8 h-8 md:w-12 md:h-12 text-white group-hover:text-[#E50914] transition-colors duration-500 fill-current" />
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default FeaturedGrid;
