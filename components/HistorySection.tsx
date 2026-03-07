"use client";

import React, { useState, useEffect } from "react";
import Carousel from "@/components/Carousel";
import HistoryCard from "@/components/HistoryCard";
import { getWatchHistory, WatchHistoryItem } from "@/utils/historyManager";
import { History } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

const HistorySection = () => {
  const [history, setHistory] = useState<WatchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();

  useEffect(() => {
    // Load history from localStorage
    const savedHistory = getWatchHistory();
    
    // Filter items: Keep only if not finished (progress < 95%) or if progress is unknown
    const unfinishedHistory = savedHistory.filter(item => {
      if (item.duration && item.timestamp) {
        const progress = item.timestamp / item.duration;
        return progress < 0.95;
      }
      return true; // Keep if we don't know the progress
    });

    setTimeout(() => {
      setHistory(unfinishedHistory);
      setLoading(false);
    }, 0);
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
