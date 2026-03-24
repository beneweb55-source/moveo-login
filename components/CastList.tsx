"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { User, ChevronDown, ChevronUp } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

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
    <div className="mt-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-6 bg-[#E50914] rounded-full"></div>
        <h2 className="text-xl font-bold text-white">{t.home.cast}</h2>
      </div>
      <div className="flex flex-wrap gap-4 md:gap-6 pb-6">
        {displayedCast.map((actor) => (
          <div
            key={actor.id}
            onClick={() => router.push('/person/' + actor.id)}
            className="w-[80px] md:w-[100px] flex flex-col items-center text-center cursor-pointer group"
          >
            <div className="w-[80px] h-[80px] md:w-[100px] md:h-[100px] rounded-full mx-auto border-2 border-transparent group-hover:border-[#E50914] group-hover:ring-2 group-hover:ring-[#E50914] transition-all duration-300 group-hover:scale-105 overflow-hidden relative bg-zinc-800 flex items-center justify-center shadow-lg mb-3">
              <Image
                src={`https://image.tmdb.org/t/p/w185${actor.profile_path}`}
                alt={actor.name}
                fill
                className="object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <p className="text-xs md:text-sm font-bold text-white line-clamp-2 leading-tight w-full">{actor.name}</p>
            <p className="text-[10px] md:text-xs text-zinc-400 line-clamp-2 leading-tight mt-1 w-full">{actor.character}</p>
          </div>
        ))}
        
        {validCast.length > initialCount && (
          <div
            onClick={() => setShowAll(!showAll)}
            className="w-[80px] md:w-[100px] flex flex-col items-center text-center cursor-pointer group"
          >
            <div className="w-[80px] h-[80px] md:w-[100px] md:h-[100px] rounded-full mx-auto border-2 border-zinc-700 group-hover:border-[#E50914] transition-all duration-300 group-hover:scale-105 relative bg-zinc-800/50 flex flex-col items-center justify-center shadow-lg mb-3 text-white">
              {showAll ? <ChevronUp className="w-6 h-6 mb-1" /> : <ChevronDown className="w-6 h-6 mb-1" />}
              <span className="text-xs font-bold">{showAll ? (language === 'fr' ? 'Moins' : 'Less') : `+${validCast.length - initialCount}`}</span>
            </div>
            <p className="text-xs md:text-sm font-bold text-white line-clamp-2 leading-tight w-full">
              {showAll ? (language === 'fr' ? 'Réduire' : 'Show less') : (language === 'fr' ? 'Voir tout' : 'Show all')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CastList;
