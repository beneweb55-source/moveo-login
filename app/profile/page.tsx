'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Trash2, Heart, Bookmark, Eye, User, Settings, Edit2, Save, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useLanguage } from '@/context/LanguageContext';

import { motion, AnimatePresence } from 'motion/react';

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
  const [watchTime, setWatchTime] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', bio: '', avatar_url: '', banner_url: '', twitter_url: '', instagram_url: '', website_url: '' });
  const [saving, setSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordStatus, setPasswordStatus] = useState({ type: '', message: '' });
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const { language, t } = useLanguage();
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'avatar_url' | 'banner_url') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      alert(t.profile.fileTooLarge);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setEditForm({ ...editForm, [field]: reader.result as string });
    };
    reader.readAsDataURL(file);
  };
  
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
            banner_url: userData.user.banner_url || '',
            twitter_url: userData.user.twitter_url || '',
            instagram_url: userData.user.instagram_url || '',
            website_url: userData.user.website_url || ''
          });
          
          const listRes = await fetch('/api/user/list');
          if (listRes.ok) {
            const listData = await listRes.json();
            setListItems(listData.list || []);
          }

          const statsRes = await fetch('/api/profile/stats');
          if (statsRes.ok) {
            const statsData = await statsRes.json();
            setWatchTime(statsData.stats.watchTime || 0);
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
        window.dispatchEvent(new Event('profile-updated'));
      }
    } catch (error) {
      console.error('Error updating profile:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordStatus({ type: 'error', message: t.profile.passwordsDoNotMatch });
      return;
    }
    
    setIsChangingPassword(true);
    setPasswordStatus({ type: '', message: '' });
    
    try {
      const res = await fetch('/api/user/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setPasswordStatus({ type: 'success', message: t.profile.passwordUpdated });
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        setPasswordStatus({ type: 'error', message: data.error || t.profile.updateError });
      }
    } catch (error) {
      setPasswordStatus({ type: 'error', message: t.profile.serverError });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm(t.profile.deleteConfirm)) {
      return;
    }
    
    setIsDeleting(true);
    try {
      const res = await fetch('/api/user/delete', { method: 'DELETE' });
      if (res.ok) {
        window.location.href = '/login';
      } else {
        alert(t.profile.deleteError);
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      alert(t.profile.serverError);
    } finally {
      setIsDeleting(false);
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

  const formatWatchTime = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours < 24) return `${hours} h ${remainingMinutes} min`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days} ${t.profile.days} ${remainingHours} h`;
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] pt-24 px-4 sm:px-6 lg:px-8 pb-20">
      <div className="max-w-6xl mx-auto">
        
        {/* Profile Header Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative bg-[#141414] rounded-3xl overflow-hidden border border-white/5 shadow-2xl mb-8"
        >
          {/* Banner Area */}
          <div className="relative aspect-video sm:aspect-[3/1] min-h-[200px] sm:min-h-[300px] w-full bg-zinc-900 group overflow-hidden">
             {(isEditing ? editForm.banner_url : user.banner_url) ? (
               <Image 
                 src={isEditing ? editForm.banner_url : user.banner_url} 
                 alt="Banner" 
                 fill 
                 className="object-cover object-center transition-transform duration-700 group-hover:scale-105"
                 referrerPolicy="no-referrer"
               />
             ) : (
               <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-black opacity-50" />
             )}
             <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-black/20" />
             
             {/* Banner Controls - Moved to top right to avoid avatar overlap */}
             {isEditing && (
               <div className="absolute top-4 right-4 flex gap-2 z-20">
                 <label className="cursor-pointer p-3 bg-black/60 hover:bg-[#E50914] backdrop-blur-md rounded-xl transition-all shadow-xl group/btn">
                   <Edit2 className="w-5 h-5 text-white" />
                   <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'banner_url')} />
                 </label>
                 {editForm.banner_url && (
                   <button 
                    onClick={() => setEditForm({ ...editForm, banner_url: '' })} 
                    className="p-3 bg-black/60 hover:bg-red-600 backdrop-blur-md rounded-xl transition-all shadow-xl"
                   >
                     <Trash2 className="w-5 h-5 text-white" />
                   </button>
                 )}
               </div>
             )}
          </div>

          {/* Profile Info Overlay */}
          <div className="px-6 sm:px-10 pb-10 relative">
            <div className="flex flex-col sm:flex-row items-end gap-6 -mt-16 sm:-mt-20 relative z-10">
              {/* Avatar */}
              <div className="relative group">
                <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-3xl border-[6px] border-[#141414] bg-[#141414] overflow-hidden shadow-2xl relative">
                  {(isEditing ? editForm.avatar_url : user.avatar_url) ? (
                    <Image 
                      src={isEditing ? editForm.avatar_url : user.avatar_url} 
                      alt={user.name} 
                      fill 
                      className="object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-tr from-[#E50914] to-orange-500 flex items-center justify-center">
                      <span className="text-6xl font-bold text-white uppercase">{(isEditing ? editForm.name : user.name).charAt(0)}</span>
                    </div>
                  )}
                  
                  {isEditing && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all backdrop-blur-md gap-2 rounded-[18px] overflow-hidden">
                      <label className="cursor-pointer p-2.5 bg-white/20 hover:bg-[#E50914] rounded-xl transition-colors">
                        <Edit2 className="w-5 h-5 text-white" />
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'avatar_url')} />
                      </label>
                      {editForm.avatar_url && (
                        <button onClick={() => setEditForm({ ...editForm, avatar_url: '' })} className="p-2.5 bg-red-500/50 hover:bg-red-500 rounded-xl transition-colors">
                          <Trash2 className="w-5 h-5 text-white" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* User Identity */}
              <div className="flex-1 pb-2 text-center sm:text-left">
                {isEditing ? (
                  <div className="space-y-3 max-w-xs mx-auto sm:mx-0">
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white font-bold text-2xl w-full focus:border-[#E50914] outline-none backdrop-blur-md"
                      placeholder="Username"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveProfile}
                        disabled={saving}
                        className="flex-1 py-2 bg-[#E50914] text-white rounded-xl text-sm font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-900/20"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t.profile.save}
                      </button>
                      <button
                        onClick={() => setIsEditing(false)}
                        className="flex-1 py-2 bg-white/10 text-white rounded-xl text-sm font-bold hover:bg-white/20 transition-all"
                      >
                        {t.profile.cancel}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center justify-center sm:justify-start gap-3">
                      <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">{user.name}</h2>
                      <div className="px-2 py-0.5 bg-[#E50914] rounded-full flex items-center justify-center h-fit shadow-lg shadow-red-900/20">
                        <span className="text-[10px] sm:text-[11px] font-black text-white uppercase tracking-[0.5px] leading-none">
                          {user.role || t.profile.member}
                        </span>
                      </div>
                    </div>
                    <p className="text-white/40 font-medium">{user.email}</p>
                    {user.bio && <p className="text-white/60 text-sm mt-3 max-w-md line-clamp-2 italic">&quot;{user.bio}&quot;</p>}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              {!isEditing && (
                <div className="flex gap-3 pb-2">
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="px-6 py-3 bg-white text-black rounded-2xl font-bold text-sm hover:bg-zinc-200 transition-all flex items-center gap-2 shadow-xl"
                  >
                    <Settings className="w-4 h-4" />
                    {t.profile.editProfile}
                  </button>
                </div>
              )}
            </div>

            {/* Stats Grid */}
            <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white/5 border border-white/5 rounded-2xl p-4 backdrop-blur-md">
                <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1">{t.profile.watched}</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white">{watched.length}</span>
                  <Eye className="w-4 h-4 text-[#E50914]" />
                </div>
              </div>
              <div className="bg-white/5 border border-white/5 rounded-2xl p-4 backdrop-blur-md">
                <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1">{t.profile.time}</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white">{formatWatchTime(watchTime)}</span>
                </div>
              </div>
              <div className="bg-white/5 border border-white/5 rounded-2xl p-4 backdrop-blur-md">
                <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1">{t.profile.list}</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white">{watchlist.length}</span>
                  <Bookmark className="w-4 h-4 text-blue-500" />
                </div>
              </div>
              <div className="bg-white/5 border border-white/5 rounded-2xl p-4 backdrop-blur-md">
                <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1">{t.profile.myFavorites}</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white">{favorites.length}</span>
                  <Heart className="w-4 h-4 text-pink-500" />
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Tabs Navigation */}
        <div className="flex items-center justify-center sm:justify-start gap-1 bg-[#141414] p-1.5 rounded-2xl border border-white/5 mb-8 overflow-x-auto no-scrollbar">
          {[
            { id: 'watchlist', label: t.profile.myWatchlist, icon: Bookmark, color: 'text-blue-500' },
            { id: 'favorites', label: t.profile.myFavorites, icon: Heart, color: 'text-pink-500' },
            { id: 'watched', label: t.profile.alreadyWatched, icon: Eye, color: 'text-emerald-500' },
            { id: 'settings', label: t.profile.settings, icon: Settings, color: 'text-purple-500' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id as any); router.push(`/profile?tab=${tab.id}`, { scroll: false }); }}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'bg-white/10 text-white shadow-lg' 
                  : 'text-white/40 hover:text-white/70 hover:bg-white/5'
              }`}
            >
              <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? tab.color : ''}`} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Grid */}
        {activeTab === 'settings' ? (
          <div className="bg-[#141414] rounded-2xl border border-white/10 overflow-hidden max-w-3xl mx-auto">
            <div className="p-6 sm:p-8 space-y-8">
              <div>
                <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider mb-6">{t.profile.accountInfo}</h3>
                
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center py-4 border-b border-white/5">
                    <label className="text-white/70 font-medium">{t.profile.avatar}</label>
                    <div className="sm:col-span-2">
                       {isEditing ? (
                         <div className="flex items-center gap-4">
                           <div className="w-12 h-12 rounded-full overflow-hidden relative flex-shrink-0 bg-white/5">
                             {editForm.avatar_url ? (
                               <Image src={editForm.avatar_url} alt="Avatar preview" fill className="object-cover" />
                             ) : (
                               <div className="w-full h-full flex items-center justify-center text-white/30 text-xs">{t.profile.empty}</div>
                             )}
                           </div>
                           <div className="flex-1 flex items-center gap-2">
                             <label className="cursor-pointer bg-[#E50914] hover:bg-red-700 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors">
                               {t.profile.chooseImage}
                               <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'avatar_url')} />
                             </label>
                             {editForm.avatar_url && (
                               <button 
                                 onClick={() => setEditForm({ ...editForm, avatar_url: '' })}
                                 className="p-2 bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white rounded-full transition-colors"
                                 title={t.profile.removeAvatar}
                               >
                                 <Trash2 className="w-5 h-5" />
                               </button>
                             )}
                           </div>
                         </div>
                       ) : (
                         <span className="text-white/50 text-sm truncate block">{user.avatar_url ? t.profile.customAvatarSet : t.profile.noAvatarSet}</span>
                       )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center py-4 border-b border-white/5">
                    <label className="text-white/70 font-medium">{t.profile.banner}</label>
                    <div className="sm:col-span-2">
                       {isEditing ? (
                         <div className="flex flex-col gap-3">
                           <div className="w-full h-20 rounded-lg overflow-hidden relative bg-white/5">
                             {editForm.banner_url ? (
                               <Image src={editForm.banner_url} alt="Banner preview" fill className="object-cover" />
                             ) : (
                               <div className="w-full h-full flex items-center justify-center text-white/30 text-sm">{t.profile.empty}</div>
                             )}
                           </div>
                           <div className="flex items-center gap-2">
                             <label className="cursor-pointer bg-[#E50914] hover:bg-red-700 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors">
                               {t.profile.chooseImage}
                               <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'banner_url')} />
                             </label>
                             {editForm.banner_url && (
                               <button 
                                 onClick={() => setEditForm({ ...editForm, banner_url: '' })}
                                 className="p-2 bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white rounded-full transition-colors"
                                 title={t.profile.removeBanner}
                               >
                                 <Trash2 className="w-5 h-5" />
                               </button>
                             )}
                           </div>
                         </div>
                       ) : (
                         <span className="text-white/50 text-sm truncate block">{user.banner_url ? t.profile.customBannerSet : t.profile.noBannerSet}</span>
                       )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center py-4 border-b border-white/5">
                    <label className="text-white/70 font-medium">{t.profile.username}</label>
                    <div className="sm:col-span-2">
                      <span className="text-white font-medium">{user.name}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center py-4 border-b border-white/5">
                    <label className="text-white/70 font-medium">{t.profile.email}</label>
                    <div className="sm:col-span-2">
                      <span className="text-white font-medium">{user.email}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start py-4 border-b border-white/5">
                    <label className="text-white/70 font-medium pt-2">{t.profile.bio}</label>
                    <div className="sm:col-span-2">
                      {isEditing ? (
                        <textarea
                          value={editForm.bio}
                          onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                          className="bg-[#0A0A0A] border border-white/10 rounded-lg px-4 py-2 text-white w-full focus:border-[#E50914] outline-none min-h-[100px]"
                          placeholder={t.profile.bioPlaceholder}
                        />
                      ) : (
                        <span className="text-white/80 italic">{user.bio || t.profile.noBioSet}</span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center py-4 border-b border-white/5">
                    <label className="text-white/70 font-medium">Twitter</label>
                    <div className="sm:col-span-2">
                      {isEditing ? (
                        <input
                          type="url"
                          value={editForm.twitter_url}
                          onChange={(e) => setEditForm({ ...editForm, twitter_url: e.target.value })}
                          className="bg-[#0A0A0A] border border-white/10 rounded-lg px-4 py-2 text-white w-full focus:border-[#E50914] outline-none"
                          placeholder="https://twitter.com/..."
                        />
                      ) : (
                        <span className="text-white/80">{user.twitter_url ? <a href={user.twitter_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{user.twitter_url}</a> : t.profile.notSet}</span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center py-4 border-b border-white/5">
                    <label className="text-white/70 font-medium">Instagram</label>
                    <div className="sm:col-span-2">
                      {isEditing ? (
                        <input
                          type="url"
                          value={editForm.instagram_url}
                          onChange={(e) => setEditForm({ ...editForm, instagram_url: e.target.value })}
                          className="bg-[#0A0A0A] border border-white/10 rounded-lg px-4 py-2 text-white w-full focus:border-[#E50914] outline-none"
                          placeholder="https://instagram.com/..."
                        />
                      ) : (
                        <span className="text-white/80">{user.instagram_url ? <a href={user.instagram_url} target="_blank" rel="noopener noreferrer" className="text-pink-400 hover:underline">{user.instagram_url}</a> : t.profile.notSet}</span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center py-4 border-b border-white/5">
                    <label className="text-white/70 font-medium">{t.profile.website}</label>
                    <div className="sm:col-span-2">
                      {isEditing ? (
                        <input
                          type="url"
                          value={editForm.website_url}
                          onChange={(e) => setEditForm({ ...editForm, website_url: e.target.value })}
                          className="bg-[#0A0A0A] border border-white/10 rounded-lg px-4 py-2 text-white w-full focus:border-[#E50914] outline-none"
                          placeholder="https://..."
                        />
                      ) : (
                        <span className="text-white/80">{user.website_url ? <a href={user.website_url} target="_blank" rel="noopener noreferrer" className="text-[#E50914] hover:underline">{user.website_url}</a> : t.profile.notSet}</span>
                      )}
                    </div>
                  </div>
                </div>

                {!isEditing ? (
                  <div className="mt-8 flex justify-end">
                    <button
                      onClick={() => setIsEditing(true)}
                      className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-full font-medium transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                      {t.profile.editProfile}
                    </button>
                  </div>
                ) : (
                  <div className="mt-8 flex justify-end gap-4">
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-6 py-3 bg-white/10 text-white rounded-full font-medium hover:bg-white/20 transition-colors"
                    >
                      {t.profile.cancel}
                    </button>
                    <button
                      onClick={handleSaveProfile}
                      disabled={saving}
                      className="flex items-center gap-2 px-6 py-3 bg-[#E50914] text-white rounded-full font-medium hover:bg-red-700 transition-colors"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {t.profile.save}
                    </button>
                  </div>
                )}
              </div>

              {/* Password Change Section */}
              <div className="pt-8 border-t border-white/10">
                <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider mb-6">{t.profile.security}</h3>
                
                <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                  <div>
                    <label className="block text-sm text-white/70 mb-1">{t.profile.currentPassword}</label>
                    <input
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                      className="bg-[#0A0A0A] border border-white/10 rounded-lg px-4 py-2 text-white w-full focus:border-[#E50914] outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-white/70 mb-1">{t.profile.newPassword}</label>
                    <input
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                      className="bg-[#0A0A0A] border border-white/10 rounded-lg px-4 py-2 text-white w-full focus:border-[#E50914] outline-none"
                      required
                      minLength={6}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-white/70 mb-1">{t.profile.confirmNewPassword}</label>
                    <input
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                      className="bg-[#0A0A0A] border border-white/10 rounded-lg px-4 py-2 text-white w-full focus:border-[#E50914] outline-none"
                      required
                      minLength={6}
                    />
                  </div>
                  
                  {passwordStatus.message && (
                    <div className={`p-3 rounded-lg text-sm ${passwordStatus.type === 'error' ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                      {passwordStatus.message}
                    </div>
                  )}
                  
                  <button
                    type="submit"
                    disabled={isChangingPassword}
                    className="px-6 py-2 bg-white/10 text-white rounded-lg font-medium hover:bg-white/20 transition-colors flex items-center gap-2"
                  >
                    {isChangingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {t.profile.updatePassword}
                  </button>
                </form>
              </div>

              {/* Danger Zone */}
              <div className="pt-8 border-t border-white/10">
                <h3 className="text-sm font-black text-red-500 uppercase tracking-widest mb-6">{t.profile.dangerZone}</h3>
                <div className="bg-red-500/5 border border-red-500/10 rounded-2xl p-6">
                  <h4 className="text-white font-bold mb-2">{t.profile.deleteAccount}</h4>
                  <p className="text-white/40 text-sm mb-6">
                    {t.profile.deleteAccountWarning}
                  </p>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={isDeleting}
                    className="px-6 py-3 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl font-bold transition-all flex items-center gap-2"
                  >
                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    {t.profile.deleteMyAccount}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : currentList.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-32 bg-[#141414] rounded-3xl border border-white/5"
          >
            <div className="w-24 h-24 mx-auto bg-white/5 rounded-full flex items-center justify-center mb-6">
              {activeTab === 'watchlist' && <Bookmark className="w-10 h-10 text-white/20" />}
              {activeTab === 'favorites' && <Heart className="w-10 h-10 text-white/20" />}
              {activeTab === 'watched' && <Eye className="w-10 h-10 text-white/20" />}
            </div>
            <h3 className="text-2xl font-black text-white mb-2">{t.profile.noContent}</h3>
            <p className="text-white/30 max-w-xs mx-auto">
              {t.profile.noContentDesc}
            </p>
            <Link href="/" className="inline-block mt-8 px-8 py-4 bg-[#E50914] text-white rounded-2xl font-black hover:bg-red-700 transition-all shadow-xl shadow-red-900/20">
              {t.profile.exploreCatalog}
            </Link>
          </motion.div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 sm:gap-8">
            {currentList.map((item, index) => (
              <motion.div 
                key={`${item.media_type}-${item.media_id}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                className="group relative aspect-[2/3] rounded-2xl overflow-hidden bg-zinc-900 shadow-xl"
              >
                {item.poster_path ? (
                  <Image
                    src={`https://image.tmdb.org/t/p/w500${item.poster_path}`}
                    alt={item.title}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                    <span className="text-white/20 text-xs font-bold text-center px-4 uppercase tracking-widest">{item.title}</span>
                  </div>
                )}
                
                {/* Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-5">
                  <h4 className="text-white font-black text-sm sm:text-base line-clamp-2 mb-4 leading-tight">
                    {item.title}
                  </h4>
                  <div className="flex gap-2">
                    <Link
                      href={`/${item.media_type}/${item.media_id}`}
                      className="flex-1 bg-white text-black text-[10px] font-black uppercase tracking-widest py-3 rounded-xl text-center transition-all hover:bg-zinc-200"
                    >
                      {t.profile.details}
                    </Link>
                    <button
                      onClick={() => removeItem(item.media_type, item.media_id, item.list_type)}
                      className="w-10 h-10 bg-red-600/90 hover:bg-red-600 text-white rounded-xl flex items-center justify-center transition-all backdrop-blur-md"
                      title={t.profile.removeFromList}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
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
