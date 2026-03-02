"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Play, Star } from "lucide-react";
import Image from "next/image";
import { useLanguage } from "@/context/LanguageContext";

interface MovieCardProps {
  data: any;
  mediaType?: string;
}

const MovieCard = ({ data, mediaType }: MovieCardProps) => {
  const router = useRouter();
  const { t } = useLanguage();

  const posterUrl = data.poster_path
    ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
    : "https://picsum.photos/seed/poster/400/600";

  const releaseYear = data.release_date
    ? new Date(data.release_date).getFullYear()
    : data.first_air_date
    ? new Date(data.first_air_date).getFullYear()
    : "N/A";

  const rating = data.vote_average ? data.vote_average.toFixed(1) : "NR";
  const type = data.media_type || mediaType || "movie";

  return (
    <div
      className="relative flex flex-col gap-3 cursor-pointer group/card w-full flex-shrink-0"
      onClick={() => router.push(`/${type}/${data.id}`)}
    >
      {/* Poster Container */}
      <div className="relative w-full aspect-[2/3] rounded-xl overflow-hidden shadow-lg bg-[#1a1a1a] transition-all duration-300 ease-out group-hover/card:shadow-[0_0_20px_rgba(229,9,20,0.4)] group-hover/card:scale-[1.05]">
        <Image
          src={posterUrl}
          alt={data.title || data.name || t.details.noPoster}
          fill
          className="object-cover transition-transform duration-500 group-hover/card:scale-110"
          referrerPolicy="no-referrer"
        />
        
        {/* Badge for Media Type */}
        <div className="absolute top-2 left-2 z-10 opacity-100 transition-opacity duration-300 group-hover/card:opacity-0">
          <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white bg-black/60 backdrop-blur-md rounded-md border border-white/10">
            {type === 'tv' ? 'Série' : 'Film'}
          </span>
        </div>

        {/* Dark Overlay & Play Button on Hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-[#E50914] flex items-center justify-center shadow-lg transform scale-50 opacity-0 group-hover/card:scale-100 group-hover/card:opacity-100 transition-all duration-300 delay-75">
            <Play className="w-5 h-5 text-white fill-current ml-0.5" />
          </div>
        </div>
      </div>

      {/* Info Section */}
      <div className="flex flex-col px-1">
        <h3 className="text-base font-semibold text-white truncate group-hover/card:text-[#E50914] transition-colors duration-300">
          {data.title || data.name}
        </h3>
        <div className="flex items-center justify-between mt-1">
          <span className="text-sm text-white/50">{releaseYear}</span>
          <div className="flex items-center gap-1">
            <Star className="w-3.5 h-3.5 text-yellow-500 fill-current" />
            <span className="text-sm font-bold text-white/90">{rating}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MovieCard;
