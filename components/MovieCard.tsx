"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Play, Star } from "lucide-react";
import Image from "next/image";
import { useLanguage } from "@/context/LanguageContext";
import { useSelector } from "react-redux";

interface MovieCardProps {
  data: any;
  mediaType?: string;
}

const MovieCard = ({ data, mediaType }: MovieCardProps) => {
  const router = useRouter();
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
    <div
      className="relative flex flex-col gap-3 cursor-pointer group/card w-full flex-shrink-0"
      onClick={() => router.push(`/${type}/${data.id}`)}
    >
      {/* Poster Container */}
      <div className="relative w-full aspect-[2/3] rounded-xl overflow-hidden shadow-lg bg-[#1a1a1a] transition-all duration-300 ease-in-out group-hover/card:shadow-[0_0_20px_rgba(229,9,20,0.4)] group-hover/card:scale-105">
        <Image
          src={errored ? `https://picsum.photos/seed/${data.id}/400/600` : posterUrl}
          alt={data.title || data.name || t.details.noPoster}
          fill
          className="object-cover transition-transform duration-300 ease-in-out"
          referrerPolicy="no-referrer"
          onError={() => setErrored(true)}
        />

        {/* Dark Overlay & Play Button on Hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-[#E50914] flex items-center justify-center transform scale-0 group-hover/card:scale-100 transition-transform duration-300 delay-75 shadow-lg">
            <Play className="w-6 h-6 text-white fill-current ml-1" />
          </div>
        </div>
      </div>

      {/* Info Section */}
      <div className="flex flex-col px-1">
        <h3 className="text-sm md:text-base font-semibold text-white truncate group-hover/card:text-[#E50914] transition-colors duration-300">
          {data.title || data.name}
        </h3>
        <div className="flex items-center justify-between mt-0.5 md:mt-1 opacity-60 group-hover/card:opacity-100 transition-opacity duration-300">
          <span className="text-[10px] md:text-sm text-white">{releaseYear}</span>
          <div className="flex items-center gap-1">
            <Star className="w-3 md:w-3.5 h-3 md:h-3.5 text-yellow-500 fill-current" />
            <span className="text-[10px] md:text-sm font-bold text-white">{rating}</span>
          </div>
        </div>
        {/* Genre Pills */}
        {movieGenres.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300">
            {movieGenres.map((genre: any, i: number) => (
              <span key={i} className="bg-white/10 text-white/70 text-[9px] font-medium px-2 py-0.5 rounded-full border border-white/10">
                {genre}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MovieCard;
