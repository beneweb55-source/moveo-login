"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import InfiniteScroll from "react-infinite-scroll-component";
import { fetchDataFromApi } from "@/utils/api";
import ContentWrapper from "@/components/ContentWrapper";
import MovieCard from "@/components/MovieCard";
import Spinner from "@/components/Spinner";
import { useLanguage } from "@/context/LanguageContext";

import { motion } from "motion/react";

import { sortItems, getUserWatchedIds, extractUserGenresFromItems } from "@/utils/sorting";

const SearchResult = () => {
  const [data, setData] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [loading, setLoading] = useState(false);
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const [userGenres, setUserGenres] = useState<Set<number>>(new Set());

  const { query } = useParams();
  const { language, t } = useLanguage();

  // Fetch Watched IDs on mount
  useEffect(() => {
    getUserWatchedIds().then(ids => setWatchedIds(ids));
  }, []);
  
  const fetchNextPageData = () => {
    const langParam = language === 'fr' ? 'fr-FR' : 'en-US';
    fetchDataFromApi(`/search/multi?query=${encodeURIComponent(query as string)}&page=${pageNum}&language=${langParam}&include_adult=false`).then(
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

  useEffect(() => {
    const fetchInitialData = () => {
      setLoading(true);
      const langParam = language === 'fr' ? 'fr-FR' : 'en-US';
      fetchDataFromApi(`/search/multi?query=${encodeURIComponent(query as string)}&page=1&language=${langParam}&include_adult=false`).then(
        (res) => {
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
        }
      );
    };

    fetchInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, language, watchedIds]);

  return (
    <div className="min-h-[700px] pt-[100px]">
      {loading && <Spinner initial={true} />}
      {!loading && (
        <ContentWrapper>
          {data?.results?.length > 0 ? (
            <>
              <div className="text-2xl font-bold text-white mb-6">
                {t.search.resultsFor} &apos;{decodeURIComponent(query as string)}&apos;
              </div>
              <InfiniteScroll
                className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 md:gap-8"
                dataLength={data?.results?.length || 0}
                next={fetchNextPageData}
                hasMore={pageNum <= data?.total_pages}
                loader={<Spinner />}
              >
                {data?.results.map((item: any, index: number) => {
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
                      />
                    </motion.div>
                  );
                })}
              </InfiniteScroll>
            </>
          ) : (
            <span className="text-2xl text-white/50">
              {t.search.noResults}
            </span>
          )}
        </ContentWrapper>
      )}
    </div>
  );
};

export default SearchResult;
