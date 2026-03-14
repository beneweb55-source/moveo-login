"use client";

import { useState, useEffect } from "react";
import { Bookmark, Heart, Eye, Loader2, Check } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

interface ActionButtonsProps {
  id: string;
  type: "movie" | "tv";
  title: string;
  posterPath: string | null;
}

export default function ActionButtons({ id, type, title, posterPath }: ActionButtonsProps) {
  const [user, setUser] = useState<any>(null);
  const [lists, setLists] = useState<string[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const { t } = useLanguage();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    const checkListStatus = async () => {
      if (!user) return;
      try {
        const res = await fetch(`/api/user/status?media_type=${type}&media_id=${id}`);
        if (res.ok) {
          const data = await res.json();
          setLists(data.lists || []);
        }
      } catch (error) {
        console.error('Error checking list status:', error);
      }
    };
    checkListStatus();
  }, [type, id, user]);

  const showNotification = (message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3000);
    
    // Dispatch a custom event to update the header counters if needed
    window.dispatchEvent(new Event('list-updated'));
  };

  const toggleList = async (listType: string) => {
    if (!user) return;
    
    setLoading(listType);
    const inList = lists.includes(listType);
    
    try {
      if (inList) {
        const res = await fetch('/api/lists/remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, type, list_type: listType }),
        });
        if (res.ok) {
          setLists(lists.filter(l => l !== listType));
          showNotification(`${t.actionButtons.removedFrom} ${listType === 'watchlist' ? t.actionButtons.yourList : listType === 'favorites' ? t.actionButtons.yourFavorites : t.actionButtons.yourWatched}`);
        }
      } else {
        const res = await fetch('/api/lists/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tmdbId: id,
            type,
            list_type: listType,
            title,
            poster_path: posterPath,
          }),
        });
        if (res.ok) {
          setLists([...lists, listType]);
          showNotification(`${t.actionButtons.addedTo} ${listType === 'watchlist' ? t.actionButtons.yourList : listType === 'favorites' ? t.actionButtons.yourFavorites : t.actionButtons.yourWatched}`);
        }
      }
    } catch (error) {
      console.error('Error toggling list:', error);
    } finally {
      setLoading(null);
    }
  };

  if (!user) return null;

  return (
    <div className="flex flex-col gap-2 md:gap-3 mt-4 md:mt-6 mb-6 md:mb-8">
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <button
          onClick={() => toggleList('watchlist')}
          disabled={loading === 'watchlist'}
          title={t.actionButtons.addToList}
          className={`flex items-center gap-2 px-3 py-2 md:px-4 md:py-2.5 rounded-full text-xs md:text-sm font-medium transition-all duration-300 border ${
            lists.includes('watchlist')
              ? 'bg-blue-600/20 border-blue-500/50 text-blue-400 hover:bg-blue-600/30' 
              : 'bg-transparent border-white/20 text-white hover:border-white/50 hover:bg-white/5'
          }`}
        >
          {loading === 'watchlist' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : lists.includes('watchlist') ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Bookmark className="w-3.5 h-3.5" />
          )}
          {t.actionButtons.myList}
        </button>

        <button
          onClick={() => toggleList('favorites')}
          disabled={loading === 'favorites'}
          title={t.actionButtons.addToFavorites}
          className={`flex items-center gap-2 px-3 py-2 md:px-4 md:py-2.5 rounded-full text-xs md:text-sm font-medium transition-all duration-300 border ${
            lists.includes('favorites')
              ? 'bg-pink-500/20 border-pink-500/50 text-pink-400 hover:bg-pink-500/30' 
              : 'bg-transparent border-white/20 text-white hover:border-white/50 hover:bg-white/5'
          }`}
        >
          {loading === 'favorites' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : lists.includes('favorites') ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Heart className="w-3.5 h-3.5" />
          )}
          {t.actionButtons.favorites}
        </button>

        <button
          onClick={() => toggleList('watched')}
          disabled={loading === 'watched'}
          title={t.actionButtons.alreadyWatched}
          className={`flex items-center gap-2 px-3 py-2 md:px-4 md:py-2.5 rounded-full text-xs md:text-sm font-medium transition-all duration-300 border ${
            lists.includes('watched')
              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/30' 
              : 'bg-transparent border-white/20 text-white hover:border-white/50 hover:bg-white/5'
          }`}
        >
          {loading === 'watched' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : lists.includes('watched') ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Eye className="w-3.5 h-3.5" />
          )}
          <span className="hidden xs:inline">{t.actionButtons.alreadyWatched}</span>
          <span className="xs:hidden">{t.details.watch}</span>
        </button>
      </div>
      
      {/* Notification Toast */}
      {notification && (
        <div className="text-sm font-medium text-emerald-400 animate-in fade-in slide-in-from-bottom-2">
          {notification}
        </div>
      )}
    </div>
  );
}
