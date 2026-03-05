"use client";

import React, { useState, useEffect } from "react";
import { fetchDataFromApi } from "@/utils/api";
import ContentWrapper from "@/components/ContentWrapper";
import MovieCard from "@/components/MovieCard";
import InfiniteScroll from "react-infinite-scroll-component";
import { Loader2, ChevronDown } from "lucide-react";
import HeroBanner from "@/components/HeroBanner";
import { motion } from "motion/react";

const sortOptions = [
  { value: "popularity.desc", label: "Popularité" },
  { value: "vote_average.desc", label: "Note" },
  { value: "first_air_date.desc", label: "Date de sortie" },
];

const KDramaPage = () => {
  const [data, setData] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [loading, setLoading] = useState(false);
  const [mediaType, setMediaType] = useState<"tv" | "movie">("tv");
  const [sortBy, setSortBy] = useState("popularity.desc");

  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      try {
        const sortKey = mediaType === "movie" && sortBy === "first_air_date.desc" 
          ? "release_date.desc" 
          : sortBy;

        const res = await fetchDataFromApi(`/discover/${mediaType}`, {
          with_original_language: "ko",
          sort_by: sortKey,
          page: 1,
        });
        setData(res);
        setPageNum(1);
      } catch (error) {
        console.error("Error fetching K-Dramas:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, [mediaType, sortBy]);

  const fetchNextPageData = async () => {
    try {
      const sortKey = mediaType === "movie" && sortBy === "first_air_date.desc" 
        ? "release_date.desc" 
        : sortBy;

      const res = await fetchDataFromApi(`/discover/${mediaType}`, {
        with_original_language: "ko",
        sort_by: sortKey,
        page: pageNum + 1,
      });
      
      if (data?.results) {
        setData({
          ...data,
          results: [...data.results, ...res.results],
        });
      } else {
        setData(res);
      }
      setPageNum((prev) => prev + 1);
    } catch (error) {
      console.error("Error fetching next page:", error);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <HeroBanner endpoint="/discover/tv" params={{ with_original_language: "ko" }} />
      
      <div className="pt-10 pb-10">
        <ContentWrapper>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
            <h2 className="text-3xl md:text-4xl font-bold text-white capitalize tracking-tight flex items-center gap-2">
              K-Dramas
            </h2>
            
            <div className="flex flex-wrap items-center gap-4 justify-end w-full md:w-auto">
               {/* Media Type Toggle */}
               <div className="bg-zinc-900 p-1 rounded-xl flex items-center border border-zinc-800 shadow-lg">
                  <button 
                      onClick={() => setMediaType("tv")}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${mediaType === "tv" ? "bg-[#E50914] text-white shadow-md" : "text-zinc-400 hover:text-white"}`}
                  >
                      Séries
                  </button>
                  <button 
                      onClick={() => setMediaType("movie")}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${mediaType === "movie" ? "bg-[#E50914] text-white shadow-md" : "text-zinc-400 hover:text-white"}`}
                  >
                      Films
                  </button>
              </div>

              {/* Sort By Select */}
              <div className="relative group">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="appearance-none bg-zinc-900 text-white px-6 py-3 pr-12 rounded-xl border border-zinc-800 focus:border-[#E50914] focus:outline-none cursor-pointer hover:bg-zinc-800 transition-all duration-300 text-sm font-medium min-w-[160px] shadow-lg"
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none group-hover:text-[#E50914] transition-colors" />
              </div>
            </div>
          </div>

          {loading && !data ? (
            <div className="flex items-center justify-center h-[50vh]">
              <Loader2 className="w-10 h-10 text-[#E50914] animate-spin" />
            </div>
          ) : (
            <>
              {data?.results?.length > 0 ? (
                <InfiniteScroll
                  className="content-grid"
                  dataLength={data?.results?.length || 0}
                  next={fetchNextPageData}
                  hasMore={pageNum < (data?.total_pages || 1)}
                  loader={
                    <div className="flex items-center justify-center p-4 col-span-full">
                      <Loader2 className="w-6 h-6 text-[#E50914] animate-spin" />
                    </div>
                  }
                >
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
                    {data?.results?.map((item: any, index: number) => {
                      if (!item.poster_path) return null;
                      return (
                        <motion.div
                          key={`${item.id}-${index}`}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4, delay: index % 10 * 0.05 }}
                        >
                          <MovieCard
                            data={item}
                            mediaType={mediaType}
                          />
                        </motion.div>
                      );
                    })}
                  </div>
                </InfiniteScroll>
              ) : (
                <div className="text-center text-white/50 py-20">
                  Aucun résultat trouvé.
                </div>
              )}
            </>
          )}
        </ContentWrapper>
      </div>
    </div>
  );
};

export default KDramaPage;
