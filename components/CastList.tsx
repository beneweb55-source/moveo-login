"use client";

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { motion } from 'motion/react';

interface CastListProps {
  cast: any[];
}

const CastList = ({ cast }: CastListProps) => {
  const router = useRouter();
  const { t, language } = useLanguage();
  const [showAll, setShowAll] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Drag to scroll state
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const validCast = cast?.filter((actor) => actor.profile_path) || [];

  if (validCast.length === 0) return null;

  const initialCount = 14;
  const displayedCast = showAll ? validCast : validCast.slice(0, initialCount);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const { current } = scrollContainerRef;
      const scrollAmount = direction === 'left' ? -current.offsetWidth / 2 : current.offsetWidth / 2;
      current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
    setScrollLeft(scrollContainerRef.current.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX) * 2; // Scroll-fast
    scrollContainerRef.current.scrollLeft = scrollLeft - walk;
  };

  return (
    <div className="mt-12 md:mt-20 relative">
      <div className="flex items-center justify-between mb-6 md:mb-8">
        <div className="flex items-center gap-4">
          <div className="w-1.5 h-8 md:h-10 bg-[#E50914] rounded-full shadow-[0_0_15px_rgba(229,9,20,0.5)]"></div>
          <h2 className="text-2xl md:text-3xl font-black text-white tracking-tighter uppercase">{t.home.cast}</h2>
        </div>
        
        {/* Navigation Buttons for Desktop */}
        <div className="hidden md:flex items-center gap-2">
          <button 
            onClick={() => scroll('left')}
            className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/20 hover:border-white/30 transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button 
            onClick={() => scroll('right')}
            className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/20 hover:border-white/30 transition-all"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
      
      <div className="relative group/cast -mx-4 sm:mx-0">
        <div 
          ref={scrollContainerRef}
          className={`flex overflow-x-auto gap-4 md:gap-6 pb-8 px-4 sm:px-0 scrollbar-hide snap-x snap-mandatory ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          onMouseDown={handleMouseDown}
          onMouseLeave={handleMouseLeave}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
          style={{ scrollBehavior: isDragging ? 'auto' : 'smooth' }}
        >
          {displayedCast.map((actor) => (
            <motion.div
              key={actor.id}
              whileHover={{ scale: 1.05, y: -5 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                if (!isDragging) router.push('/person/' + actor.id);
              }}
              className="flex-shrink-0 w-[110px] md:w-[140px] flex flex-col snap-start group"
            >
              <div className="w-full aspect-[2/3] rounded-xl overflow-hidden relative bg-zinc-900 shadow-lg mb-3 border border-white/5 group-hover:border-white/20 transition-colors pointer-events-none">
                <Image
                  src={`https://image.tmdb.org/t/p/w185${actor.profile_path}`}
                  alt={actor.name}
                  fill
                  draggable={false}
                  className="object-cover transition-transform duration-700 group-hover:scale-110"
                  referrerPolicy="no-referrer"
                />
              </div>
              <p className="text-sm md:text-base font-bold text-white line-clamp-2 leading-tight select-none">{actor.name}</p>
              <p className="text-xs md:text-sm text-white/50 mt-1 line-clamp-2 select-none">{actor.character}</p>
            </motion.div>
          ))}
          
          {validCast.length > initialCount && !showAll && (
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                if (!isDragging) setShowAll(true);
              }}
              className="flex-shrink-0 w-[110px] md:w-[140px] flex flex-col snap-start group"
            >
              <div className="w-full aspect-[2/3] rounded-xl border border-white/10 group-hover:border-white/30 transition-all duration-500 relative bg-white/5 backdrop-blur-sm flex flex-col items-center justify-center shadow-lg mb-3 text-white pointer-events-none">
                <ChevronDown className="w-8 h-8 md:w-10 md:h-10 mb-2 transition-transform duration-500 group-hover:translate-y-1" />
                <span className="text-xs md:text-sm font-bold uppercase tracking-widest select-none">{language === 'fr' ? 'Plus' : 'More'}</span>
              </div>
              <p className="text-sm md:text-base font-bold text-white/60 select-none text-center w-full">
                {language === 'fr' ? 'Voir tout' : 'Show all'}
              </p>
            </motion.div>
          )}
        </div>
        
        {/* Right fade mask for desktop to indicate scroll */}
        <div className="hidden sm:block absolute top-0 right-0 bottom-0 w-24 bg-gradient-to-l from-[#0A0A0A] to-transparent pointer-events-none z-10" />
      </div>
    </div>
  );
};

export default CastList;
