"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Play, Star } from "lucide-react";
import Image from "next/image";
import { useLanguage } from "@/context/LanguageContext";
import { useSelector } from "react-redux";

interface MovieCardProps {
  data: any;
  mediaType?: string;
}

const MovieCard = ({ data, mediaType }: MovieCardProps) => {
  const { t } = useLanguage();
  const { genres } = useSelector((state: any) => state.home);

  const getPosterUrl = (path: string | null, id: string | number) => 
    path ? `https://image.tmdb.org/t/p/w500${path}` : `https://picsum.photos/seed/${id}/400/600`;

  const [errored, setErrored] = useState(false);

  // Reset error state when data changes
  const [prevId, setPrevId] = useState(data.id);
  if (data.id !== prevId) {
    setPrevId(data.id);
    setErrored(false);
  }

  const posterUrl = errored 
    ? `https://picsum.photos/seed/${data.id}/400/600` 
    : getPosterUrl(data.poster_path, data.id);

  const releaseYear = data.release_date
    ? new Date(data.release_date).getFullYear()
    : data.first_air_date
    ? new Date(data.first_air_date).getFullYear()
    : "N/A";

  const rating = data.vote_average ? data.vote_average.toFixed(1) : "NR";
  const type = data.media_type || mediaType || "movie";

  const getGenreNames = (genreIds: number[]) => {
    if (!genreIds || !genres) return [];
    return genreIds.map((id: number) => genres[id]?.name || genres[id]).filter((g: any) => g).slice(0, 2);
  };

  const movieGenres = getGenreNames(data.genre_ids);

  return (
    <Link
      href={`/${type}/${data.id}`}
      className="relative flex flex-col gap-4 cursor-pointer group/card w-full flex-shrink-0 active:scale-95 transition-transform duration-200"
    >
      {/* Poster Container */}
      <div className="relative w-full aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl bg-[#1a1a1a] transition-all duration-500 ease-in-out group-hover/card:shadow-[0_0_30px_rgba(229,9,20,0.3)] group-hover/card:scale-105 border border-white/5">
        <Image
          src={errored ? `https://picsum.photos/seed/${data.id}/400/600` : posterUrl}
          alt={data.title || data.name || t.details.noPoster}
          fill
          className="object-cover transition-transform duration-700 ease-in-out group-hover/card:scale-110"
          referrerPolicy="no-referrer"
          onError={() => setErrored(true)}
        />

        {/* Dark Overlay & Play Button on Hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent opacity-0 sm:group-hover/card:opacity-100 transition-opacity duration-300 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-[#E50914] flex items-center justify-center transform scale-0 sm:group-hover/card:scale-100 transition-transform duration-500 delay-75 shadow-2xl">
            <Play className="w-7 h-7 text-white fill-current ml-1" />
          </div>
        </div>

        {/* Rating Badge on Mobile */}
        <div className="absolute top-2 right-2 sm:hidden bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10 flex items-center gap-1">
          <Star className="w-3 h-3 text-yellow-500 fill-current" />
          <span className="text-[10px] font-black text-white">{rating}</span>
        </div>
      </div>

      {/* Info Section */}
      <div className="flex flex-col px-1">
        <h3 className="text-lg sm:text-xl font-black text-white truncate group-hover/card:text-[#E50914] transition-colors duration-300 tracking-tight">
          {data.title || data.name}
        </h3>
        <div className="flex items-center justify-between mt-1.5 opacity-50 group-hover/card:opacity-100 transition-opacity duration-300">
          <span className="text-xs sm:text-sm font-bold text-white/70">{releaseYear}</span>
          <div className="hidden sm:flex items-center gap-1.5">
            <Star className="w-4 h-4 text-yellow-500 fill-current" />
            <span className="text-sm font-black text-white">{rating}</span>
          </div>
        </div>
        {/* Genre Pills */}
        {movieGenres.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2.5 lg:opacity-0 lg:group-hover/card:opacity-100 transition-all duration-500 translate-y-1 group-hover/card:translate-y-0">
            {movieGenres.map((genre: any, i: number) => (
              <span key={i} className="bg-white/5 text-white/60 text-[9px] sm:text-[10px] font-black px-2.5 py-1 rounded-lg border border-white/5 uppercase tracking-widest">
                {genre}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
};

export default MovieCard;
