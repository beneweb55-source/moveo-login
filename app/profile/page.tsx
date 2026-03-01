"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import ContentWrapper from "@/components/ContentWrapper";
import MovieCard from "@/components/MovieCard";
import { fetchDataFromApi } from "@/utils/api";
import { Loader2, Trash2 } from "lucide-react";

export default function ProfilePage() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState("watchlist");
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session?.user?.id) {
      fetchData(activeTab);
    }
  }, [activeTab, session]);

  const fetchData = async (type: string) => {
    setLoading(true);
    try {
      // In a real app, you would fetch the list of IDs from your DB
      // then fetch details from TMDB. For now, we'll simulate empty state
      // or you can implement the API to return full details if you store them.
      // Since we only store IDs, we need a way to get the movie details.
      
      // For this demo, we will assume the API returns the list of items with details
      // or we fetch them one by one.
      // Let's just show the empty state for now as we don't have data in the DB yet.
      setData([]); 
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (!session) return null;

  return (
    <div className="min-h-screen bg-[#0A0A0A] pt-24 pb-12">
      <ContentWrapper>
        {/* Profile Header */}
        <div className="flex flex-col md:flex-row items-center gap-8 mb-12">
          <div className="w-32 h-32 rounded-full bg-gradient-to-br from-[#E50914] to-red-900 flex items-center justify-center text-4xl font-bold text-white border-4 border-zinc-900 shadow-xl">
            {session.user?.name?.[0]?.toUpperCase()}
          </div>
          <div className="text-center md:text-left">
            <h1 className="text-3xl font-bold text-white mb-2">{session.user?.name}</h1>
            <p className="text-zinc-400">{session.user?.email}</p>
            <div className="flex items-center gap-6 mt-6">
              <div className="text-center">
                <span className="block text-2xl font-bold text-white">0</span>
                <span className="text-xs text-zinc-500 uppercase tracking-wider">Watchlist</span>
              </div>
              <div className="text-center">
                <span className="block text-2xl font-bold text-white">0</span>
                <span className="text-xs text-zinc-500 uppercase tracking-wider">Favoris</span>
              </div>
              <div className="text-center">
                <span className="block text-2xl font-bold text-white">0</span>
                <span className="text-xs text-zinc-500 uppercase tracking-wider">Vus</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-8 border-b border-white/10 mb-8 overflow-x-auto">
          {["watchlist", "favorites", "watched"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-4 text-sm font-medium uppercase tracking-wider transition-colors relative ${
                activeTab === tab ? "text-[#E50914]" : "text-zinc-400 hover:text-white"
              }`}
            >
              {tab}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#E50914]" />
              )}
            </button>
          ))}
        </div>

        {/* Content Grid */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-[#E50914] animate-spin" />
          </div>
        ) : data.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {data.map((item) => (
              <div key={item.id} className="relative group">
                <MovieCard data={item} mediaType={item.media_type} />
                <button className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-[#E50914] rounded-full text-white opacity-0 group-hover:opacity-100 transition-all duration-300">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-zinc-500 text-lg">Aucun contenu dans cette liste.</p>
            <button 
              onClick={() => router.push("/explore/movie")}
              className="mt-4 text-[#E50914] hover:underline"
            >
              Explorer les films
            </button>
          </div>
        )}
      </ContentWrapper>
    </div>
  );
}
