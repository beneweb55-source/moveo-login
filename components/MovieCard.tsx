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
      className="relative flex flex-col gap-3 cursor-pointer group w-full flex-shrink-0"
      onClick={() => router.push(`/${type}/${data.id}`)}
    >
      {/* Poster Container */}
      <div className="relative w-full aspect-[2/3] rounded-xl overflow-hidden shadow-lg bg-[#1a1a1a]">
        <Image
          src={posterUrl}
          alt={data.title || data.name || t.details.noPoster}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-110"
          referrerPolicy="no-referrer"
        />
        
        {/* Dark Overlay & Play Button on Hover */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
          <Play className="w-14 h-14 text-[#E50914] fill-current transform scale-50 group-hover:scale-100 transition-transform duration-300" />
        </div>
      </div>

      {/* Info Section */}
      <div className="flex flex-col px-1">
        <h3 className="text-base font-semibold text-white truncate group-hover:text-[#E50914] transition-colors">
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
