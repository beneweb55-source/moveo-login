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
      const params: any = {
        language: langParam,
        sort_by: sortBy,
      };
      
      if (selectedGenre) {
        params.with_genres = selectedGenre;
      }

      fetchDataFromApi(`/discover/${mediaType}`, params).then((res) => {
        const newGenres = extractUserGenresFromItems(res?.results || [], watchedIds);
        const updatedUserGenres = new Set([...userGenres, ...newGenres]);
        setUserGenres(updatedUserGenres);

        if (res?.results) {
            const sorted = sortItems(res.results, updatedUserGenres);
            res.results = mixCatalog(sorted);
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
    const params: any = {
      language: langParam,
      sort_by: sortBy,
      page: pageNum,
    };
    
    if (selectedGenre) {
      params.with_genres = selectedGenre;
    }

    fetchDataFromApi(`/discover/${mediaType}`, params).then(
      (res) => {
        if (data?.results) {
          const newGenres = extractUserGenresFromItems(res?.results || [], watchedIds);
          const updatedUserGenres = new Set([...userGenres, ...newGenres]);
          setUserGenres(updatedUserGenres);

          const sortedNewResults = sortItems(res.results, updatedUserGenres);
          const mixedNewResults = mixCatalog(sortedNewResults);

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
    <div className="min-h-screen pt-[100px] pb-10 bg-[#0A0A0A]">
      <ContentWrapper>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
          <h1 className="text-3xl md:text-4xl font-bold text-white capitalize tracking-tight">
            {mediaType === "tv" ? t.explore.exploreTv : t.explore.exploreMovies}
          </h1>
          
          <div className="flex flex-wrap gap-4 w-full md:w-auto">
            <div className="relative group">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="appearance-none bg-zinc-900 text-white px-6 py-3 pr-12 rounded-xl border border-zinc-800 focus:border-[#E50914] focus:outline-none cursor-pointer hover:bg-zinc-800 transition-all duration-300 text-sm font-medium min-w-[160px] shadow-lg"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t.explore.sortOptions[option.label as keyof typeof t.explore.sortOptions]}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none group-hover:text-[#E50914] transition-colors" />
            </div>

            <div className="relative group">
              <select
                value={selectedGenre}
                onChange={(e) => setSelectedGenre(e.target.value)}
                className="appearance-none bg-zinc-900 text-white px-6 py-3 pr-12 rounded-xl border border-zinc-800 focus:border-[#E50914] focus:outline-none cursor-pointer hover:bg-zinc-800 transition-all duration-300 text-sm font-medium min-w-[160px] max-w-[240px] shadow-lg"
              >
                <option value="">{t.explore.allGenres}</option>
                {genres.map((genre) => (
                  <option key={genre.id} value={genre.id}>
                    {genre.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none group-hover:text-[#E50914] transition-colors" />
            </div>
          </div>
        </div>

        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-8">
            {[...Array(10)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}
        
        {!loading && (
          <>
            {data?.results?.length > 0 ? (
              <InfiniteScroll
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-8"
                dataLength={data?.results?.length || 0}
                next={fetchNextPageData}
                hasMore={pageNum <= data?.total_pages}
                loader={
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-8 mt-6 col-span-full w-full">
                    {[...Array(5)].map((_, i) => (
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
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: index % 10 * 0.05 }}
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
              <div className="flex flex-col items-center justify-center py-32 text-center">
                <span className="text-3xl text-white/40 font-bold mb-4">
                  {t.explore.noResults}
                </span>
                <p className="text-white/30 text-lg">{t.explore.tryAdjustingFilters}</p>
              </div>
            )}
          </>
        )}
      </ContentWrapper>
    </div>
  );
};

export default Explore;
