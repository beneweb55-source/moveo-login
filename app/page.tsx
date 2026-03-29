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
import { useMoveoCore } from "@/hooks/useMoveoCore";

import { sortItems, getUserWatchedIds, extractUserGenresFromItems, mixCatalog } from "@/utils/sorting";

export default function Home() {
  const dispatch = useDispatch();
  const [trending, setTrending] = useState<any[]>([]);
  const [topFrance, setTopFrance] = useState<any[]>([]);
  const [popularMovies, setPopularMovies] = useState<any[]>([]);
  const [topRatedTv, setTopRatedTv] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { language, t } = useLanguage();
  const profile = useMoveoCore();
  const [customHero, setCustomHero] = useState<any>(null);
  const [pinnedSections, setPinnedSections] = useState<any[]>([]);
  const [sectionData, setSectionData] = useState<Record<string | number, any[]>>({});

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/admin/content');
        if (res.ok) {
          const data = await res.json();
          if (data.hero_movie) {
            try {
              setCustomHero(typeof data.hero_movie === 'string' ? JSON.parse(data.hero_movie) : data.hero_movie);
            } catch (e) {
              setCustomHero(data.hero_movie);
            }
          }
        }
      } catch (e) {
        console.error('Failed to fetch settings', e);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    const fetchPinned = async () => {
      try {
        const res = await fetch('/api/admin/sections');
        if (res.ok) {
          const data = await res.json();
          setPinnedSections(data);
          
          const langParam = language === 'fr' ? 'fr-FR' : 'en-US';
          
          const results = await Promise.all(data.map(async (section: any) => {
            const [path, queryString] = section.endpoint.split('?');
            const params = Object.fromEntries(new URLSearchParams(queryString));
            const resData = await fetchDataFromApi(path, { ...params, language: langParam });
            return { id: section.id, data: resData?.results || [] };
          }));
          
          const newData: Record<string | number, any[]> = {};
          results.forEach(r => newData[r.id] = r.data);
          setSectionData(prev => ({ ...prev, ...newData }));
        }
      } catch (e) {
        console.error('Failed to fetch pinned sections', e);
      }
    };
    fetchPinned();
  }, [language]);

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
        
        // Use Discover endpoint for trending to support genre filtering
        // This replaces the static /trending/all/day
        const trendingEndpoint = "/trending/all/day";
        const trendingParams: any = {
          language: langParam,
        };
        if (!profile.genreIds?.includes(16)) {
          trendingParams.without_genres = "16";
        }

        const [trendingRes, topFranceRes, popularRes, topRatedTvRes, animesRes, kdramasRes] = await Promise.all([
          fetchDataFromApi("/discover/movie", { ...trendingParams, sort_by: "popularity.desc", "vote_count.gte": 10 }),
          fetchDataFromApi("/discover/movie", { region: "FR", language: langParam, sort_by: "popularity.desc", without_genres: "16", "vote_count.gte": 10 }),
          fetchDataFromApi("/discover/movie", { language: langParam, sort_by: "popularity.desc", without_genres: "16", "vote_count.gte": 10 }),
          fetchDataFromApi("/discover/tv", { language: langParam, sort_by: "vote_average.desc", "vote_count.gte": 200, without_genres: "16" }),
          fetchDataFromApi("/discover/tv", { with_genres: "16", with_original_language: "ja", language: langParam, "vote_count.gte": 10 }),
          fetchDataFromApi("/discover/tv", { with_original_language: "ko", without_genres: "16", language: langParam, "vote_count.gte": 10 }),
        ]);

        let rawTrending = trendingRes?.results || [];
        let rawTopFrance = topFranceRes?.results || [];
        let rawPopularMovies = popularRes?.results || [];
        let rawTopRatedTv = topRatedTvRes?.results || [];
        let rawAnimes = animesRes?.results || [];
        let rawKdramas = kdramasRes?.results || [];

        // Intelligent Sorting Logic
        let userGenres = new Set<number>();
        try {
          const watchedIds = await getUserWatchedIds();
          const allItems = [...rawTrending, ...rawTopFrance, ...rawPopularMovies, ...rawTopRatedTv, ...rawAnimes, ...rawKdramas];
          userGenres = extractUserGenresFromItems(allItems, watchedIds);
        } catch (e) {
          // Ignore error, proceed without user prefs
        }

        setTrending(mixCatalog(sortItems(rawTrending, userGenres, { minVoteCount: 0, minVoteAverage: 0, excludeGenres: false })));
        setTopFrance(sortItems(rawTopFrance, userGenres)); // Top 10 usually doesn't need mixing
        setPopularMovies(mixCatalog(sortItems(rawPopularMovies, userGenres)));
        setTopRatedTv(mixCatalog(sortItems(rawTopRatedTv, userGenres)));
        
        // Add extra data for fallback sections
        setSectionData(prev => ({
          ...prev,
          'animes': mixCatalog(sortItems(rawAnimes, userGenres)),
          'kdramas': mixCatalog(sortItems(rawKdramas, userGenres))
        }));
        
        // Debugging
        console.log('Home page - triggering AI recommendation with:', [...rawTrending, ...rawTopFrance, ...rawPopularMovies, ...rawTopRatedTv].slice(0, 10));
      } catch (error) {
        console.error("Failed to fetch homepage data:", error);
      } finally {
        setLoading(false);
      }
    };

    if (profile.id) {
        fetchAllData();
    }
  }, [language, profile]);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col overflow-x-hidden">
      <HeroBanner 
        endpoint="/discover/movie"
        params={{ 
            with_genres: profile.genreIds?.join(","),
            without_genres: profile.genreIds?.includes(16) ? undefined : "16",
            sort_by: "popularity.desc",
            "vote_count.gte": 100
        }}
        headline={profile.headline}
        themeColor={profile.color}
        customMovie={customHero}
      />
      
      <main className="flex-1 relative z-20 w-full pb-40 space-y-24 md:space-y-40">
        {/* Trending Section - Bento Grid */}
        <section className="-mt-8 md:-mt-24 relative z-30">
          <FeaturedGrid 
            title={t.home.trending} 
            data={trending} 
            loading={loading} 
          />
        </section>
        
        {/* Other Sections - Carousels */}
        <div className="max-w-[1800px] mx-auto px-4 sm:px-8 lg:px-12 space-y-24 md:space-y-40">
          <HistorySection />

          {pinnedSections.length > 0 ? (
            pinnedSections.map((section) => (
              <Carousel 
                key={section.id}
                title={section.title} 
                data={sectionData[section.id] || []} 
                loading={!sectionData[section.id]} 
                endpoint={section.endpoint.includes('/tv/') || section.endpoint.startsWith('tv/') ? 'tv' : 'movie'} 
              />
            ))
          ) : (
            <>
              <Carousel 
                title={t.home.top10} 
                data={topFrance.slice(0, 10)} 
                loading={loading} 
                endpoint="movie" 
              />
              <Carousel 
                title="Animes" 
                data={sectionData['animes'] || []} 
                loading={loading} 
                endpoint="tv" 
              />
              <Carousel 
                title="K-Dramas" 
                data={sectionData['kdramas'] || []} 
                loading={loading} 
                endpoint="tv" 
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
            </>
          )}
        </div>

        {/* Call to Action */}
        <CTA />
      </main>
    </div>
  );
}
