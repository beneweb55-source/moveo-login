"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import InfiniteScroll from "react-infinite-scroll-component";
import { fetchDataFromApi } from "@/utils/api";
import ContentWrapper from "@/components/ContentWrapper";
import MovieCard from "@/components/MovieCard";
import Spinner from "@/components/Spinner";
import { ArrowLeft, Calendar, MapPin, User, ChevronDown } from "lucide-react";
import Image from "next/image";
import { motion } from "motion/react";

import { useLanguage } from "@/context/LanguageContext";

interface Genre {
  id: number;
  name: string;
}

const sortOptions = [
  { value: "popularity.desc", label: "popularity" },
  { value: "vote_average.desc", label: "rating" },
  { value: "releaseDate.desc", label: "releaseDate" },
];

export default function PersonDetails() {
  const { id } = useParams();
  const router = useRouter();
  const { language, t } = useLanguage();
  const langParam = language === "fr" ? "fr-FR" : "en-US";
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Filmography states
  const [mediaTypeFilter, setMediaTypeFilter] = useState<"movie" | "tv">("movie");
  const [sortBy, setSortBy] = useState<string>("popularity.desc");
  const [selectedGenre, setSelectedGenre] = useState<string>("");
  const [genres, setGenres] = useState<Genre[]>([]);
  const [allCredits, setAllCredits] = useState<any[]>([]);
  const [credits, setCredits] = useState<any>(null);
  const [creditsPage, setCreditsPage] = useState(1);
  const [creditsLoading, setCreditsLoading] = useState(false);

  useEffect(() => {
    if (data?.name) {
      document.title = `${data.name} - Moveo`;
    } else {
      document.title = 'Moveo';
    }

    return () => {
      document.title = 'Moveo';
    };
  }, [data]);

  // Fetch Person Details
  useEffect(() => {
    const fetchDetails = async () => {
      setLoading(true);
      try {
        const res = await fetchDataFromApi(`/person/${id}`, { 
          language: langParam,
        });
        setData(res);
      } catch (error) {
        console.error("Error fetching person details:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [id, langParam]);

  // Fetch Genres based on mediaTypeFilter
  useEffect(() => {
    const fetchGenres = async () => {
      try {
        const res = await fetchDataFromApi(`/genre/${mediaTypeFilter}/list`, { language: langParam });
        if (res?.genres) {
          setGenres(res.genres);
        }
      } catch (error) {
        console.error("Error fetching genres:", error);
      }
    };
    fetchGenres();
  }, [mediaTypeFilter, langParam]);

  // Fetch Initial Credits
  useEffect(() => {
    const fetchInitialCredits = async () => {
      setCreditsLoading(true);
      setCredits(null);
      setCreditsPage(1);

      try {
        const res = await fetchDataFromApi(`/person/${id}/${mediaTypeFilter}_credits`, {
          language: langParam,
        });
        
        let items = res.cast || [];
        
        // Remove duplicates (sometimes TMDB returns the same movie/show multiple times for different roles)
        const uniqueItems = [];
        const seenIds = new Set();
        for (const item of items) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            uniqueItems.push(item);
          }
        }
        items = uniqueItems;

        // Filter by genre
        if (selectedGenre) {
          items = items.filter((item: any) => item.genre_ids?.includes(Number(selectedGenre)));
        }

        // Filter by vote_average if needed
        if (sortBy === "vote_average.desc") {
          items = items.filter((item: any) => item.vote_count >= 50);
        }

        // Sort
        items.sort((a: any, b: any) => {
          if (sortBy === "popularity.desc") {
            return (b.popularity || 0) - (a.popularity || 0);
          } else if (sortBy === "vote_average.desc") {
            return (b.vote_average || 0) - (a.vote_average || 0);
          } else if (sortBy === "releaseDate.desc") {
            const dateA = new Date(a.release_date || a.first_air_date || "1900-01-01").getTime();
            const dateB = new Date(b.release_date || b.first_air_date || "1900-01-01").getTime();
            return dateB - dateA;
          }
          return 0;
        });

        setAllCredits(items);
        setCredits({
          results: items.slice(0, 20),
          total_pages: Math.ceil(items.length / 20)
        });
        setCreditsPage(2);
      } catch (error) {
        console.error("Error fetching credits:", error);
      } finally {
        setCreditsLoading(false);
      }
    };

    fetchInitialCredits();
  }, [id, mediaTypeFilter, sortBy, selectedGenre, langParam]);

  // Fetch Next Page of Credits
  const fetchNextCreditsPage = async () => {
    const startIndex = (creditsPage - 1) * 20;
    const endIndex = startIndex + 20;
    const nextItems = allCredits.slice(startIndex, endIndex);
    
    if (nextItems.length > 0) {
      setCredits({
        ...credits,
        results: [...credits.results, ...nextItems]
      });
      setCreditsPage(prev => prev + 1);
    }
  };

  if (loading) {
    return (
      <div className="w-full h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#E50914] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const profileUrl = data?.profile_path
    ? `https://image.tmdb.org/t/p/w500${data.profile_path}`
    : `https://picsum.photos/seed/${id}/400/600`;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-sans selection:bg-[#E50914] selection:text-white pb-20 overflow-x-hidden">
      {/* Navigation */}
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-24 left-8 z-40"
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 bg-black/50 hover:bg-[#E50914] text-white px-4 py-2 rounded-full backdrop-blur-md border border-white/10 transition-all duration-300 group shadow-lg"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span className="font-medium inline">{t.details.back}</span>
        </button>
      </motion.nav>

      <div className="relative w-full pt-32 pb-12">
        <ContentWrapper>
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-[300px_1fr] lg:grid-cols-[350px_1fr] gap-8 md:gap-12 items-start mt-0">
                {/* Profile Image */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8 }}
                    className="relative aspect-[2/3] w-[250px] md:w-full mx-auto md:mx-0 rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 group"
                >
                    <Image
                        src={profileUrl}
                        alt={data?.name}
                        fill
                        className="object-cover transition-transform duration-700 group-hover:scale-105"
                        referrerPolicy="no-referrer"
                    />
                </motion.div>

                {/* Info */}
                <div className="flex flex-col gap-6 pt-4 md:pt-10 text-center md:text-left">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                    >
                        <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-[1.1] mb-4">
                            {data?.name}
                        </h1>

                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 md:gap-6 text-sm md:text-base font-medium text-white/80 mb-8">
                            {data?.known_for_department && (
                                <div className="flex items-center gap-2 bg-black/30 px-3 py-1.5 rounded-full border border-white/10 backdrop-blur-sm">
                                    <User className="w-4 h-4 text-[#E50914]" />
                                    <span className="text-white">{data.known_for_department}</span>
                                </div>
                            )}
                            {data?.birthday && (
                                <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-[#E50914]" />
                                    <span>{new Date(data.birthday).toLocaleDateString(langParam)}</span>
                                </div>
                            )}
                            {data?.place_of_birth && (
                                <div className="flex items-center gap-2">
                                    <MapPin className="w-4 h-4 text-[#E50914]" />
                                    <span>{data.place_of_birth}</span>
                                </div>
                            )}
                        </div>

                        {/* Biography */}
                        {data?.biography && (
                            <div className="max-w-3xl text-left mt-8">
                                <h3 className="text-lg font-bold mb-2 flex items-center gap-2 justify-center md:justify-start">
                                    {t.details.biography || "Biography"}
                                </h3>
                                <p className="text-base md:text-lg text-white/70 leading-relaxed whitespace-pre-line">
                                    {data.biography}
                                </p>
                            </div>
                        )}
                    </motion.div>
                </div>
            </div>
        </ContentWrapper>
      </div>

      {/* Filmography Section */}
      <div className="relative z-20 bg-[#0A0A0A] pb-10">
        <ContentWrapper>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
            <h2 className="text-2xl md:text-3xl font-bold">
              {t.person?.filmography || "Filmography"}
            </h2>
            
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 md:gap-3 w-full md:w-auto">
              {/* Media Type Toggle */}
              <div className="flex items-center bg-white/5 rounded-full p-1 border border-white/10 w-full sm:w-auto">
                <button
                  onClick={() => {
                    setMediaTypeFilter("movie");
                    setSelectedGenre("");
                  }}
                  className={`flex-1 sm:flex-none px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                    mediaTypeFilter === "movie" ? "bg-[#E50914] text-white" : "text-white/70 hover:text-white"
                  }`}
                >
                  {t.person?.movies || "Movies"}
                </button>
                <button
                  onClick={() => {
                    setMediaTypeFilter("tv");
                    setSelectedGenre("");
                  }}
                  className={`flex-1 sm:flex-none px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                    mediaTypeFilter === "tv" ? "bg-[#E50914] text-white" : "text-white/70 hover:text-white"
                  }`}
                >
                  {t.person?.tvShows || "TV Shows"}
                </button>
              </div>

              {/* Sort By Dropdown */}
              <div className="relative group flex-1 sm:flex-none min-w-[140px]">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full appearance-none bg-white/5 border border-white/10 text-white text-sm rounded-full pl-4 pr-10 py-2 outline-none focus:border-[#E50914] transition-colors cursor-pointer"
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value} className="bg-[#141414] text-white">
                      {t.explore.sortOptions[option.label as keyof typeof t.explore.sortOptions] || option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
              </div>

              {/* Genre Dropdown */}
              <div className="relative group flex-1 sm:flex-none min-w-[140px]">
                <select
                  value={selectedGenre}
                  onChange={(e) => setSelectedGenre(e.target.value)}
                  className="w-full appearance-none bg-white/5 border border-white/10 text-white text-sm rounded-full pl-4 pr-10 py-2 outline-none focus:border-[#E50914] transition-colors cursor-pointer"
                >
                  <option value="" className="bg-[#141414] text-white">
                    {t.explore.allGenres || "All Genres"}
                  </option>
                  {genres.map((genre) => (
                    <option key={genre.id} value={genre.id} className="bg-[#141414] text-white">
                      {genre.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Results Grid */}
          {creditsLoading && !credits?.results ? (
            <Spinner initial={true} />
          ) : credits?.results?.length > 0 ? (
            <InfiniteScroll
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6 overflow-hidden"
              dataLength={credits.results.length}
              next={fetchNextCreditsPage}
              hasMore={creditsPage <= credits.total_pages}
              loader={<Spinner />}
            >
              {credits.results.map((item: any, index: number) => {
                if (item.media_type === "person") return null;
                return (
                  <MovieCard
                    key={`${item.id}-${index}`}
                    data={item}
                    mediaType={mediaTypeFilter}
                  />
                );
              })}
            </InfiniteScroll>
          ) : (
            <div className="text-center text-white/50 py-20">
              <span className="text-xl">{t.search.noResults || "No results found"}</span>
            </div>
          )}
        </ContentWrapper>
      </div>
    </div>
  );
}
