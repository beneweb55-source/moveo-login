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
  const [credits, setCredits] = useState<any>(null);
  const [creditsPage, setCreditsPage] = useState(1);
  const [creditsLoading, setCreditsLoading] = useState(false);

  useEffect(() => {
    if (data?.name) {
      document.title = `Moveo — ${data.name}`;
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

      let finalSortBy = sortBy;
      if (sortBy === "releaseDate.desc") {
        finalSortBy = mediaTypeFilter === "tv" ? "first_air_date.desc" : "primary_release_date.desc";
      }

      const params: any = {
        language: langParam,
        with_cast: id,
        sort_by: finalSortBy,
        page: 1,
      };

      if (sortBy === "vote_average.desc") {
        params["vote_count.gte"] = 50;
      }

      if (selectedGenre) {
        params.with_genres = selectedGenre;
      }

      try {
        const res = await fetchDataFromApi(`/discover/${mediaTypeFilter}`, params);
        setCredits(res);
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
    let finalSortBy = sortBy;
    if (sortBy === "releaseDate.desc") {
      finalSortBy = mediaTypeFilter === "tv" ? "first_air_date.desc" : "primary_release_date.desc";
    }

    const params: any = {
      language: langParam,
      with_cast: id,
      sort_by: finalSortBy,
      page: creditsPage,
    };

    if (sortBy === "vote_average.desc") {
      params["vote_count.gte"] = 50;
    }

    if (selectedGenre) {
      params.with_genres = selectedGenre;
    }

    try {
      const res = await fetchDataFromApi(`/discover/${mediaTypeFilter}`, params);
      if (credits?.results) {
        setCredits({
          ...credits,
          results: [...credits.results, ...res.results],
        });
      } else {
        setCredits(res);
      }
      setCreditsPage((prev) => prev + 1);
    } catch (error) {
      console.error("Error fetching next credits page:", error);
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
    <div className="min-h-screen bg-[#0A0A0A] text-white font-sans selection:bg-[#E50914] selection:text-white pb-20">
      {/* Navigation */}
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-24 left-4 md:left-8 z-40"
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 bg-black/50 hover:bg-[#E50914] text-white px-4 py-2 rounded-full backdrop-blur-md border border-white/10 transition-all duration-300 group shadow-lg"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span className="font-medium hidden sm:inline">{t.details.back}</span>
        </button>
      </motion.nav>

      <div className="relative w-full pt-32 pb-12">
        <ContentWrapper>
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[350px_1fr] gap-6 lg:gap-12 items-start mt-12 lg:mt-0">
                {/* Profile Image */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8 }}
                    className="relative aspect-[2/3] w-2/3 mx-auto lg:w-full rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 group"
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
                <div className="flex flex-col gap-4 md:gap-6 pt-4 lg:pt-10">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                    >
                        <h1 className="text-3xl md:text-5xl lg:text-6xl font-black tracking-tight leading-[1.1] mb-4">
                            {data?.name}
                        </h1>

                        <div className="flex flex-wrap items-center gap-3 md:gap-6 text-[10px] md:text-base font-medium text-white/80 mb-6 md:mb-8">
                            {data?.known_for_department && (
                                <div className="flex items-center gap-1.5 md:gap-2 bg-black/30 px-2 py-0.5 md:px-3 md:py-1.5 rounded-full border border-white/10 backdrop-blur-sm">
                                    <User className="w-3 h-3 md:w-4 md:h-4 text-[#E50914]" />
                                    <span className="text-white">{data.known_for_department}</span>
                                </div>
                            )}
                            {data?.birthday && (
                                <div className="flex items-center gap-1.5 md:gap-2">
                                    <Calendar className="w-3 h-3 md:w-4 md:h-4 text-[#E50914]" />
                                    <span>{new Date(data.birthday).toLocaleDateString(langParam)}</span>
                                </div>
                            )}
                            {data?.place_of_birth && (
                                <div className="flex items-center gap-1.5 md:gap-2">
                                    <MapPin className="w-3 h-3 md:w-4 md:h-4 text-[#E50914]" />
                                    <span>{data.place_of_birth}</span>
                                </div>
                            )}
                        </div>

                        {/* Biography */}
                        {data?.biography && (
                            <div className="max-w-3xl">
                                <h3 className="text-base md:text-lg font-bold mb-2 flex items-center gap-2">
                                    {t.details.biography || "Biography"}
                                </h3>
                                <p className="text-sm md:text-lg text-white/70 leading-relaxed whitespace-pre-line">
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
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <h2 className="text-2xl md:text-3xl font-bold">
              {t.person?.filmography || "Filmography"}
            </h2>
            
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Media Type Toggle */}
              <div className="flex items-center bg-white/5 rounded-full p-1 border border-white/10">
                <button
                  onClick={() => {
                    setMediaTypeFilter("movie");
                    setSelectedGenre("");
                  }}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
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
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    mediaTypeFilter === "tv" ? "bg-[#E50914] text-white" : "text-white/70 hover:text-white"
                  }`}
                >
                  {t.person?.tvShows || "TV Shows"}
                </button>
              </div>

              {/* Sort By Dropdown */}
              <div className="relative group">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="appearance-none bg-white/5 border border-white/10 text-white text-sm rounded-full pl-4 pr-10 py-2 outline-none focus:border-[#E50914] transition-colors cursor-pointer"
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
              <div className="relative group">
                <select
                  value={selectedGenre}
                  onChange={(e) => setSelectedGenre(e.target.value)}
                  className="appearance-none bg-white/5 border border-white/10 text-white text-sm rounded-full pl-4 pr-10 py-2 outline-none focus:border-[#E50914] transition-colors cursor-pointer"
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
