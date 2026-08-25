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
      className="relative flex flex-col cursor-pointer group/card w-full flex-shrink-0"
    >
      <div className="relative w-full aspect-[2/3] overflow-hidden bg-moveo-surface rounded-xl transition-all duration-500 ease-out">
        <Image
          src={errored ? `https://picsum.photos/seed/${data.id}/400/600` : posterUrl}
          alt={data.title || data.name || t.details.noPoster}
          fill
          className="object-cover transition-transform duration-700 ease-out group-hover/card:scale-[1.03]"
          referrerPolicy="no-referrer"
          onError={() => setErrored(true)}
        />

        {/* Minimalist Hover Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 ease-out flex flex-col justify-end p-4 sm:p-5">
          <div className="translate-y-4 group-hover/card:translate-y-0 transition-transform duration-500 ease-out">
            <h3 className="text-white font-serif text-lg sm:text-xl font-medium leading-tight">
              {data.title || data.name}
            </h3>
            
            <div className="flex items-center gap-3 mt-2 text-xs text-white/70 font-sans tracking-wide">
              <span>{releaseYear}</span>
              {rating !== "NR" && (
                <div className="flex items-center gap-1">
                  <Star className="w-3 h-3 text-white fill-white" />
                  <span>{rating}</span>
                </div>
              )}
            </div>

            {movieGenres.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {movieGenres.map((genre: any, i: number) => (
                  <span key={i} className="text-[9px] uppercase tracking-widest text-white/50 border border-white/20 px-2 py-0.5 rounded-full">
                    {genre}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
};

export default MovieCard;
