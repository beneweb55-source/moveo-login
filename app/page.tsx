"use client";

import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import HeroBanner from "@/components/HeroBanner";
import FeaturedGrid from "@/components/FeaturedGrid";
import Carousel from "@/components/Carousel";
import CTA from "@/components/CTA";
import HistorySection from "@/components/HistorySection";
import { fetchDataFromApi } from "@/utils/api";
import { getApiConfiguration, getGenres } from "@/store/homeSlice";
import { useLanguage } from "@/context/LanguageContext";

export default function Home() {
  const dispatch = useDispatch();
  const [trending, setTrending] = useState<any[]>([]);
  const [topFrance, setTopFrance] = useState<any[]>([]);
  const [popularMovies, setPopularMovies] = useState<any[]>([]);
  const [topRatedTv, setTopRatedTv] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { language, t } = useLanguage();

  useEffect(() => {
    const fetchGenres = async () => {
      try {
        const langParam = language === 'fr' ? 'fr-FR' : 'en-US';
        const [movieGenres, tvGenres] = await Promise.all([
          fetchDataFromApi("/genre/movie/list", { language: langParam }),
          fetchDataFromApi("/genre/tv/list", { language: langParam }),
        ]);

        const allGenres: any = {};
        movieGenres?.genres?.forEach((item: any) => (allGenres[item.id] = item.name));
        tvGenres?.genres?.forEach((item: any) => (allGenres[item.id] = item.name));

        dispatch(getGenres(allGenres));
      } catch (error) {
        console.error("Failed to fetch genres:", error);
      }
    };

    fetchGenres();
  }, [dispatch, language]);

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

        let rawTrending = trendingRes?.results || [];
        let rawTopFrance = topFranceRes?.results || [];
        let rawPopularMovies = popularRes?.results || [];
        let rawTopRatedTv = topRatedTvRes?.results || [];

        // Intelligent Sorting Logic
        const calculateScore = (item: any, userGenres: Set<number>) => {
          let score = 0;

          // 1. Base Rules
          const releaseDateStr = item.release_date || item.first_air_date;
          if (releaseDateStr) {
            const releaseDate = new Date(releaseDateStr);
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            if (releaseDate > sixMonthsAgo) {
              score += 12;
            }
          }

          if (item.vote_average > 7.5) {
            score += 8;
          }

          if (item.vote_count < 5000) {
            score -= 15;
          }

          // Documentary (99), Family (10751), Kids (10762)
          const genreIds = item.genre_ids || [];
          if (genreIds.some((id: number) => [99, 10751, 10762].includes(id))) {
            score -= 25;
          }

          // 2. User Preferences
          if (userGenres.size > 0) {
            const hasCommonGenre = genreIds.some((id: number) => userGenres.has(id));
            if (hasCommonGenre) {
              score += 15;
            }
          }

          return score;
        };

        const sortItems = (items: any[], userGenres: Set<number>) => {
          if (!items || items.length === 0) return [];
          return [...items].sort((a, b) => {
            const scoreA = calculateScore(a, userGenres);
            const scoreB = calculateScore(b, userGenres);
            return scoreB - scoreA;
          });
        };

        let userGenres = new Set<number>();
        try {
          const userListRes = await fetch('/api/user/list');
          if (userListRes.ok) {
            const data = await userListRes.json();
            const userList = data.list || [];
            const watchedOrFavIds = new Set(userList.map((i: any) => i.media_id.toString()));

            // Scan all fetched items to find user's genres
            const allItems = [...rawTrending, ...rawTopFrance, ...rawPopularMovies, ...rawTopRatedTv];
            allItems.forEach(item => {
              if (watchedOrFavIds.has(item.id.toString())) {
                item.genre_ids?.forEach((id: number) => userGenres.add(id));
              }
            });
          }
        } catch (e) {
          // Ignore error, proceed without user prefs
        }

        setTrending(sortItems(rawTrending, userGenres));
        setTopFrance(sortItems(rawTopFrance, userGenres));
        setPopularMovies(sortItems(rawPopularMovies, userGenres));
        setTopRatedTv(sortItems(rawTopRatedTv, userGenres));
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
      
      <main className="flex-1 relative z-20 w-full pb-20 space-y-12 md:space-y-24">
        {/* Trending Section - Bento Grid */}
        <section className="-mt-20 md:-mt-32 relative z-30">
          <FeaturedGrid 
            title={t.home.trending} 
            data={trending} 
            loading={loading} 
          />
        </section>
        
        {/* Other Sections - Carousels */}
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          <HistorySection />

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
        </div>

        {/* Call to Action */}
        <CTA />
      </main>
    </div>
  );
}
