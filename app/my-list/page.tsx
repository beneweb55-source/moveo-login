"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ContentWrapper from "@/components/ContentWrapper";
import Image from "next/image";
import { Loader2, Trash2, Play } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export default function MyList() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { t } = useLanguage();

  useEffect(() => {
    const fetchList = async () => {
      try {
        const res = await fetch('/api/user/list?list_type=watchlist');
        if (res.ok) {
          const data = await res.json();
          setList(data.list);
        } else if (res.status === 401) {
          router.push('/login');
        }
      } catch (error) {
        console.error('Error fetching list:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchList();
  }, [router]);

  const removeFromList = async (e: React.MouseEvent, mediaType: string, mediaId: number, listType: string) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/user/list?media_type=${mediaType}&media_id=${mediaId}&list_type=${listType}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setList(list.filter(item => !(item.media_type === mediaType && item.media_id === mediaId && item.list_type === listType)));
        window.dispatchEvent(new Event('list-updated'));
      }
    } catch (error) {
      console.error('Error removing from list:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center bg-[#0A0A0A]">
        <Loader2 className="w-10 h-10 text-[#E50914] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-12 bg-[#0A0A0A]">
      <ContentWrapper>
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">{t.profile.myList}</h1>
          <p className="text-white/50">{t.profile.myListDesc}</p>
        </div>

        {list.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-white/50 text-xl mb-6">{t.profile.emptyList}</div>
            <button
              onClick={() => router.push('/')}
              className="bg-[#E50914] hover:bg-red-700 text-white px-8 py-3 rounded-full font-bold transition-colors"
            >
              {t.cta.discover}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
            {list.map((item) => {
              const posterUrl = item.poster_path
                ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
                : "https://picsum.photos/seed/poster/500/750";

              return (
                <div
                  key={`${item.media_type}-${item.media_id}`}
                  className="relative group cursor-pointer rounded-xl overflow-hidden aspect-[2/3] bg-[#141414]"
                  onClick={() => router.push(`/${item.media_type}/${item.media_id}`)}
                >
                  <Image
                    src={posterUrl}
                    alt={item.title}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                    referrerPolicy="no-referrer"
                  />
                  
                  {/* Overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between p-4">
                    <div className="flex justify-end">
                      <button
                        onClick={(e) => removeFromList(e, item.media_type, item.media_id, item.list_type)}
                        className="w-8 h-8 rounded-full bg-black/50 hover:bg-red-500/80 flex items-center justify-center text-white transition-colors backdrop-blur-sm"
                        title={t.actionButtons.removedFrom}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                      <div className="w-10 h-10 rounded-full bg-[#E50914] flex items-center justify-center mb-3 shadow-lg">
                        <Play className="w-5 h-5 text-white fill-current ml-1" />
                      </div>
                      <h3 className="text-white font-bold text-sm line-clamp-2">{item.title}</h3>
                      <span className="text-white/50 text-xs uppercase tracking-wider mt-1 block">
                        {item.media_type === 'movie' ? t.explore.exploreMovies : t.explore.exploreTv}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ContentWrapper>
    </div>
  );
}
