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

const Explore = () => {
  const [data, setData] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [loading, setLoading] = useState(false);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("popularity.desc");
  
  const { mediaType } = useParams();
  const { language, t } = useLanguage();

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
        setData(res);
        setPageNum(2);
        setLoading(false);
      });
    };

    fetchInitialData();
  }, [mediaType, language, sortBy, selectedGenre]);

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
    <div className="min-h-screen pt-[100px] pb-10">
      <ContentWrapper>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <h1 className="text-2xl md:text-3xl font-bold text-white capitalize">
            {mediaType === "tv" ? t.explore.exploreTv : t.explore.exploreMovies}
          </h1>
          
          <div className="flex flex-wrap gap-3 w-full md:w-auto">
            {/* Sort By Select */}
            <div className="relative group">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="appearance-none bg-zinc-800 text-white px-4 py-2 pr-10 rounded-full border border-white/10 focus:border-[#E50914] focus:outline-none cursor-pointer hover:bg-zinc-700 transition-colors text-sm font-medium min-w-[140px]"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
            </div>

            {/* Genre Select */}
            <div className="relative group">
              <select
                value={selectedGenre}
                onChange={(e) => setSelectedGenre(e.target.value)}
                className="appearance-none bg-zinc-800 text-white px-4 py-2 pr-10 rounded-full border border-white/10 focus:border-[#E50914] focus:outline-none cursor-pointer hover:bg-zinc-700 transition-colors text-sm font-medium min-w-[140px] max-w-[200px]"
              >
                <option value="">Tous les genres</option>
                {genres.map((genre) => (
                  <option key={genre.id} value={genre.id}>
                    {genre.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
            </div>
          </div>
        </div>

        {loading && <Spinner initial={true} />}
        
        {!loading && (
          <>
            {data?.results?.length > 0 ? (
              <InfiniteScroll
                className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6"
                dataLength={data?.results?.length || 0}
                next={fetchNextPageData}
                hasMore={pageNum <= data?.total_pages}
                loader={<Spinner />}
              >
                {data?.results?.map((item: any, index: number) => {
                  if (item.media_type === "person") return null;
                  return (
                    <MovieCard
                      key={`${item.id}-${index}`}
                      data={item}
                      mediaType={mediaType as string}
                    />
                  );
                })}
              </InfiniteScroll>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <span className="text-2xl text-white/50 font-medium">
                  {t.explore.noResults}
                </span>
                <p className="text-white/30 mt-2">Essayez de modifier vos filtres</p>
              </div>
            )}
          </>
        )}
      </ContentWrapper>
    </div>
  );
};

export default Explore;
