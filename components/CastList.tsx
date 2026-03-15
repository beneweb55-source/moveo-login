"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { User } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface CastListProps {
  cast: any[];
}

const CastList = ({ cast }: CastListProps) => {
  const router = useRouter();
  const { t } = useLanguage();

  if (!cast || cast.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-1 h-6 bg-[#E50914] rounded-full"></div>
        <h2 className="text-xl font-bold text-white">{t.home.cast}</h2>
      </div>
      <div className="flex overflow-x-auto gap-4 pb-4 snap-x [&::-webkit-scrollbar]:hidden">
        {cast.slice(0, 15).map((actor) => (
          <div
            key={actor.id}
            onClick={() => router.push('/person/' + actor.id)}
            className="flex-shrink-0 snap-start w-20 md:w-24 text-center cursor-pointer group"
          >
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-full mx-auto border-2 border-transparent group-hover:border-[#E50914] group-hover:ring-2 group-hover:ring-[#E50914] transition-all duration-300 hover:scale-105 overflow-hidden relative bg-zinc-700 flex items-center justify-center">
              {actor.profile_path ? (
                <Image
                  src={`https://image.tmdb.org/t/p/w185${actor.profile_path}`}
                  alt={actor.name}
                  fill
                  className="object-cover"
                />
              ) : (
                <User className="w-8 h-8 text-white/50" />
              )}
            </div>
            <p className="text-xs font-bold text-white mt-2 truncate w-full">{actor.name}</p>
            <p className="text-[10px] text-zinc-400 truncate w-full">{actor.character}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CastList;
