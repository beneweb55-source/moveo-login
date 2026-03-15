"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Play, Star } from "lucide-react";
import Image from "next/image";

interface HomeMovieCardProps {
  data: any;
}

const HomeMovieCard = ({ data }: HomeMovieCardProps) => {
  const router = useRouter();

  const posterUrl = data.poster_path
    ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
    : "https://picsum.photos/seed/poster/400/600";

  const releaseYear = data.release_date
    ? new Date(data.release_date).getFullYear()
    : data.first_air_date
    ? new Date(data.first_air_date).getFullYear()
    : "N/A";

  const rating = data.vote_average ? data.vote_average.toFixed(1) : "NR";

  return (
    <div
      className="relative flex flex-col gap-3 cursor-pointer group"
      onClick={() => router.push(`/${data.media_type || "movie"}/${data.id}`)}
    >
      {/* Poster Container */}
      <div className="relative w-full aspect-[2/3] rounded-xl overflow-hidden shadow-lg bg-[#1a1a1a]">
        <Image
          src={posterUrl}
          alt={data.title || data.name || "Movie poster"}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-110"
          referrerPolicy="no-referrer"
        />
        
        {/* Dark Overlay & Play Button on Hover */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
          <Play className="w-14 h-14 text-[#E50914] fill-current transform scale-50 group-hover:scale-100 transition-transform duration-300" />
        </div>
        
        {/* Rating Badge */}
        <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-md px-2 py-1 rounded-md flex items-center gap-1">
          <Star className="w-3.5 h-3.5 text-yellow-500 fill-current" />
          <span className="text-xs font-bold text-white">{rating}</span>
        </div>
      </div>

      {/* Info Section */}
      <div className="flex flex-col">
        <h3 className="text-base font-semibold text-white truncate group-hover:text-[#E50914] transition-colors">
          {data.title || data.name}
        </h3>
        <span className="text-sm text-white/50">{releaseYear}</span>
      </div>
    </div>
  );
};

export default HomeMovieCard;
