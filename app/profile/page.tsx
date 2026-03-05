'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Trash2, Heart, Bookmark, Eye, User, Settings, Edit2, Save, X } from 'lucide-react';
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
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', bio: '', avatar_url: '', banner_url: '' });
  const [saving, setSaving] = useState(false);
  
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
          setEditForm({
            name: userData.user.name || '',
            bio: userData.user.bio || '',
            avatar_url: userData.user.avatar_url || '',
            banner_url: userData.user.banner_url || ''
          });
          
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

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Error updating profile:', error);
    } finally {
      setSaving(false);
    }
  };

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
        
        {/* Profile Card */}
        <div className="bg-[#141414] rounded-3xl overflow-hidden border border-white/10 shadow-2xl mb-12 max-w-sm mx-auto">
          {/* Banner */}
          <div className="relative h-32 w-full bg-gradient-to-r from-red-900 to-black">
             {user.banner_url && (
               <Image 
                 src={user.banner_url} 
                 alt="Banner" 
                 fill 
                 className="object-cover opacity-60"
                 referrerPolicy="no-referrer"
               />
             )}
             {/* Edit Button (Top Right) */}
             {!isEditing && (
               <button 
                 onClick={() => setIsEditing(true)}
                 className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white/70 hover:text-white transition-colors backdrop-blur-sm"
               >
                 <Edit2 className="w-4 h-4" />
               </button>
             )}
          </div>

          {/* Avatar & Info */}
          <div className="px-6 pb-8 relative flex flex-col items-center -mt-16">
            <div className="relative w-32 h-32 rounded-full border-4 border-[#141414] bg-[#141414] overflow-hidden shadow-xl mb-4">
              {user.avatar_url ? (
                <Image 
                  src={user.avatar_url} 
                  alt={user.name} 
                  fill 
                  className="object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-tr from-[#E50914] to-orange-500 flex items-center justify-center">
                  <span className="text-5xl font-bold text-white uppercase">{user.name.charAt(0)}</span>
                </div>
              )}
            </div>

            {isEditing ? (
              <div className="w-full space-y-4">
                 <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="bg-[#0A0A0A] border border-white/10 rounded-lg px-4 py-2 text-white text-center font-bold text-xl w-full focus:border-[#E50914] outline-none"
                    placeholder="Nom"
                  />
                  <input
                    type="text"
                    value={editForm.avatar_url}
                    onChange={(e) => setEditForm({ ...editForm, avatar_url: e.target.value })}
                    className="bg-[#0A0A0A] border border-white/10 rounded-lg px-4 py-2 text-white text-xs w-full focus:border-[#E50914] outline-none"
                    placeholder="Avatar URL"
                  />
                  <input
                    type="text"
                    value={editForm.banner_url}
                    onChange={(e) => setEditForm({ ...editForm, banner_url: e.target.value })}
                    className="bg-[#0A0A0A] border border-white/10 rounded-lg px-4 py-2 text-white text-xs w-full focus:border-[#E50914] outline-none"
                    placeholder="Bannière URL"
                  />
                  <div className="flex justify-center gap-2 mt-4">
                    <button
                      onClick={handleSaveProfile}
                      disabled={saving}
                      className="px-4 py-2 bg-[#E50914] text-white rounded-full text-sm font-medium hover:bg-red-700 transition-colors"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enregistrer'}
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-4 py-2 bg-white/10 text-white rounded-full text-sm font-medium hover:bg-white/20 transition-colors"
                    >
                      Annuler
                    </button>
                  </div>
              </div>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-white mb-1">{user.name}</h2>
                <p className="text-white/50 text-sm mb-4">{user.email}</p>
                
                <div className="px-4 py-1.5 bg-white/5 border border-white/10 rounded-lg mb-6">
                  <span className="text-xs font-bold text-white/70 uppercase tracking-wider">
                    {user.role || 'MEMBRE'}
                  </span>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-3 w-full border-t border-white/10 pt-6">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-white">{watched.length}</p>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">VUS</p>
                  </div>
                  <div className="text-center border-l border-r border-white/10">
                    <p className="text-2xl font-bold text-white">0 <span className="text-sm font-normal text-white/50">min</span></p>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">TEMPS</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-white">{watchlist.length}</p>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">LISTE</p>
                  </div>
                </div>
              </>
            )}
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
          <div className="bg-[#141414] rounded-2xl border border-white/10 overflow-hidden max-w-3xl mx-auto">
            <div className="p-6 sm:p-8 space-y-8">
              <div>
                <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider mb-6">Informations du Compte</h3>
                
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center py-4 border-b border-white/5">
                    <label className="text-white/70 font-medium">Avatar URL</label>
                    <div className="sm:col-span-2">
                       {isEditing ? (
                         <input
                           type="text"
                           value={editForm.avatar_url}
                           onChange={(e) => setEditForm({ ...editForm, avatar_url: e.target.value })}
                           className="bg-[#0A0A0A] border border-white/10 rounded-lg px-4 py-2 text-white w-full focus:border-[#E50914] outline-none text-sm"
                           placeholder="https://example.com/avatar.jpg"
                         />
                       ) : (
                         <span className="text-white/50 text-sm truncate block">{user.avatar_url || 'Aucun avatar défini'}</span>
                       )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center py-4 border-b border-white/5">
                    <label className="text-white/70 font-medium">Bannière URL</label>
                    <div className="sm:col-span-2">
                       {isEditing ? (
                         <input
                           type="text"
                           value={editForm.banner_url}
                           onChange={(e) => setEditForm({ ...editForm, banner_url: e.target.value })}
                           className="bg-[#0A0A0A] border border-white/10 rounded-lg px-4 py-2 text-white w-full focus:border-[#E50914] outline-none text-sm"
                           placeholder="https://example.com/banner.jpg"
                         />
                       ) : (
                         <span className="text-white/50 text-sm truncate block">{user.banner_url || 'Aucune bannière définie'}</span>
                       )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center py-4 border-b border-white/5">
                    <label className="text-white/70 font-medium">Nom d&apos;utilisateur</label>
                    <div className="sm:col-span-2">
                      <span className="text-white font-medium">{user.name}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center py-4 border-b border-white/5">
                    <label className="text-white/70 font-medium">Email</label>
                    <div className="sm:col-span-2">
                      <span className="text-white font-medium">{user.email}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start py-4 border-b border-white/5">
                    <label className="text-white/70 font-medium pt-2">Bio</label>
                    <div className="sm:col-span-2">
                      <span className="text-white/80 italic">{user.bio || 'Aucune bio définie'}</span>
                    </div>
                  </div>
                </div>

                {!isEditing && (
                  <div className="mt-8 flex justify-end">
                    <button
                      onClick={() => setIsEditing(true)}
                      className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-full font-medium transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                      Modifier le profil
                    </button>
                  </div>
                )}
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
