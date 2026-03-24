"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import InfiniteScroll from "react-infinite-scroll-component";
import { fetchDataFromApi } from "@/utils/api";
import ContentWrapper from "@/components/ContentWrapper";
import MovieCard from "@/components/MovieCard";
import SkeletonCard from "@/components/SkeletonCard";
import { useLanguage } from "@/context/LanguageContext";
import { ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import { sortItems, getUserWatchedIds, extractUserGenresFromItems, mixCatalog } from "@/utils/sorting";

interface Genre {
  id: number;
  name: string;
}

const sortOptions = [
  { value: "popularity.desc", label: "popularity" },
  { value: "vote_average.desc", label: "rating" },
  { value: "primary_release_date.desc", label: "releaseDate" },
];

const Explore = () => {
  const [data, setData] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [loading, setLoading] = useState(false);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("popularity.desc");
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const [userGenres, setUserGenres] = useState<Set<number>>(new Set());
  
  const { mediaType } = useParams();
  const { language, t } = useLanguage();

  // Fetch Watched IDs on mount
  useEffect(() => {
    getUserWatchedIds().then(ids => setWatchedIds(ids));
  }, []);

  // Fetch Genres
  useEffect(() => {
    const fetchGenres = async () => {
      const langParam = language === 'fr' ? 'fr-FR' : 'en-US';
      const res = await fetchDataFromApi(`/genre/${mediaType}/list`, { language: langParam });
      if (res?.genres) {
        setGenres(res.genres);
      }
    };
    fetchGenres();
  }, [mediaType, language]);

  // Fetch Initial Data
  useEffect(() => {
    const fetchInitialData = () => {
      setLoading(true);
      setData(null);
      setPageNum(1);

      const langParam = language === 'fr' ? 'fr-FR' : 'en-US';
      const now = new Date().toISOString().split('T')[0];
      
      let finalSortBy = sortBy;
      if (sortBy === "primary_release_date.desc" && mediaType === "tv") {
        finalSortBy = "first_air_date.desc";
      }

      const params: any = {
        language: langParam,
        sort_by: finalSortBy,
      };

      // Add date limit to avoid future releases filling the first page
      if (mediaType === "movie") {
        params["primary_release_date.lte"] = now;
      } else {
        params["first_air_date.lte"] = now;
      }
      
      if (sortBy === "vote_average.desc") {
        params["vote_count.gte"] = 200;
      }

      if (selectedGenre) {
        params.with_genres = selectedGenre;
      }

      fetchDataFromApi(`/discover/${mediaType}`, params).then((res) => {
        const newGenres = extractUserGenresFromItems(res?.results || [], watchedIds);
        const updatedUserGenres = new Set([...userGenres, ...newGenres]);
        setUserGenres(updatedUserGenres);

        if (res?.results) {
            const sorted = sortItems(res.results, updatedUserGenres, { sortBy: finalSortBy });
            res.results = finalSortBy === "popularity.desc" ? mixCatalog(sorted) : sorted;
        }

        setData(res);
        setPageNum(2);
        setLoading(false);
      });
    };

    fetchInitialData();
  }, [mediaType, language, sortBy, selectedGenre, watchedIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchNextPageData = () => {
    const langParam = language === 'fr' ? 'fr-FR' : 'en-US';
    const now = new Date().toISOString().split('T')[0];
    
    let finalSortBy = sortBy;
    if (sortBy === "primary_release_date.desc" && mediaType === "tv") {
      finalSortBy = "first_air_date.desc";
    }

    const params: any = {
      language: langParam,
      sort_by: finalSortBy,
      page: pageNum,
    };

    // Add date limit to avoid future releases filling the first page
    if (mediaType === "movie") {
      params["primary_release_date.lte"] = now;
    } else {
      params["first_air_date.lte"] = now;
    }
    
    if (sortBy === "vote_average.desc") {
      params["vote_count.gte"] = 200;
    }

    if (selectedGenre) {
      params.with_genres = selectedGenre;
    }

    fetchDataFromApi(`/discover/${mediaType}`, params).then(
      (res) => {
        if (data?.results) {
          const newGenres = extractUserGenresFromItems(res?.results || [], watchedIds);
          const updatedUserGenres = new Set([...userGenres, ...newGenres]);
          setUserGenres(updatedUserGenres);

          const sortedNewResults = sortItems(res.results, updatedUserGenres, { sortBy: finalSortBy });
          const mixedNewResults = finalSortBy === "popularity.desc" ? mixCatalog(sortedNewResults) : sortedNewResults;

          setData({
            ...data,
            results: [...data?.results, ...mixedNewResults],
          });
        } else {
          setData(res);
        }
        setPageNum((prev) => prev + 1);
      }
    );
  };

  return (
    <div className="min-h-screen pt-[120px] pb-20 bg-[#0A0A0A]">
      <ContentWrapper>
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-12 md:mb-20 gap-8">
          <h1 className="text-4xl md:text-6xl font-black text-white capitalize tracking-tighter">
            {mediaType === "tv" ? t.explore.exploreTv : t.explore.exploreMovies}
          </h1>
          
          <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
            <div className="relative group flex-1 sm:flex-none">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full appearance-none bg-white/5 backdrop-blur-2xl text-white px-6 py-4 pr-12 rounded-2xl border border-white/10 focus:border-[#E50914] focus:outline-none cursor-pointer hover:bg-white/10 transition-all duration-500 text-sm font-black uppercase tracking-widest sm:min-w-[200px] shadow-2xl"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value} className="bg-zinc-900">
                    {t.explore.sortOptions[option.label as keyof typeof t.explore.sortOptions]}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50 pointer-events-none group-hover:text-[#E50914] transition-colors" />
            </div>

            <div className="relative group flex-1 sm:flex-none">
              <select
                value={selectedGenre}
                onChange={(e) => setSelectedGenre(e.target.value)}
                className="w-full appearance-none bg-white/5 backdrop-blur-2xl text-white px-6 py-4 pr-12 rounded-2xl border border-white/10 focus:border-[#E50914] focus:outline-none cursor-pointer hover:bg-white/10 transition-all duration-500 text-sm font-black uppercase tracking-widest sm:min-w-[200px] lg:max-w-[300px] shadow-2xl"
              >
                <option value="" className="bg-zinc-900">{t.explore.allGenres}</option>
                {genres.map((genre) => (
                  <option key={genre.id} value={genre.id} className="bg-zinc-900">
                    {genre.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50 pointer-events-none group-hover:text-[#E50914] transition-colors" />
            </div>
          </div>
        </div>

        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 md:gap-10">
            {[...Array(12)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}
        
        {!loading && (
          <>
            {data?.results?.length > 0 ? (
              <InfiniteScroll
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 md:gap-10"
                dataLength={data?.results?.length || 0}
                next={fetchNextPageData}
                hasMore={pageNum <= data?.total_pages}
                loader={
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 md:gap-10 mt-10 col-span-full w-full">
                    {[...Array(6)].map((_, i) => (
                      <SkeletonCard key={i} />
                    ))}
                  </div>
                }
                scrollThreshold="800px"
              >
                {data?.results?.map((item: any, index: number) => {
                  if (item.media_type === "person") return null;
                  return (
                    <motion.div
                      key={`${item.id}-${index}`}
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, delay: (index % 12) * 0.05, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <MovieCard
                        data={item}
                        mediaType={mediaType as string}
                      />
                    </motion.div>
                  );
                })}
              </InfiniteScroll>
            ) : (
              <div className="flex flex-col items-center justify-center py-40 text-center">
                <span className="text-4xl md:text-6xl text-white/20 font-black mb-6 tracking-tighter uppercase">
                  {t.explore.noResults}
                </span>
                <p className="text-white/30 text-xl md:text-2xl font-medium">{t.explore.tryAdjustingFilters}</p>
              </div>
            )}
          </>
        )}
      </ContentWrapper>
    </div>
  );
};

export default Explore;
