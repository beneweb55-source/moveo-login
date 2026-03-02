"use client";

import { useState, useEffect } from "react";
import Carousel from "@/components/Carousel";
import HeroBanner from "@/components/HeroBanner";
import { fetchDataFromApi } from "@/utils/api";
import { useLanguage } from "@/context/LanguageContext";

export default function Home() {
  const [trending, setTrending] = useState<any[]>([]);
  const [topFrance, setTopFrance] = useState<any[]>([]);
  const [popularMovies, setPopularMovies] = useState<any[]>([]);
  const [topRatedTv, setTopRatedTv] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { language, t } = useLanguage();

  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true);
      try {
        const langParam = language === 'fr' ? 'fr-FR' : 'en-US';
        const [trendingRes, topFranceRes, popularRes, topRatedTvRes] = await Promise.all([
          fetchDataFromApi("/trending/all/day", { language: langParam }),
          fetchDataFromApi("/movie/popular", { region: "FR", language: langParam }),
          fetchDataFromApi("/movie/popular", { language: langParam }),
          fetchDataFromApi("/tv/top_rated", { language: langParam }),
        ]);

        setTrending(trendingRes?.results || []);
        setTopFrance(topFranceRes?.results || []);
        setPopularMovies(popularRes?.results || []);
        setTopRatedTv(topRatedTvRes?.results || []);
      } catch (error) {
        console.error("Failed to fetch homepage data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, [language]);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col">
      <HeroBanner />
      
      <main className="flex-1 relative z-20 px-4 sm:px-6 lg:px-8 max-w-[1400px] mx-auto w-full pb-20 -mt-20 md:-mt-32">
        <Carousel 
          title={t.home.trending} 
          data={trending} 
          loading={loading} 
          endpoint="movie" 
        />
        
        <Carousel 
          title={t.home.top10} 
          data={topFrance.slice(0, 10)} 
          loading={loading} 
          endpoint="movie" 
        />
        
        <Carousel 
          title={t.home.popularMovies} 
          data={popularMovies} 
          loading={loading} 
          endpoint="movie" 
        />
        
        <Carousel 
          title={t.home.popularTv} 
          data={topRatedTv} 
          loading={loading} 
          endpoint="tv" 
        />
      </main>
    </div>
  );
}
