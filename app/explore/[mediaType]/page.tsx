"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import InfiniteScroll from "react-infinite-scroll-component";
import { fetchDataFromApi } from "@/utils/api";
import ContentWrapper from "@/components/ContentWrapper";
import MovieCard from "@/components/MovieCard";
import SkeletonCard from "@/components/SkeletonCard";
import { useLanguage } from "@/context/LanguageContext";
import { ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import { sortItems, getUserWatchedIds, extractUserGenresFromItems, mixCatalog, sameIdSet } from "@/utils/sorting";

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
  const userGenresRef = useRef<Set<number>>(new Set());
  const pageRef = useRef(1);
  // Pagination failure handling — same defect and same guards as /films. See the
  // comments in fetchNextPageData below.
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const loadingMoreRef = useRef(false);
  const failedPageRef = useRef<number | null>(null);

  const { mediaType } = useParams();
  const { language, t } = useLanguage();

  // Fetch Watched IDs on mount
  useEffect(() => {
    // Store only a real change: sameIdSet keeps object identity, so an unchanged
    // (e.g. empty, logged-out) list does not re-run the initial-fetch effect below.
    getUserWatchedIds().then(ids => setWatchedIds(prev => (sameIdSet(prev, ids) ? prev : ids)));
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
      pageRef.current = 1;
      setPageNum(1);
      // A new filter/sort selection is a fresh start: clear any give-up state
      // from a previous pagination failure, otherwise the new list paginates
      // no further than the old one did.
      setLoadMoreFailed(false);
      failedPageRef.current = null;

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
      
      // Filter out obscure daily shows that have high "popularity" but 0 votes
      params["vote_count.gte"] = 10;

      if (sortBy === "vote_average.desc") {
        params["vote_count.gte"] = 200;
      }

      if (selectedGenre) {
        params.with_genres = selectedGenre;
        if (selectedGenre !== "16") {
          params.without_genres = "16";
        }
      } else {
        params.without_genres = "16";
      }

      Promise.all([
        fetchDataFromApi(`/discover/${mediaType}`, { ...params, page: 1 }),
        fetchDataFromApi(`/discover/${mediaType}`, { ...params, page: 2 }),
        fetchDataFromApi(`/discover/${mediaType}`, { ...params, page: 3 })
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
            const sorted = sortItems(res.results, userGenresRef.current, { sortBy: finalSortBy });
            res.results = finalSortBy === "popularity.desc" ? mixCatalog(sorted) : sorted;
        }

        setData(res);
        pageRef.current = 4;
        setPageNum(4);
      }).catch((error) => {
        // fetchDataFromApi re-throws (utils/api.ts:16), so any failed or hung TMDB
        // response rejects this promise. Without a handler the rejection was
        // unhandled AND setLoading(false) never ran, because it sat inside the
        // .then — so the page showed skeletons forever, with no error and no retry.
        console.error("[explore] failed to load the initial catalogue:", error);
      }).finally(() => {
        setLoading(false);
      });
    };

    fetchInitialData();
  }, [mediaType, language, sortBy, selectedGenre, watchedIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchNextPageData = () => {
    // Guard 1: one in-flight request at a time. InfiniteScroll can fire `next`
    // again before the first response lands, which double-appends a page.
    if (loadingMoreRef.current) return;
    // Guard 2: do not auto-retry a page that just failed. The page counter does
    // not advance on failure, so without this the scroll observer keeps calling
    // back into the same failing request for as long as the user sits at the
    // bottom — one transient TMDB failure became a retry storm.
    if (failedPageRef.current === pageRef.current) return;
    loadingMoreRef.current = true;

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
    
    // Filter out obscure daily shows that have high "popularity" but 0 votes
    params["vote_count.gte"] = 10;

    if (sortBy === "vote_average.desc") {
      params["vote_count.gte"] = 200;
    }

    if (selectedGenre) {
      params.with_genres = selectedGenre;
      if (selectedGenre !== "16") {
        params.without_genres = "16";
      }
    } else {
      params.without_genres = "16";
    }

    Promise.all([
      fetchDataFromApi(`/discover/${mediaType}`, { ...params, page: pageRef.current }),
      fetchDataFromApi(`/discover/${mediaType}`, { ...params, page: pageRef.current + 1 })
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

          const sortedNewResults = sortItems(res.results, userGenresRef.current, { sortBy: finalSortBy });
          const mixedNewResults = finalSortBy === "popularity.desc" ? mixCatalog(sortedNewResults) : sortedNewResults;

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
    ).catch((error) => {
      // fetchDataFromApi re-throws (utils/api.ts:16), so any failed or hung TMDB
      // response rejects this promise. Without this handler the rejection was
      // unhandled, the loader skeleton never resolved, and — because pageRef did
      // not advance — the scroll observer kept re-firing `next` at the same
      // failing page. Stop the loader and offer a deliberate retry instead.
      console.error("[explore] failed to load more of the catalogue:", error);
      failedPageRef.current = pageRef.current;
      setLoadMoreFailed(true);
    }).finally(() => {
      loadingMoreRef.current = false;
    });
  };

  // Clearing the failure lets fetchNextPageData try the same page again — this
  // is the only path that does, so a retry is always a deliberate user action.
  const retryNextPage = () => {
    failedPageRef.current = null;
    setLoadMoreFailed(false);
    fetchNextPageData();
  };

  return (
    <div className="min-h-screen pt-[120px] pb-20 bg-[#0A0A0A] overflow-x-hidden">
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
                dataLength={data?.results?.length || 0}
                next={fetchNextPageData}
                // hasMore must also go false when a page failed, otherwise the
                // observer keeps calling `next` — the guards in fetchNextPageData
                // would each return early, but the loader skeleton would stay on
                // screen forever, which reads as "still loading" rather than
                // "stopped, retry available".
                hasMore={data && pageNum <= data.total_pages && data.total_pages > 0 && !loadMoreFailed}
                loader={
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 md:gap-10 mt-10 col-span-full w-full">
                    {[...Array(6)].map((_, i) => (
                      <SkeletonCard key={i} />
                    ))}
                  </div>
                }
                style={{ overflow: "visible" }}
                scrollThreshold={0.8}
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 md:gap-10">
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
                </div>
                {/* Only reachable after fetchNextPageData actually failed, so this
                    is the one deliberate path that retries the same page. */}
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
