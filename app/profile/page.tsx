'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Trash2, Heart, Bookmark, Eye, User, Settings } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

type ListItem = {
  id: number;
  media_type: string;
  media_id: string;
  list_type: string;
  title: string;
  poster_path: string;
  added_at: string;
};

function ProfileContent() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [listItems, setListItems] = useState<ListItem[]>([]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as 'watchlist' | 'favorites' | 'watched' | 'settings' | null;
  const [activeTab, setActiveTab] = useState<'watchlist' | 'favorites' | 'watched' | 'settings'>(tabParam || 'watchlist');

  useEffect(() => {
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const userRes = await fetch('/api/auth/me');
        if (userRes.ok) {
          const userData = await userRes.json();
          setUser(userData.user);
          
          const listRes = await fetch('/api/user/list');
          if (listRes.ok) {
            const listData = await listRes.json();
            setListItems(listData.list || []);
          }
        } else {
          router.push('/login');
        }
      } catch (err) {
        console.error(err);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [router]);

  const removeItem = async (mediaType: string, mediaId: string, listType: string) => {
    try {
      const res = await fetch(`/api/user/list?media_type=${mediaType}&media_id=${mediaId}&list_type=${listType}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setListItems(prev => prev.filter(item => !(item.media_type === mediaType && item.media_id === mediaId && item.list_type === listType)));
        window.dispatchEvent(new Event('list-updated'));
      }
    } catch (error) {
      console.error('Error removing item:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A]">
        <Loader2 className="w-8 h-8 text-[#E50914] animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const watchlist = listItems.filter(item => item.list_type === 'watchlist');
  const favorites = listItems.filter(item => item.list_type === 'favorites');
  const watched = listItems.filter(item => item.list_type === 'watched');

  const currentList = activeTab === 'watchlist' ? watchlist : activeTab === 'favorites' ? favorites : watched;

  return (
    <div className="min-h-screen bg-[#0A0A0A] pt-24 px-4 sm:px-6 lg:px-8 pb-20">
      <div className="max-w-6xl mx-auto">
        
        {/* Profile Header */}
        <div className="flex flex-col items-center mb-12">
          <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-[#E50914] to-orange-500 flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(229,9,20,0.3)] border-4 border-[#141414]">
            <span className="text-5xl font-bold text-white uppercase">{user.name.charAt(0)}</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">{user.name}</h1>
          <p className="text-white/50">{user.email}</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-[#141414] border border-white/10 rounded-2xl p-6 flex items-center gap-4 transition-transform hover:scale-105">
            <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center">
              <Bookmark className="w-7 h-7 text-white" />
            </div>
            <div>
              <p className="text-white/50 text-sm font-medium uppercase tracking-wider">Watchlist</p>
              <p className="text-3xl font-bold text-white">{watchlist.length}</p>
            </div>
          </div>
          
          <div className="bg-[#141414] border border-pink-500/20 rounded-2xl p-6 flex items-center gap-4 transition-transform hover:scale-105">
            <div className="w-14 h-14 rounded-full bg-pink-500/10 flex items-center justify-center">
              <Heart className="w-7 h-7 text-pink-500" />
            </div>
            <div>
              <p className="text-pink-500/70 text-sm font-medium uppercase tracking-wider">Favoris</p>
              <p className="text-3xl font-bold text-white">{favorites.length}</p>
            </div>
          </div>

          <div className="bg-[#141414] border border-emerald-500/20 rounded-2xl p-6 flex items-center gap-4 transition-transform hover:scale-105">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Eye className="w-7 h-7 text-emerald-500" />
            </div>
            <div>
              <p className="text-emerald-500/70 text-sm font-medium uppercase tracking-wider">Vus</p>
              <p className="text-3xl font-bold text-white">{watched.length}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-2 border-b border-white/10 mb-8 overflow-x-auto no-scrollbar">
          <button
            onClick={() => { setActiveTab('watchlist'); router.push('/profile?tab=watchlist', { scroll: false }); }}
            className={`px-6 py-4 font-medium text-sm whitespace-nowrap transition-colors relative ${
              activeTab === 'watchlist' ? 'text-white' : 'text-white/50 hover:text-white/80'
            }`}
          >
            Ma Watchlist
            {activeTab === 'watchlist' && (
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#E50914] rounded-t-full" />
            )}
          </button>
          <button
            onClick={() => { setActiveTab('favorites'); router.push('/profile?tab=favorites', { scroll: false }); }}
            className={`px-6 py-4 font-medium text-sm whitespace-nowrap transition-colors relative ${
              activeTab === 'favorites' ? 'text-white' : 'text-white/50 hover:text-white/80'
            }`}
          >
            Mes Favoris
            {activeTab === 'favorites' && (
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-pink-500 rounded-t-full" />
            )}
          </button>
          <button
            onClick={() => { setActiveTab('watched'); router.push('/profile?tab=watched', { scroll: false }); }}
            className={`px-6 py-4 font-medium text-sm whitespace-nowrap transition-colors relative ${
              activeTab === 'watched' ? 'text-white' : 'text-white/50 hover:text-white/80'
            }`}
          >
            Déjà Vus
            {activeTab === 'watched' && (
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-emerald-500 rounded-t-full" />
            )}
          </button>
          <button
            onClick={() => { setActiveTab('settings'); router.push('/profile?tab=settings', { scroll: false }); }}
            className={`px-6 py-4 font-medium text-sm whitespace-nowrap transition-colors relative ${
              activeTab === 'settings' ? 'text-white' : 'text-white/50 hover:text-white/80'
            }`}
          >
            Paramètres
            {activeTab === 'settings' && (
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-purple-500 rounded-t-full" />
            )}
          </button>
        </div>

        {/* Content Grid */}
        {activeTab === 'settings' ? (
          <div className="bg-[#141414] rounded-2xl border border-white/10 overflow-hidden max-w-3xl">
            <div className="p-6 sm:p-8 space-y-6">
              <div>
                <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider">Account Information</h3>
                <div className="mt-4 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 border-b border-white/5">
                    <span className="text-white/70">Name</span>
                    <span className="text-white font-medium mt-1 sm:mt-0">{user.name}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 border-b border-white/5">
                    <span className="text-white/70">Email</span>
                    <span className="text-white font-medium mt-1 sm:mt-0">{user.email}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : currentList.length === 0 ? (
          <div className="text-center py-20 bg-[#141414] rounded-2xl border border-white/5">
            <div className="w-20 h-20 mx-auto bg-white/5 rounded-full flex items-center justify-center mb-4">
              {activeTab === 'watchlist' && <Bookmark className="w-10 h-10 text-white/20" />}
              {activeTab === 'favorites' && <Heart className="w-10 h-10 text-white/20" />}
              {activeTab === 'watched' && <Eye className="w-10 h-10 text-white/20" />}
            </div>
            <h3 className="text-xl font-medium text-white mb-2">Aucun contenu</h3>
            <p className="text-white/50">
              Vous n&apos;avez pas encore ajouté de contenu à cette liste.
            </p>
            <Link href="/" className="inline-block mt-6 px-6 py-3 bg-[#E50914] text-white rounded-full font-medium hover:bg-red-700 transition-colors">
              Explorer le catalogue
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
            {currentList.map((item) => (
              <div key={`${item.media_type}-${item.media_id}`} className="group relative aspect-[2/3] rounded-xl overflow-hidden bg-[#141414]">
                {item.poster_path ? (
                  <Image
                    src={`https://image.tmdb.org/t/p/w500${item.poster_path}`}
                    alt={item.title}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-[#141414]">
                    <span className="text-white/30 text-sm text-center px-2">{item.title}</span>
                  </div>
                )}
                
                {/* Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                  <h4 className="text-white font-medium text-sm sm:text-base line-clamp-2 mb-3">
                    {item.title}
                  </h4>
                  <div className="flex gap-2">
                    <Link
                      href={`/${item.media_type}/${item.media_id}`}
                      className="flex-1 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white text-xs font-medium py-2 rounded-lg text-center transition-colors flex items-center justify-center"
                    >
                      Détails
                    </Link>
                    <button
                      onClick={() => removeItem(item.media_type, item.media_id, item.list_type)}
                      className="w-8 h-8 bg-red-500/80 hover:bg-red-500 text-white rounded-lg flex items-center justify-center transition-colors backdrop-blur-sm"
                      title="Retirer de la liste"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A]">
        <Loader2 className="w-8 h-8 text-[#E50914] animate-spin" />
      </div>
    }>
      <ProfileContent />
    </Suspense>
  );
}
