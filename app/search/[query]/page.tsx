"use client";

import { useState, useEffect } from "react";
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
  const [userGenres, setUserGenres] = useState<Set<number>>(new Set());

  const { query } = useParams();
  const router = useRouter();
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
    const fetchInitialData = async () => {
      setLoading(true);
      const langParam = language === 'fr' ? 'fr-FR' : 'en-US';
      const decodedQuery = decodeURIComponent(query as string);

      try {
        // 1. Check for a highly relevant person first
        const personSearchRes = await fetchDataFromApi(`/search/person?query=${encodeURIComponent(decodedQuery)}&language=${langParam}&include_adult=false`);
        
        if (personSearchRes?.results?.length > 0) {
          const firstPerson = personSearchRes.results[0];
          if (firstPerson.popularity > 5) {
            router.replace(`/person/${firstPerson.id}`);
            return; // Stop here, we found a person and are redirecting
          }
        }

        // 2. Fallback to multi search
        const multiSearchRes = await fetchDataFromApi(`/search/multi?query=${encodeURIComponent(decodedQuery)}&page=1&language=${langParam}&include_adult=false`);
        
        // Extract new genres from this batch
        const newGenres = extractUserGenresFromItems(multiSearchRes?.results || [], watchedIds);
        const updatedUserGenres = new Set([...userGenres, ...newGenres]);
        setUserGenres(updatedUserGenres);

        // Sort
        if (multiSearchRes?.results) {
            multiSearchRes.results = sortItems(multiSearchRes.results, updatedUserGenres);
        }

        setData(multiSearchRes);
        setPageNum(2);
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
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-8"
                dataLength={data?.results?.length || 0}
                next={fetchNextPageData}
                hasMore={pageNum <= data?.total_pages}
                loader={<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-8 mt-6 col-span-full w-full"><Spinner /></div>}
              >
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
