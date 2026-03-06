"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import InfiniteScroll from "react-infinite-scroll-component";
import { fetchDataFromApi } from "@/utils/api";
import ContentWrapper from "@/components/ContentWrapper";
import MovieCard from "@/components/MovieCard";
import Spinner from "@/components/Spinner";
import { useLanguage } from "@/context/LanguageContext";
import { ChevronDown } from "lucide-react";

interface Genre {
  id: number;
  name: string;
}

const sortOptions = [
  { value: "popularity.desc", label: "Popularité" },
  { value: "vote_average.desc", label: "Note" },
  { value: "primary_release_date.desc", label: "Date de sortie" },
];

import { motion } from "motion/react";

// ... (imports)

import { sortItems, getUserWatchedIds, extractUserGenresFromItems } from "@/utils/sorting";

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
        // Extract new genres from this batch
        const newGenres = extractUserGenresFromItems(res?.results || [], watchedIds);
        const updatedUserGenres = new Set([...userGenres, ...newGenres]);
        setUserGenres(updatedUserGenres);

        // Sort
        if (res?.results) {
            res.results = sortItems(res.results, updatedUserGenres);
        }

        setData(res);
        setPageNum(2);
        setLoading(false);
      });
    };

    fetchInitialData();
  }, [mediaType, language, sortBy, selectedGenre, watchedIds]); // Added watchedIds to dependency to re-sort if it loads late? 
  // Actually adding watchedIds to dependency might trigger double fetch if it loads after initial fetch. 
  // But usually initial fetch is fast. 
  // Let's keep it simple. If watchedIds loads LATER than initial data, we might miss the first sort.
  // But getUserWatchedIds is fast (internal API). TMDB is external.
  // So likely watchedIds is ready before TMDB.

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
          // Extract new genres
          const newGenres = extractUserGenresFromItems(res?.results || [], watchedIds);
          const updatedUserGenres = new Set([...userGenres, ...newGenres]);
          setUserGenres(updatedUserGenres);

          // Sort new results
          const sortedNewResults = sortItems(res.results, updatedUserGenres);

          setData({
            ...data,
            results: [...data?.results, ...sortedNewResults],
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

            {/* Genre Select */}
            <div className="relative group">
              <select
                value={selectedGenre}
                onChange={(e) => setSelectedGenre(e.target.value)}
                className="appearance-none bg-zinc-900 text-white px-6 py-3 pr-12 rounded-xl border border-zinc-800 focus:border-[#E50914] focus:outline-none cursor-pointer hover:bg-zinc-800 transition-all duration-300 text-sm font-medium min-w-[160px] max-w-[240px] shadow-lg"
              >
                <option value="">Tous les genres</option>
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

        {loading && <Spinner initial={true} />}
        
        {!loading && (
          <>
            {data?.results?.length > 0 ? (
              <InfiniteScroll
                className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 md:gap-8"
                dataLength={data?.results?.length || 0}
                next={fetchNextPageData}
                hasMore={pageNum <= data?.total_pages}
                loader={<Spinner />}
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
                <p className="text-white/30 text-lg">Essayez de modifier vos filtres pour voir plus de résultats.</p>
              </div>
            )}
          </>
        )}
      </ContentWrapper>
    </div>
  );
};

export default Explore;
