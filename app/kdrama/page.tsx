"use client";

import React, { useState, useEffect } from "react";
import { fetchDataFromApi } from "@/utils/api";
import ContentWrapper from "@/components/ContentWrapper";
import MovieCard from "@/components/MovieCard";
import SwitchTabs from "@/components/SwitchTabs";
import InfiniteScroll from "react-infinite-scroll-component";
import { Loader2 } from "lucide-react";

const KDramaPage = () => {
  const [data, setData] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [loading, setLoading] = useState(false);
  const [endpoint, setEndpoint] = useState("tv"); // 'tv' or 'movie'
  const [sortBy, setSortBy] = useState("popularity.desc");

  const sortOptions = [
    { name: "Populaires", value: "popularity.desc" },
    { name: "Mieux notés", value: "vote_average.desc" },
    { name: "Récents", value: "first_air_date.desc" },
  ];

  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      try {
        const sortKey = endpoint === "movie" && sortBy === "first_air_date.desc" 
          ? "release_date.desc" 
          : sortBy;

        const res = await fetchDataFromApi(`/discover/${endpoint}`, {
          with_original_language: "ko",
          sort_by: sortKey,
          page: 1,
        });
        setData(res);
        setPageNum(1);
      } catch (error) {
        console.error("Error fetching K-Dramas:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, [endpoint, sortBy]);

  const fetchNextPageData = async () => {
    try {
      const sortKey = endpoint === "movie" && sortBy === "first_air_date.desc" 
        ? "release_date.desc" 
        : sortBy;

      const res = await fetchDataFromApi(`/discover/${endpoint}`, {
        with_original_language: "ko",
        sort_by: sortKey,
        page: pageNum + 1,
      });
      
      if (data?.results) {
        setData({
          ...data,
          results: [...data.results, ...res.results],
        });
      } else {
        setData(res);
      }
      setPageNum((prev) => prev + 1);
    } catch (error) {
      console.error("Error fetching next page:", error);
    }
  };

  const onTabChange = (tab: string) => {
    setEndpoint(tab === "Séries" ? "tv" : "movie");
  };

  const onSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortBy(e.target.value);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] pt-24 pb-10">
      <ContentWrapper>
        <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
          <h2 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2">
            <span className="w-1 h-8 bg-[#E50914] rounded-full mr-2"></span>
            K-Dramas
          </h2>
          
          <div className="flex flex-wrap items-center gap-4 justify-end">
            <select
              onChange={onSortChange}
              className="bg-[#141414] text-white border border-white/10 rounded-full px-4 py-2 outline-none focus:border-[#E50914] transition-colors appearance-none cursor-pointer hover:bg-[#1a1a1a]"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.name}
                </option>
              ))}
            </select>
            <SwitchTabs data={["Séries", "Films"]} onTabChange={onTabChange} />
          </div>
        </div>

        {loading && !data ? (
          <div className="flex items-center justify-center h-[50vh]">
            <Loader2 className="w-10 h-10 text-[#E50914] animate-spin" />
          </div>
        ) : (
          <>
            {data?.results?.length > 0 ? (
              <InfiniteScroll
                className="content-grid"
                dataLength={data?.results?.length || 0}
                next={fetchNextPageData}
                hasMore={pageNum < (data?.total_pages || 1)}
                loader={
                  <div className="flex items-center justify-center p-4 col-span-full">
                    <Loader2 className="w-6 h-6 text-[#E50914] animate-spin" />
                  </div>
                }
              >
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
                  {data?.results?.map((item: any, index: number) => {
                    if (!item.poster_path) return null;
                    return (
                      <MovieCard
                        key={`${item.id}-${index}`}
                        data={item}
                        mediaType={endpoint}
                      />
                    );
                  })}
                </div>
              </InfiniteScroll>
            ) : (
              <div className="text-center text-white/50 py-20">
                Aucun résultat trouvé.
              </div>
            )}
          </>
        )}
      </ContentWrapper>
    </div>
  );
};

export default KDramaPage;
