"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import InfiniteScroll from "react-infinite-scroll-component";
import { fetchDataFromApi } from "@/utils/api";
import ContentWrapper from "@/components/ContentWrapper";
import MovieCard from "@/components/MovieCard";
import Spinner from "@/components/Spinner";
import { useLanguage } from "@/context/LanguageContext";
import { 
  ChevronDown, Filter, X, Search, Shuffle, Flame, Star, 
  Clock, Grid, LayoutGrid, RotateCcw, Sparkles 
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Genre {
  id: number;
  name: string;
}

const sortOptions = [
  { value: "popularity.desc", label: "Popularité" },
  { value: "vote_average.desc", label: "Note" },
  { value: "primary_release_date.desc", label: "Date de sortie" },
  { value: "original_title.asc", label: "Titre (A-Z)" },
];

const Explore = () => {
  const { mediaType } = useParams();
  const { language, t } = useLanguage();
  
  // Data State
  const [data, setData] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [loading, setLoading] = useState(false);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [topTrending, setTopTrending] = useState<any[]>([]);
  
  // Filter State
  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const [sortBy, setSortBy] = useState<string>("popularity.desc");
  const [minRating, setMinRating] = useState<number>(0);
  const [yearRange, setYearRange] = useState<{min: number, max: number}>({ min: 1900, max: new Date().getFullYear() });
  const [searchQuery, setSearchQuery] = useState("");
  
  // UI State
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "compact">("grid");
  const [isSticky, setIsSticky] = useState(false);

  // Debounce Search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) {
        fetchInitialData();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load Filters from LocalStorage
  useEffect(() => {
    const savedFilters = localStorage.getItem(`explore_filters_${mediaType}`);
    if (savedFilters) {
      const parsed = JSON.parse(savedFilters);
      setSelectedGenres(parsed.selectedGenres || []);
      setSortBy(parsed.sortBy || "popularity.desc");
      setMinRating(parsed.minRating || 0);
    }
  }, [mediaType]);

  // Save Filters to LocalStorage
  useEffect(() => {
    localStorage.setItem(`explore_filters_${mediaType}`, JSON.stringify({
      selectedGenres,
      sortBy,
      minRating
    }));
  }, [selectedGenres, sortBy, minRating, mediaType]);

  // Fetch Genres & Trending
  useEffect(() => {
    const fetchStaticData = async () => {
      const langParam = language === 'fr' ? 'fr-FR' : 'en-US';
      
      const [genresRes, trendingRes] = await Promise.all([
        fetchDataFromApi(`/genre/${mediaType}/list`, { language: langParam }),
        fetchDataFromApi(`/trending/${mediaType}/day`, { language: langParam })
      ]);

      if (genresRes?.genres) setGenres(genresRes.genres);
      if (trendingRes?.results) setTopTrending(trendingRes.results.slice(0, 5));
    };
    fetchStaticData();
  }, [mediaType, language]);

  // Fetch Initial Data
  const fetchInitialData = useCallback(() => {
    setLoading(true);
    setData(null);
    setPageNum(1);

    const langParam = language === 'fr' ? 'fr-FR' : 'en-US';
    
    // If searching, use search endpoint
    if (searchQuery.length > 2) {
      fetchDataFromApi(`/search/${mediaType}`, {
        query: searchQuery,
        language: langParam,
        page: 1
      }).then((res) => {
        setData(res);
        setPageNum(2);
        setLoading(false);
      });
      return;
    }

    // Otherwise use discover
    const params: any = {
      language: langParam,
      sort_by: sortBy,
      "vote_average.gte": minRating,
      "primary_release_date.gte": `${yearRange.min}-01-01`,
      "primary_release_date.lte": `${yearRange.max}-12-31`,
      page: 1
    };
    
    if (selectedGenres.length > 0) {
      params.with_genres = selectedGenres.join(",");
    }

    fetchDataFromApi(`/discover/${mediaType}`, params).then((res) => {
      setData(res);
      setPageNum(2);
      setLoading(false);
    });
  }, [mediaType, language, sortBy, selectedGenres, minRating, yearRange, searchQuery]);

  // Trigger fetch on filter change
  useEffect(() => {
    if (!searchQuery) {
      fetchInitialData();
    }
  }, [fetchInitialData]);

  const fetchNextPageData = () => {
    const langParam = language === 'fr' ? 'fr-FR' : 'en-US';
    
    if (searchQuery.length > 2) {
      fetchDataFromApi(`/search/${mediaType}`, {
        query: searchQuery,
        language: langParam,
        page: pageNum
      }).then((res) => {
        if (data?.results) {
          setData({ ...data, results: [...data.results, ...res.results] });
        } else {
          setData(res);
        }
        setPageNum((prev) => prev + 1);
      });
      return;
    }

    const params: any = {
      language: langParam,
      sort_by: sortBy,
      "vote_average.gte": minRating,
      "primary_release_date.gte": `${yearRange.min}-01-01`,
      "primary_release_date.lte": `${yearRange.max}-12-31`,
      page: pageNum,
    };
    
    if (selectedGenres.length > 0) {
      params.with_genres = selectedGenres.join(",");
    }

    fetchDataFromApi(`/discover/${mediaType}`, params).then((res) => {
      if (data?.results) {
        setData({ ...data, results: [...data.results, ...res.results] });
      } else {
        setData(res);
      }
      setPageNum((prev) => prev + 1);
    });
  };

  const handleSurpriseMe = () => {
    if (data?.results?.length > 0) {
      const random = data.results[Math.floor(Math.random() * data.results.length)];
      // Scroll to item or highlight it? 
      // For now, let's just alert or log, or maybe open it?
      // Better: Open the details page
      window.location.href = `/${mediaType}/${random.id}`;
    }
  };

  const toggleGenre = (id: number) => {
    setSelectedGenres(prev => 
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    );
  };

  const resetFilters = () => {
    setSelectedGenres([]);
    setSortBy("popularity.desc");
    setMinRating(0);
    setYearRange({ min: 1900, max: new Date().getFullYear() });
    setSearchQuery("");
  };

  // Sticky Header Logic
  useEffect(() => {
    const handleScroll = () => {
      setIsSticky(window.scrollY > 100);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0A0A] pt-24 pb-10">
      <ContentWrapper>
        {/* Header Section */}
        <div className="flex flex-col gap-8 mb-12">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <h1 className="text-4xl md:text-5xl font-black text-white capitalize mb-2 tracking-tight">
                {mediaType === "tv" ? t.explore.exploreTv : t.explore.exploreMovies}
              </h1>
              <p className="text-white/50 text-lg">
                Découvrez notre catalogue complet et personnalisé
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={handleSurpriseMe}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full font-bold text-white hover:scale-105 transition-transform shadow-lg shadow-purple-900/20"
              >
                <Sparkles className="w-5 h-5" />
                <span>Surprise Me</span>
              </button>
            </div>
          </div>

          {/* Top Trending Mini-Section */}
          {topTrending.length > 0 && (
            <div className="w-full overflow-x-auto pb-4 scrollbar-hide">
              <div className="flex gap-4">
                <div className="flex flex-col justify-center min-w-[100px] px-4">
                  <div className="flex items-center gap-2 text-[#E50914] font-bold mb-1">
                    <Flame className="w-5 h-5" />
                    <span>TOP 5</span>
                  </div>
                  <span className="text-white/60 text-sm">Du moment</span>
                </div>
                {topTrending.map((item, index) => (
                  <div 
                    key={item.id} 
                    className="relative min-w-[200px] h-[120px] rounded-xl overflow-hidden cursor-pointer group"
                    onClick={() => window.location.href = `/${mediaType}/${item.id}`}
                  >
                    <img 
                      src={`https://image.tmdb.org/t/p/w500${item.backdrop_path || item.poster_path}`} 
                      alt={item.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent flex items-end p-3">
                      <span className="text-4xl font-black text-white/20 absolute top-1 right-2">#{index + 1}</span>
                      <h3 className="text-white font-bold text-sm line-clamp-1 relative z-10">{item.title || item.name}</h3>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Controls Bar */}
          <div className={`sticky top-[70px] z-40 transition-all duration-300 ${isSticky ? 'py-4 bg-[#0A0A0A]/95 backdrop-blur-xl border-b border-white/5 -mx-4 px-4 md:-mx-8 md:px-8 shadow-2xl' : ''}`}>
            <div className="flex flex-col lg:flex-row gap-4 justify-between">
              {/* Search */}
              <div className="relative flex-1 max-w-xl">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                <input
                  type="text"
                  placeholder="Rechercher un titre, un acteur..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-full py-3 pl-12 pr-4 text-white placeholder:text-white/30 focus:outline-none focus:border-[#E50914] focus:bg-white/10 transition-all"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 overflow-x-auto pb-2 lg:pb-0">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-2 px-5 py-3 rounded-full font-medium transition-all whitespace-nowrap ${showFilters ? 'bg-white text-black' : 'bg-white/5 text-white hover:bg-white/10'}`}
                >
                  <Filter className="w-4 h-4" />
                  <span>Filtres</span>
                  {(selectedGenres.length > 0 || minRating > 0) && (
                    <span className="w-2 h-2 rounded-full bg-[#E50914]" />
                  )}
                </button>

                <div className="h-8 w-[1px] bg-white/10 mx-2 hidden md:block" />

                <div className="flex bg-white/5 rounded-full p-1 border border-white/10">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-2 rounded-full transition-all ${viewMode === "grid" ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'}`}
                  >
                    <LayoutGrid className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setViewMode("compact")}
                    className={`p-2 rounded-full transition-all ${viewMode === "compact" ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'}`}
                  >
                    <Grid className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Expanded Filters Panel */}
            <AnimatePresence>
              {showFilters && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pt-6 pb-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    {/* Sort */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-white/50 uppercase tracking-wider">Trier par</h3>
                      <div className="relative">
                        <select
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value)}
                          className="w-full appearance-none bg-white/5 text-white px-4 py-3 rounded-xl border border-white/10 focus:border-[#E50914] outline-none cursor-pointer"
                        >
                          {sortOptions.map((option) => (
                            <option key={option.value} value={option.value} className="bg-[#1a1a1a]">
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
                      </div>
                    </div>

                    {/* Rating */}
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <h3 className="text-sm font-bold text-white/50 uppercase tracking-wider">Note Minimum</h3>
                        <span className="text-[#E50914] font-bold">{minRating}+</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="1"
                        value={minRating}
                        onChange={(e) => setMinRating(Number(e.target.value))}
                        className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#E50914]"
                      />
                      <div className="flex justify-between text-xs text-white/30">
                        <span>0</span>
                        <span>5</span>
                        <span>10</span>
                      </div>
                    </div>

                    {/* Genres */}
                    <div className="space-y-3 md:col-span-2">
                      <div className="flex justify-between items-center">
                        <h3 className="text-sm font-bold text-white/50 uppercase tracking-wider">Genres</h3>
                        <button onClick={() => setSelectedGenres([])} className="text-xs text-white/40 hover:text-white">
                          Effacer
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10">
                        {genres.map((genre) => (
                          <button
                            key={genre.id}
                            onClick={() => toggleGenre(genre.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                              selectedGenres.includes(genre.id)
                                ? "bg-[#E50914] border-[#E50914] text-white"
                                : "bg-white/5 border-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                            }`}
                          >
                            {genre.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-end pt-4 border-t border-white/5 mt-4">
                    <button 
                      onClick={resetFilters}
                      className="flex items-center gap-2 text-white/50 hover:text-white transition-colors text-sm"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Réinitialiser tout
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Content Grid */}
        {loading && <Spinner initial={true} />}
        
        {!loading && (
          <>
            {data?.results?.length > 0 ? (
              <InfiniteScroll
                className={`grid gap-6 ${
                  viewMode === "grid" 
                    ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" 
                    : "grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8"
                }`}
                dataLength={data?.results?.length || 0}
                next={fetchNextPageData}
                hasMore={pageNum <= data?.total_pages}
                loader={<div className="col-span-full flex justify-center py-8"><Spinner /></div>}
              >
                {data?.results?.map((item: any, index: number) => {
                  if (item.media_type === "person") return null;
                  return (
                    <motion.div
                      key={`${item.id}-${index}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
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
              <div className="flex flex-col items-center justify-center py-32 text-center bg-white/5 rounded-3xl border border-white/5">
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6">
                  <Search className="w-10 h-10 text-white/20" />
                </div>
                <span className="text-2xl text-white font-bold mb-2">
                  {t.explore.noResults}
                </span>
                <p className="text-white/40 max-w-md mx-auto">
                  Nous n'avons trouvé aucun résultat correspondant à vos critères. Essayez de modifier vos filtres ou votre recherche.
                </p>
                <button 
                  onClick={resetFilters}
                  className="mt-8 px-8 py-3 bg-white text-black rounded-full font-bold hover:bg-[#E50914] hover:text-white transition-all"
                >
                  Réinitialiser les filtres
                </button>
              </div>
            )}
          </>
        )}
      </ContentWrapper>
    </div>
  );
};

export default Explore;
