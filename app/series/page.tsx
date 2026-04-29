"use client";

import { useState, useEffect, useRef } from "react";
import InfiniteScroll from "react-infinite-scroll-component";
import { fetchDataFromApi } from "@/utils/api";
import ContentWrapper from "@/components/ContentWrapper";
import MovieCard from "@/components/MovieCard";
import { useLanguage } from "@/context/LanguageContext";
import { ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import HeroBanner from "@/components/HeroBanner";
import SkeletonCard from "@/components/SkeletonCard";
import { sortItems, getUserWatchedIds, extractUserGenresFromItems, mixCatalog } from "@/utils/sorting";

const sortOptions = [
  { value: "popularity.desc", label: "popularity" },
  { value: "vote_average.desc", label: "rating" },
  { value: "first_air_date.desc", label: "releaseDate" },
];

const Series = () => {
  const [data, setData] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<string>("popularity.desc");
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const userGenresRef = useRef<Set<number>>(new Set());
  const [genres, setGenres] = useState<any[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<string>("");
  const pageRef = useRef(1);
  
  const { language, t } = useLanguage();

  useEffect(() => {
    const fetchGenres = async () => {
      const langParam = language === 'fr' ? 'fr-FR' : 'en-US';
      const res = await fetchDataFromApi(`/genre/tv/list`, { language: langParam });
      if (res?.genres) {
        setGenres(res.genres.filter((g: any) => g.id !== 16)); // Exclude Animation (16) if desired, user said without_genres: 16
      }
    };
    fetchGenres();
  }, [language]);

  useEffect(() => {
    getUserWatchedIds().then(ids => setWatchedIds(ids));
  }, []);

  useEffect(() => {
    const fetchInitialData = () => {
      setLoading(true);
      setData(null);
      pageRef.current = 1;
      setPageNum(1);

      const langParam = language === 'fr' ? 'fr-FR' : 'en-US';
      const now = new Date().toISOString().split('T')[0];

      const params: any = {
        language: langParam,
        sort_by: sortBy,
        with_genres: selectedGenre || undefined,
        without_genres: "16", // excludes anime
        "first_air_date.lte": now,
        "vote_count.gte": 20,
      };

      if (sortBy === "vote_average.desc") {
        params["vote_count.gte"] = 200;
      }
      
      Promise.all([
        fetchDataFromApi(`/discover/tv`, { ...params, page: 1 }),
        fetchDataFromApi(`/discover/tv`, { ...params, page: 2 }),
        fetchDataFromApi(`/discover/tv`, { ...params, page: 3 })
      ]).then(([page1, page2, page3]) => {
        const combinedResults = [...(page1?.results || []), ...(page2?.results || []), ...(page3?.results || [])];
        const res = {
          ...page1,
          results: combinedResults,
          total_pages: page1?.total_pages || 1
        };

        const newGenres = extractUserGenresFromItems(res.results, watchedIds);
        newGenres.forEach(g => userGenresRef.current.add(g));

        if (res.results) {
            const sorted = sortItems(res.results, userGenresRef.current, { sortBy });
            res.results = sortBy === "popularity.desc" ? mixCatalog(sorted) : sorted;
        }

        setData(res);
        pageRef.current = 4;
        setPageNum(4);
        setLoading(false);
      });
    };

    fetchInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, sortBy, watchedIds, selectedGenre]);

  const fetchNextPageData = () => {
    const langParam = language === 'fr' ? 'fr-FR' : 'en-US';
    const now = new Date().toISOString().split('T')[0];

    const params: any = {
      language: langParam,
      sort_by: sortBy,
      with_genres: selectedGenre || undefined,
      without_genres: "16",
      "first_air_date.lte": now,
      "vote_count.gte": 20,
    };

    if (sortBy === "vote_average.desc") {
      params["vote_count.gte"] = 200;
    }
    
    Promise.all([
      fetchDataFromApi(`/discover/tv`, { ...params, page: pageRef.current }),
      fetchDataFromApi(`/discover/tv`, { ...params, page: pageRef.current + 1 })
    ]).then(
      ([page1, page2]) => {
        const combinedResults = [...(page1?.results || []), ...(page2?.results || [])];
        const res = {
          ...page1,
          results: combinedResults
        };

        if (data?.results) {
          const newGenres = extractUserGenresFromItems(res.results, watchedIds);
          newGenres.forEach(g => userGenresRef.current.add(g));

          const sortedNewResults = sortItems(res.results, userGenresRef.current, { sortBy });
          const mixedNewResults = sortBy === "popularity.desc" ? mixCatalog(sortedNewResults) : sortedNewResults;

          setData({
            ...data,
            results: [...data.results, ...mixedNewResults],
          });
        } else {
          setData(res);
        }
        pageRef.current += 2;
        setPageNum(pageRef.current);
      }
    );
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <HeroBanner endpoint="/discover/tv" params={{ without_genres: "16", "vote_count.gte": 20 }} />
      <div className="pt-10 pb-10">
        <ContentWrapper>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
          <h1 className="text-3xl md:text-4xl font-bold text-white capitalize tracking-tight">
            {t.nav.tvShows}
          </h1>
          
          <div className="flex flex-wrap gap-4 w-full md:w-auto">
            {/* Genre Select */}
            <div className="relative group">
              <select
                value={selectedGenre}
                onChange={(e) => setSelectedGenre(e.target.value)}
                className="appearance-none bg-zinc-900 text-white px-6 py-3 pr-12 rounded-xl border border-zinc-800 focus:border-[#E50914] focus:outline-none cursor-pointer hover:bg-zinc-800 transition-all duration-300 text-sm font-medium min-w-[160px] shadow-lg"
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

            {/* Sort By Select */}
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
          </div>
        </div>

        {loading && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 md:gap-8">
            {[...Array(10)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}
        
        {!loading && (
          <>
            {data?.results?.length > 0 ? (
              <InfiniteScroll
                dataLength={data?.results?.length || 0}
                next={fetchNextPageData}
                hasMore={data && pageNum <= data.total_pages && data.total_pages > 0}
                loader={
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 md:gap-8 mt-6 col-span-full w-full">
                    {[...Array(5)].map((_, i) => (
                      <SkeletonCard key={i} />
                    ))}
                  </div>
                }
                style={{ overflow: "visible" }}
                scrollThreshold={0.8}
              >
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 md:gap-8">
                  {data?.results?.map((item: any, index: number) => (
                    <motion.div
                      key={`${item.id}-${index}`}
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, delay: (index % 10) * 0.05, ease: [0.16, 1, 0.3, 1] }}
                      className="h-full"
                    >
                      <MovieCard
                        data={item}
                        mediaType="tv"
                      />
                    </motion.div>
                  ))}
                </div>
              </InfiniteScroll>
            ) : (
              <div className="flex flex-col items-center justify-center py-40 text-center">
                <span className="text-xl text-white/40 font-medium">Aucun résultat trouvé</span>
              </div>
            )}
          </>
        )}
        </ContentWrapper>
      </div>
    </div>
  );
};

export default Series;
