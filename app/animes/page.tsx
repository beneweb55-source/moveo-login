"use client";

import { useState, useEffect } from "react";
import InfiniteScroll from "react-infinite-scroll-component";
import { fetchDataFromApi } from "@/utils/api";
import ContentWrapper from "@/components/ContentWrapper";
import MovieCard from "@/components/MovieCard";
import Spinner from "@/components/Spinner";
import { useLanguage } from "@/context/LanguageContext";
import { ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import HeroBanner from "@/components/HeroBanner";

const sortOptions = [
  { value: "popularity.desc", label: "Popularité" },
  { value: "vote_average.desc", label: "Note" },
  { value: "first_air_date.desc", label: "Date de sortie" },
];

const Animes = () => {
  const [data, setData] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [loading, setLoading] = useState(false);
  const [mediaType, setMediaType] = useState<"tv" | "movie">("tv");
  const [sortBy, setSortBy] = useState<string>("popularity.desc");
  
  const { language } = useLanguage();

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
        with_genres: "16", // Animation Genre ID
        with_original_language: "ja", // Focus on Japanese Anime
      };
      
      fetchDataFromApi(`/discover/${mediaType}`, params).then((res) => {
        setData(res);
        setPageNum(2);
        setLoading(false);
      });
    };

    fetchInitialData();
  }, [mediaType, language, sortBy]);

  const fetchNextPageData = () => {
    const langParam = language === 'fr' ? 'fr-FR' : 'en-US';
    const params: any = {
      language: langParam,
      sort_by: sortBy,
      page: pageNum,
      with_genres: "16",
      with_original_language: "ja",
    };
    
    fetchDataFromApi(`/discover/${mediaType}`, params).then(
      (res) => {
        if (data?.results) {
          setData({
            ...data,
            results: [...data?.results, ...res.results],
          });
        } else {
          setData(res);
        }
        setPageNum((prev) => prev + 1);
      }
    );
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <HeroBanner endpoint="/discover/tv" params={{ with_genres: "16", with_original_language: "ja" }} />
      <div className="pt-10 pb-10">
        <ContentWrapper>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
          <h1 className="text-3xl md:text-4xl font-bold text-white capitalize tracking-tight">
            Animes
          </h1>
          
          <div className="flex flex-wrap gap-4 w-full md:w-auto">
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
                        mediaType={mediaType}
                      />
                    </motion.div>
                  );
                })}
              </InfiniteScroll>
            ) : (
              <div className="flex flex-col items-center justify-center py-32 text-center">
                <span className="text-3xl text-white/40 font-bold mb-4">
                  Aucun résultat
                </span>
                <p className="text-white/30 text-lg">Essayez de modifier vos filtres pour voir plus de résultats.</p>
              </div>
            )}
          </>
        )}
      </ContentWrapper>
      </div>
    </div>
  );
};

export default Animes;
