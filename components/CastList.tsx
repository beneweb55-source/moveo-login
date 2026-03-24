"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { User, ChevronDown, ChevronUp } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { motion } from 'motion/react';

interface CastListProps {
  cast: any[];
}

const CastList = ({ cast }: CastListProps) => {
  const router = useRouter();
  const { t, language } = useLanguage();
  const [showAll, setShowAll] = useState(false);

  const validCast = cast?.filter((actor) => actor.profile_path) || [];

  if (validCast.length === 0) return null;

  const initialCount = 14;
  const displayedCast = showAll ? validCast : validCast.slice(0, initialCount);

  return (
    <div className="mt-12 md:mt-20">
      <div className="flex items-center gap-4 mb-8 md:mb-12">
        <div className="w-1.5 h-8 md:h-10 bg-[#E50914] rounded-full shadow-[0_0_15px_rgba(229,9,20,0.5)]"></div>
        <h2 className="text-2xl md:text-4xl font-black text-white tracking-tighter uppercase">{t.home.cast}</h2>
      </div>
      
      <div className="relative group/cast">
        <div className="flex overflow-x-auto gap-6 md:gap-10 pb-8 md:pb-12 scrollbar-hide snap-x snap-mandatory -mx-4 px-4 sm:mx-0 sm:px-0">
          {validCast.map((actor) => (
            <motion.div
              key={actor.id}
              whileHover={{ scale: 1.05, y: -5 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => router.push('/person/' + actor.id)}
              className="flex-shrink-0 w-[120px] md:w-[160px] flex flex-col items-center text-center cursor-pointer snap-start"
            >
              <div className="w-[120px] h-[120px] md:w-[160px] md:h-[160px] rounded-full mx-auto border-2 border-white/5 hover:border-[#E50914] transition-all duration-500 overflow-hidden relative bg-zinc-900 shadow-2xl mb-4 md:mb-6 ring-offset-4 ring-offset-black hover:ring-2 hover:ring-[#E50914]">
                <Image
                  src={`https://image.tmdb.org/t/p/w185${actor.profile_path}`}
                  alt={actor.name}
                  fill
                  className="object-cover transition-transform duration-700 hover:scale-110"
                  referrerPolicy="no-referrer"
                />
              </div>
              <p className="text-sm md:text-lg font-black text-white line-clamp-1 leading-tight w-full tracking-tight">{actor.name}</p>
              <p className="text-[10px] md:text-sm text-white/40 font-bold uppercase tracking-widest mt-2 w-full line-clamp-1">{actor.character}</p>
            </motion.div>
          ))}
          
          {validCast.length > initialCount && !showAll && (
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowAll(true)}
              className="flex-shrink-0 w-[120px] md:w-[160px] flex flex-col items-center text-center cursor-pointer snap-start"
            >
              <div className="w-[120px] h-[120px] md:w-[160px] md:h-[160px] rounded-full mx-auto border-2 border-white/10 hover:border-[#E50914] transition-all duration-500 relative bg-white/5 backdrop-blur-2xl flex flex-col items-center justify-center shadow-2xl mb-4 md:mb-6 text-white group">
                <ChevronDown className="w-8 h-8 md:w-10 md:h-10 mb-1 transition-transform duration-500 group-hover:translate-y-1" />
                <span className="text-xs md:text-sm font-black uppercase tracking-widest">{language === 'fr' ? 'Plus' : 'More'}</span>
              </div>
              <p className="text-sm md:text-lg font-black text-white/60 tracking-tight">
                {language === 'fr' ? 'Voir tout' : 'Show all'}
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CastList;
