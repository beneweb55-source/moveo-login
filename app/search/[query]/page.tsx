"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import InfiniteScroll from "react-infinite-scroll-component";
import { fetchDataFromApi } from "@/utils/api";
import ContentWrapper from "@/components/ContentWrapper";
import MovieCard from "@/components/MovieCard";
import Spinner from "@/components/Spinner";
import { useLanguage } from "@/context/LanguageContext";
import Image from "next/image";
import { User } from "lucide-react";

import { motion } from "motion/react";

import { sortItems, getUserWatchedIds, extractUserGenresFromItems } from "@/utils/sorting";

const SearchResult = () => {
  const [data, setData] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [loading, setLoading] = useState(false);
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const userGenresRef = useRef<Set<number>>(new Set());
  const pageRef = useRef(1);
  // Pagination failure handling — same defect and same guards as /films. See the
  // comments in fetchNextPageData below.
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const loadingMoreRef = useRef(false);
  const failedPageRef = useRef<number | null>(null);

  const { query } = useParams();
  const router = useRouter();
  const { language, t } = useLanguage();

  // Fetch Watched IDs on mount
  useEffect(() => {
    getUserWatchedIds().then(ids => setWatchedIds(ids));
  }, []);
  
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
    Promise.all([
      fetchDataFromApi(`/search/multi?query=${encodeURIComponent(query as string)}&page=${pageRef.current}&language=${langParam}&include_adult=false`),
      fetchDataFromApi(`/search/multi?query=${encodeURIComponent(query as string)}&page=${pageRef.current + 1}&language=${langParam}&include_adult=false`)
    ]).then(
      ([page1, page2]) => {
        const combinedResults = [...(page1?.results || []), ...(page2?.results || [])];
        const res = {
          ...page1,
          results: combinedResults
        };

        if (data?.results) {
          // Extract new genres
          const newGenres = extractUserGenresFromItems(res.results, watchedIds);
          newGenres.forEach(g => userGenresRef.current.add(g));

          // Sort new results
          const sortedNewResults = sortItems(res.results, userGenresRef.current);

          setData({
            ...data,
            results: [...data.results, ...sortedNewResults],
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
      // unhandled, the loader spinner never resolved, and — because pageRef did
      // not advance — the scroll observer kept re-firing `next` at the same
      // failing page. Stop the loader and offer a deliberate retry instead.
      console.error("[search] failed to load more results:", error);
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

  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      pageRef.current = 1;
      setPageNum(1);
      // A new query is a fresh start: clear any give-up state from a previous
      // pagination failure, otherwise the new results paginate no further than
      // the old failure allowed.
      setLoadMoreFailed(false);
      failedPageRef.current = null;
      const langParam = language === 'fr' ? 'fr-FR' : 'en-US';
      const decodedQuery = decodeURIComponent(query as string);

      try {
        // Fallback to multi search
        const [page1, page2] = await Promise.all([
          fetchDataFromApi(`/search/multi?query=${encodeURIComponent(decodedQuery)}&page=1&language=${langParam}&include_adult=false`),
          fetchDataFromApi(`/search/multi?query=${encodeURIComponent(decodedQuery)}&page=2&language=${langParam}&include_adult=false`)
        ]);
        
        const combinedResults = [...(page1?.results || []), ...(page2?.results || [])];
        const multiSearchRes = {
          ...page1,
          results: combinedResults,
          total_pages: page1?.total_pages || 1
        };
        
        // Extract new genres from this batch
        const newGenres = extractUserGenresFromItems(multiSearchRes.results, watchedIds);
        newGenres.forEach(g => userGenresRef.current.add(g));

        // Sort
        if (multiSearchRes.results) {
            multiSearchRes.results = sortItems(multiSearchRes.results, userGenresRef.current);
        }

        setData(multiSearchRes);
        pageRef.current = 3;
        setPageNum(3);
      } catch (error) {
        console.error("Error fetching search results:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, language, watchedIds]);

  const persons = data?.results?.filter((item: any) => item.media_type === "person") || [];
  const media = data?.results?.filter((item: any) => item.media_type !== "person") || [];

  return (
    <div className="min-h-[700px] pt-[100px] pb-20 overflow-x-hidden">
      {loading && <Spinner initial={true} />}
      {!loading && (
        <ContentWrapper>
          {data?.results?.length > 0 ? (
            // Fallback Multi Search View
            <>
              <div className="text-2xl font-bold text-white mb-6">
                {t.search.resultsFor} &apos;{decodeURIComponent(query as string)}&apos;
              </div>
              
              {persons.length > 0 && (
                <div className="mb-10">
                  <h2 className="text-xl font-bold text-white mb-4">{t.search.people || "People"}</h2>
                  <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4">
                    {persons.map((person: any) => (
                      <div 
                        key={person.id}
                        onClick={() => router.push('/person/' + person.id)}
                        className="flex-shrink-0 w-36 cursor-pointer group flex flex-col items-center gap-2"
                      >
                        <div className="w-24 h-24 rounded-full overflow-hidden relative bg-zinc-700 group-hover:ring-2 group-hover:ring-[#E50914] transition-all duration-300 group-hover:scale-105 shadow-lg">
                          {person.profile_path ? (
                            <Image
                              src={`https://image.tmdb.org/t/p/w185${person.profile_path}`}
                              alt={person.name}
                              fill
                              className="object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xl font-bold text-white/50">
                              {person.name.charAt(0)}
                            </div>
                          )}
                        </div>
                        <div className="text-center w-full">
                          <p className="text-sm font-bold text-white truncate w-full px-1">{person.name}</p>
                          <p className="text-xs text-zinc-400 truncate w-full px-1">{person.known_for_department}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <InfiniteScroll
                dataLength={data?.results?.length || 0}
                next={fetchNextPageData}
                // hasMore must also go false when a page failed, otherwise the
                // observer keeps calling `next` — the guards in fetchNextPageData
                // would each return early, but the loader spinner would stay on
                // screen forever, which reads as "still loading" rather than
                // "stopped, retry available".
                hasMore={data && pageNum <= data.total_pages && data.total_pages > 0 && !loadMoreFailed}
                loader={<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-8 mt-6 col-span-full w-full"><Spinner /></div>}
                style={{ overflow: "visible" }}
                scrollThreshold={0.8}
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-8">
                  {media.map((item: any, index: number) => (
                    <motion.div
                      key={`${item.id}-${index}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: index % 10 * 0.05 }}
                    >
                      <MovieCard
                        data={item}
                      />
                    </motion.div>
                  ))}
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
            </>
          ) : (
            <div className="text-center text-white/50 py-20">
              <span className="text-xl">{t.search.noResults || "No results found"}</span>
            </div>
          )}
        </ContentWrapper>
      )}
    </div>
  );
};

export default SearchResult;
