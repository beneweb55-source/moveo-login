"use client";

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface CastListProps {
  cast: any[];
}

const CastList = ({ cast }: CastListProps) => {
  const router = useRouter();
  const { t } = useLanguage();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const validCast = cast?.filter((actor) => actor.profile_path) || [];

  if (validCast.length === 0) return null;

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const { current } = scrollContainerRef;
      const scrollAmount = direction === 'left' ? -current.offsetWidth * 0.75 : current.offsetWidth * 0.75;
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
    const walk = (x - startX) * 1.5;
    scrollContainerRef.current.scrollLeft = scrollLeft - walk;
  };

  return (
    <div className="mt-16 md:mt-24 relative">
      <div className="flex items-end justify-between mb-8 md:mb-10">
        <h2 className="text-2xl md:text-3xl font-semibold text-white tracking-tight">
          {t.home.cast || "Cast & Crew"}
        </h2>
        
        {/* Navigation Buttons for Desktop */}
        <div className="hidden md:flex items-center gap-2">
          <button 
            onClick={() => scroll('left')}
            className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 hover:border-zinc-700 transition-all"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button 
            onClick={() => scroll('right')}
            className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 hover:border-zinc-700 transition-all"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
      
      <div className="relative -mx-4 sm:mx-0">
        <div 
          ref={scrollContainerRef}
          className={`flex overflow-x-auto gap-4 md:gap-8 pb-6 px-4 sm:px-0 scrollbar-hide ${isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
          onMouseDown={handleMouseDown}
          onMouseLeave={handleMouseLeave}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
          style={{ scrollBehavior: isDragging ? 'auto' : 'smooth' }}
        >
          {validCast.map((actor) => (
            <div
              key={actor.id}
              onClick={() => {
                if (!isDragging) router.push('/person/' + actor.id);
              }}
              className="flex-shrink-0 w-[100px] md:w-[140px] flex flex-col items-center group cursor-pointer"
            >
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-full overflow-hidden relative bg-zinc-900 border border-zinc-800 group-hover:border-zinc-500 transition-colors duration-300 shadow-lg">
                <Image
                  src={`https://image.tmdb.org/t/p/w300${actor.profile_path}`}
                  alt={actor.name}
                  fill
                  draggable={false}
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="mt-4 text-center w-full px-1">
                <p className="text-sm md:text-base font-medium text-zinc-100 line-clamp-1 group-hover:text-white transition-colors">
                  {actor.name}
                </p>
                <p className="text-xs md:text-sm text-zinc-500 line-clamp-2 mt-1 leading-snug">
                  {actor.character}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CastList;
