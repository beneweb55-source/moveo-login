"use client";

import React, { useState, useEffect, useRef } from "react";
import { fetchDataFromApi } from "@/utils/api";
import ContentWrapper from "@/components/ContentWrapper";
import MovieCard from "@/components/MovieCard";
import InfiniteScroll from "react-infinite-scroll-component";
import { Loader2, ChevronDown } from "lucide-react";
import HeroBanner from "@/components/HeroBanner";
import { useLanguage } from "@/context/LanguageContext";

import { motion } from "motion/react";

const sortOptions = [
  { value: "popularity.desc", label: "popularity" },
  { value: "vote_average.desc", label: "rating" },
  { value: "first_air_date.desc", label: "releaseDate" },
];

import { sortItems, getUserWatchedIds, extractUserGenresFromItems, mixCatalog, sameIdSet } from "@/utils/sorting";

import SkeletonCard from "@/components/SkeletonCard";

const KDramaPage = () => {
  const [data, setData] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [loading, setLoading] = useState(false);
  const [mediaType, setMediaType] = useState<"tv" | "movie">("tv");
  const [sortBy, setSortBy] = useState("popularity.desc");
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const userGenresRef = useRef<Set<number>>(new Set());
  const [genres, setGenres] = useState<any[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<string>("");
  const pageRef = useRef(1);
  // Pagination failure handling — same retry-storm defect as /films. This page
  // already wrapped its fetch in try/catch, so the rejection was handled, but on
  // failure pageRef still did not advance and hasMore stayed true, so the scroll
  // observer kept calling back into the same failing page with nothing to stop it.
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const loadingMoreRef = useRef(false);
  const failedPageRef = useRef<number | null>(null);
  const { language, t } = useLanguage();

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

  useEffect(() => {
    // Store only a real change: sameIdSet keeps object identity, so an unchanged
    // (e.g. empty, logged-out) list does not re-run the initial-fetch effect below.
    getUserWatchedIds().then(ids => setWatchedIds(prev => (sameIdSet(prev, ids) ? prev : ids)));
  }, []);

  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      pageRef.current = 1;
      setPageNum(1);
      // A new filter/sort selection is a fresh start: clear any give-up state
      // from a previous pagination failure, otherwise the new list paginates
      // no further than the old one did.
      setLoadMoreFailed(false);
      failedPageRef.current = null;
      try {
        const sortKey = mediaType === "movie" && sortBy === "first_air_date.desc" 
          ? "primary_release_date.desc" 
          : sortBy;

        const langParam = language === 'fr' ? 'fr-FR' : 'en-US';
        const now = new Date().toISOString().split('T')[0];
        const params: any = {
          with_original_language: "ko",
          without_genres: "16",
          sort_by: sortKey,
          page: 1,
          language: langParam,
        };

        // Add date limit to avoid future releases filling the first page
        if (mediaType === "movie") {
          params["primary_release_date.lte"] = now;
        } else {
          params["first_air_date.lte"] = now;
        }

        // Filter out obscure daily shows that have high "popularity" but 0 votes
        params["vote_count.gte"] = 10;

        if (sortBy === "vote_average.desc") {
          params["vote_count.gte"] = 200;
        }

        if (selectedGenre) {
          params.with_genres = selectedGenre;
        }

        const [page1, page2, page3] = await Promise.all([
          fetchDataFromApi(`/discover/${mediaType}`, { ...params, page: 1 }),
          fetchDataFromApi(`/discover/${mediaType}`, { ...params, page: 2 }),
          fetchDataFromApi(`/discover/${mediaType}`, { ...params, page: 3 })
        ]);
        
        const combinedResults = [...(page1?.results || []), ...(page2?.results || []), ...(page3?.results || [])];
        const res = {
          ...page1,
          results: combinedResults,
          total_pages: page1?.total_pages || 1
        };

        // Extract new genres from this batch
        const newGenres = extractUserGenresFromItems(res.results, watchedIds);
        newGenres.forEach(g => userGenresRef.current.add(g));

        // Sort & Mix
        if (res.results) {
            const sorted = sortItems(res.results, userGenresRef.current, { sortBy: sortKey });
            res.results = sortBy === "popularity.desc" ? mixCatalog(sorted) : sorted;
        }

        setData(res);
        pageRef.current = 4;
        setPageNum(4);
      } catch (error) {
        console.error("Error fetching K-Dramas:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, [mediaType, sortBy, watchedIds, language, selectedGenre]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchNextPageData = async () => {
    // Guard 1: one in-flight request at a time. InfiniteScroll can fire `next`
    // again before the first response lands, which double-appends a page.
    if (loadingMoreRef.current) return;
    // Guard 2: do not auto-retry a page that just failed — see the catch below.
    if (failedPageRef.current === pageRef.current) return;
    loadingMoreRef.current = true;

    try {
      const sortKey = mediaType === "movie" && sortBy === "first_air_date.desc" 
        ? "primary_release_date.desc" 
        : sortBy;

      const langParam = language === 'fr' ? 'fr-FR' : 'en-US';
      const now = new Date().toISOString().split('T')[0];
      const params: any = {
        with_original_language: "ko",
        without_genres: "16",
        sort_by: sortKey,
        language: langParam,
      };

      // Add date limit to avoid future releases filling the first page
      if (mediaType === "movie") {
        params["primary_release_date.lte"] = now;
      } else {
        params["first_air_date.lte"] = now;
      }

      // Filter out obscure daily shows that have high "popularity" but 0 votes
      params["vote_count.gte"] = 10;

      if (sortBy === "vote_average.desc") {
        params["vote_count.gte"] = 200;
      }

      if (selectedGenre) {
        params.with_genres = selectedGenre;
      }

      const [page1, page2] = await Promise.all([
        fetchDataFromApi(`/discover/${mediaType}`, { ...params, page: pageRef.current }),
        fetchDataFromApi(`/discover/${mediaType}`, { ...params, page: pageRef.current + 1 })
      ]);
      
      const combinedResults = [...(page1?.results || []), ...(page2?.results || [])];
      const res = {
        ...page1,
        results: combinedResults
      };
      
      if (data?.results) {
        // Extract new genres
        const newGenres = extractUserGenresFromItems(res.results, watchedIds);
        newGenres.forEach(g => userGenresRef.current.add(g));

        // Sort & Mix new results
        const sortedNewResults = sortItems(res.results, userGenresRef.current, { sortBy: sortKey });
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
    } catch (error) {
      // fetchDataFromApi re-throws (utils/api.ts:16), so any failed or hung TMDB
      // response lands here. Because pageRef did not advance, the scroll observer
      // kept re-firing `next` at the same failing page. Stop the loader and offer
      // a deliberate retry instead.
      console.error("[kdrama] failed to load more of the catalogue:", error);
      failedPageRef.current = pageRef.current;
      setLoadMoreFailed(true);
    } finally {
      loadingMoreRef.current = false;
    }
  };

  // Clearing the failure lets fetchNextPageData try the same page again — this
  // is the only path that does, so a retry is always a deliberate user action.
  const retryNextPage = () => {
    failedPageRef.current = null;
    setLoadMoreFailed(false);
    fetchNextPageData();
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <HeroBanner endpoint="/discover/tv" params={{ with_original_language: "ko", without_genres: "16" }} />
      
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
                      {t.nav.tvShows}
                  </button>
                  <button 
                      onClick={() => setMediaType("movie")}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${mediaType === "movie" ? "bg-[#E50914] text-white shadow-md" : "text-zinc-400 hover:text-white"}`}
                  >
                      {t.nav.movies}
                  </button>
              </div>

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

          {loading && !data ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
              {[...Array(10)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : (
            <>
              {data?.results?.length > 0 ? (
                <InfiniteScroll
                  dataLength={data?.results?.length || 0}
                  next={fetchNextPageData}
                  // hasMore must also go false when a page failed, otherwise the
                  // observer keeps calling `next` — the guards in fetchNextPageData
                  // would each return early, but the loader skeleton would stay on
                  // screen forever, which reads as "still loading" rather than
                  // "stopped, retry available".
                  hasMore={data && pageNum <= data.total_pages && data.total_pages > 0 && !loadMoreFailed}
                  loader={
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6 mt-6 w-full">
                      {[...Array(5)].map((_, i) => (
                        <SkeletonCard key={i} />
                      ))}
                    </div>
                  }
                  style={{ overflow: "visible" }}
                  scrollThreshold={0.8}
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
                  {/* Only reachable after fetchNextPageData actually failed, so
                      this is the one deliberate path that retries the same page. */}
                  {loadMoreFailed && (
                    <div className="flex flex-col items-center gap-4 mt-12">
                      <p className="text-sm text-white/40 text-center">{t.explore.loadMoreFailed}</p>
                      <button
                        type="button"
                        onClick={retryNextPage}
                        className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-all duration-300 hover:bg-zinc-800 hover:border-[#E50914]"
                      >
                        {t.explore.retry}
                      </button>
                    </div>
                  )}
                </InfiniteScroll>
              ) : (
                <div className="text-center text-white/50 py-20">
                  {t.explore.noResults}
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
