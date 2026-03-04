"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Play, Clock } from "lucide-react";
import Image from "next/image";
import { WatchHistoryItem } from "@/utils/historyManager";

interface HistoryCardProps {
  item: WatchHistoryItem;
}

const HistoryCard = ({ item }: HistoryCardProps) => {
  const router = useRouter();

  const posterUrl = item.poster_path
    ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
    : "https://picsum.photos/seed/poster/400/600";

  const handleResume = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Navigate to details page, maybe with a hash or query to auto-scroll/play
    router.push(`/${item.type}/${item.id}`);
  };

  return (
    <div
      className="relative flex flex-col gap-3 cursor-pointer group/card w-full flex-shrink-0"
      onClick={handleResume}
    >
      {/* Poster Container */}
      <div className="relative w-full aspect-[2/3] rounded-xl overflow-hidden shadow-lg bg-[#1a1a1a] transition-all duration-300 ease-in-out group-hover/card:shadow-[0_0_20px_rgba(229,9,20,0.4)] group-hover/card:scale-105 border border-white/5">
        <Image
          src={posterUrl}
          alt={item.title}
          fill
          className="object-cover transition-transform duration-300 ease-in-out opacity-80 group-hover/card:opacity-100"
          referrerPolicy="no-referrer"
        />
        
        {/* Progress Bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-800">
           <div 
             className="h-full bg-[#E50914]" 
             style={{ width: item.duration && item.timestamp ? `${(item.timestamp / item.duration) * 100}%` : '0%' }}
           />
        </div>

        {/* Play Button Overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 bg-black/40 backdrop-blur-[2px]">
          <div className="w-12 h-12 rounded-full bg-[#E50914] flex items-center justify-center transform scale-0 group-hover/card:scale-100 transition-transform duration-300 shadow-lg">
            <Play className="w-6 h-6 text-white fill-current ml-1" />
          </div>
        </div>

        {/* Badge for Season/Episode if TV */}
        {item.type === 'tv' && item.season && item.episode && (
          <div className="absolute top-2 right-2 z-10">
            <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white bg-black/60 backdrop-blur-md rounded-md border border-white/10">
              S{item.season} E{item.episode}
            </span>
          </div>
        )}
        
        {/* Provider Badge */}
        {item.provider && (
           <div className="absolute bottom-3 left-2 z-10">
            <span className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-zinc-300 bg-black/80 backdrop-blur-md rounded-md border border-white/5 flex items-center gap-1">
              <Play className="w-2 h-2 fill-current" />
              {item.provider}
            </span>
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="flex flex-col px-1">
        <h3 className="text-sm font-semibold text-white truncate group-hover/card:text-[#E50914] transition-colors duration-300">
          {item.title}
        </h3>
        <div className="flex items-center justify-between mt-1 opacity-60 group-hover/card:opacity-100 transition-opacity duration-300">
          <span className="text-xs text-zinc-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Reprendre
          </span>
        </div>
      </div>
    </div>
  );
};

export default HistoryCard;
