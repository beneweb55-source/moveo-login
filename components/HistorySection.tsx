"use client";

import React, { useState, useEffect } from "react";
import Carousel from "@/components/Carousel";
import HistoryCard from "@/components/HistoryCard";
import { getWatchHistory, getServerWatchHistory, WatchHistoryItem } from "@/utils/historyManager";
import { History } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

const HistorySection = () => {
  const [history, setHistory] = useState<WatchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();

  useEffect(() => {
    const loadHistory = async () => {
      // Try server first (for logged-in users), fallback to localStorage
      let items: WatchHistoryItem[] = [];
      
      try {
        const serverItems = await getServerWatchHistory();
        if (serverItems.length > 0) {
          items = serverItems;
        }
      } catch (e) {
        // Server unavailable, use localStorage
      }

      // Merge with localStorage items (localStorage may have more recent anonymous data)
      if (items.length === 0) {
        items = getWatchHistory();
      }
      
      // Filter items: Keep only if not finished (progress < 95%) or if progress is unknown
      const unfinishedHistory = items.filter(item => {
        if (item.duration && item.timestamp) {
          const progress = item.timestamp / item.duration;
          return progress < 0.95;
        }
        return true;
      });

      setHistory(unfinishedHistory);
      setLoading(false);
    };

    loadHistory();
  }, []);

  if (history.length === 0) {
    return null;
  }

  return (
    <div className="relative mb-12">
      <h2 className="text-2xl md:text-3xl font-bold mb-8 text-white flex items-center gap-2">
        <span className="w-1 h-8 bg-[#E50914] rounded-full mr-2"></span>
        <History className="w-6 h-6 text-[#E50914]" />
        {t.home.resumeWatching}
      </h2>
      
      <Carousel 
        data={history} 
        loading={loading} 
        renderItem={(item) => <HistoryCard item={item} />}
      />
    </div>
  );
};

export default HistorySection;
