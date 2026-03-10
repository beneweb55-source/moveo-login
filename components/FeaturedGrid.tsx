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
  const [imgSrc, setImgSrc] = useState(src || fallbackUrl);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setImgSrc(src || fallbackUrl);
    setErrored(false);
  }, [src, fallbackUrl]);

  return (
    <Image
      src={errored ? fallbackUrl : (imgSrc || fallbackUrl)}
      alt={alt}
      fill
      referrerPolicy="no-referrer"
      className={className}
      sizes={sizes}
      onError={() => {
        if (!errored) {
          setErrored(true);
          setImgSrc(fallbackUrl);
        }
      }}
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
    <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h2 className="text-2xl md:text-3xl font-bold mb-8 text-white flex items-center gap-2">
        <span className="w-1 h-8 bg-[#E50914] rounded-full mr-2"></span>
        {title}
      </h2>
      
      <motion.div 
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        className="grid grid-cols-1 md:grid-cols-4 grid-rows-[400px_400px] md:grid-rows-[290px_290px] gap-4"
      >
        {/* Main Card (#1) */}
        <motion.div 
          variants={itemAnim}
          className="md:col-span-2 md:row-span-2 relative group cursor-pointer rounded-2xl overflow-hidden shadow-xl shadow-black/50 h-[400px] md:h-full bg-zinc-900"
          onClick={() => router.push(`/${mainItem.media_type || "movie"}/${mainItem.id}`)}
        >
          <div className="absolute top-4 left-4 z-20 bg-[#E50914] text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
            #1 {t.home.trending}
          </div>
          <SafeImage
            src={mainItem.poster_path ? `https://image.tmdb.org/t/p/original${mainItem.poster_path}` : `https://picsum.photos/seed/${mainItem.id}/800/1200`}
            alt={mainItem.title || mainItem.name}
            fallbackId={mainItem.id}
            className="object-cover transition-transform duration-700 group-hover:scale-105 group-hover:brightness-75"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">
            <div className="bg-white/20 backdrop-blur-md p-4 rounded-full border border-white/30">
              <Play className="w-8 h-8 text-white fill-white" />
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black/80 to-transparent z-10">
            <h3 className="text-3xl font-bold text-white mb-2 drop-shadow-md">
              {mainItem.title || mainItem.name}
            </h3>
            <div className="flex items-center gap-4 text-sm text-zinc-300">
              <span className="flex items-center gap-1 text-yellow-400">
                <Star className="w-4 h-4 fill-current" />
                {mainItem.vote_average?.toFixed(1)}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {new Date(mainItem.release_date || mainItem.first_air_date).getFullYear()}
              </span>
            </div>
            <p className="mt-2 text-zinc-400 line-clamp-2 text-sm max-w-lg">
              {mainItem.overview}
            </p>
          </div>
        </motion.div>

        {/* Secondary Cards */}
        {secondaryItems?.map((item: any) => (
          <motion.div
            key={item.id}
            variants={itemAnim}
            className="md:col-span-1 md:row-span-1 relative group cursor-pointer rounded-2xl overflow-hidden shadow-lg shadow-black/30 h-[200px] md:h-full bg-zinc-900"
            onClick={() => router.push(`/${item.media_type || "movie"}/${item.id}`)}
          >
            <SafeImage
              src={item.poster_path ? `https://image.tmdb.org/t/p/w780${item.poster_path}` : `https://picsum.photos/seed/${item.id}/400/600`}
              alt={item.title || item.name}
              fallbackId={item.id}
              className="object-cover transition-transform duration-500 group-hover:scale-110 group-hover:brightness-50"
              sizes="(max-width: 768px) 50vw, 25vw"
            />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">
              <div className="bg-white/10 backdrop-blur-sm p-3 rounded-full border border-white/20">
                <Play className="w-6 h-6 text-white fill-white" />
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black via-black/90 to-transparent translate-y-4 group-hover:translate-y-0 transition-transform duration-300 z-10">
              <h4 className="text-lg font-bold text-white truncate drop-shadow-sm">
                {item.title || item.name}
              </h4>
              <div className="flex items-center justify-between text-xs text-zinc-300 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-75">
                <span className="flex items-center gap-1 text-yellow-400">
                  <Star className="w-3 h-3 fill-current" />
                  {item.vote_average?.toFixed(1)}
                </span>
                <span>
                  {new Date(item.release_date || item.first_air_date).getFullYear()}
                </span>
              </div>
            </div>
          </motion.div>
        ))}
        {/* Fill empty slots with placeholders if necessary */}
        {Array.from({ length: Math.max(0, 4 - (secondaryItems?.length || 0)) }).map((_, i) => (
          <div key={`placeholder-${i}`} className="hidden md:block md:col-span-1 md:row-span-1 bg-zinc-900/50 rounded-2xl" />
        ))}
      </motion.div>
    </div>
  );
};

export default FeaturedGrid;
