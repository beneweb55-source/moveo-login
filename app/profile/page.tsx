"use client";

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getRankFromWatchTime } from '@/utils/ranks';
import { Shield, User, Settings, Bookmark, Heart, Eye, Loader2, Edit2, Camera, LogOut, Trash2, Key, Clock } from 'lucide-react';
import Image from 'next/image';
import { useLanguage } from '@/context/LanguageContext';
import { motion, AnimatePresence } from 'motion/react';

function ProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') || 'watchlist';
  const { t } = useLanguage();

  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(tabParam);
  
  const [lists, setLists] = useState({
    watchlist: [],
    favorites: [],
    watched: []
  });
  
  const [formData, setFormData] = useState({
    name: '',
    bio: '',
    avatar_url: '',
    banner_url: '',
    twitter_url: '',
    instagram_url: '',
    website_url: ''
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  
  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '' });
  const [savingPassword, setSavingPassword] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set());

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setActiveTab(tabParam);
  }, [tabParam]);

  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        const [userRes, statsRes] = await Promise.all([
          fetch('/api/auth/me'),
          fetch('/api/profile/stats')
        ]);

        if (!userRes.ok) {
          router.push('/login');
          return;
        }

        const userData = await userRes.json();
        const statsData = await statsRes.json();

        setUser(userData.user);
        setStats(statsData.stats);
        
        setFormData({
          name: userData.user.name || '',
          bio: userData.user.bio || '',
          avatar_url: userData.user.avatar_url || '',
          banner_url: userData.user.banner_url || '',
          twitter_url: userData.user.twitter_url || '',
          instagram_url: userData.user.instagram_url || '',
          website_url: userData.user.website_url || ''
        });
      } catch (error) {
        console.error('Error fetching profile:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfileData();
  }, [router]);

  useEffect(() => {
    if (activeTab === 'settings' || loadedTabs.has(activeTab)) return;
    const fetchList = async () => {
      try {
        const res = await fetch(`/api/user/list?list_type=${activeTab}`);
        if (res.ok) {
          const data = await res.json();
          setLists(prev => ({ ...prev, [activeTab]: data.list || [] }));
          setLoadedTabs(prev => new Set(prev).add(activeTab));
        }
      } catch (error) {
        console.error('Error fetching list:', error);
      }
    };
    fetchList();
  }, [activeTab, loadedTabs]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'banner') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setFormData(prev => ({
          ...prev,
          [type === 'avatar' ? 'avatar_url' : 'banner_url']: base64String
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        const data = await res.json();
        setUser({ ...user, ...data.user });
        window.dispatchEvent(new Event('profile-updated'));
        showToast('Profil mis à jour avec succès !', 'success');
      } else {
        showToast('Erreur lors de la mise à jour du profil', 'error');
      }
    } catch (error) {
      console.error(error);
      showToast('Erreur lors de la mise à jour du profil', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPassword(true);
    try {
      const res = await fetch('/api/user/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(passwordData)
      });
      if (res.ok) {
        showToast('Mot de passe mis à jour avec succès !', 'success');
        setPasswordData({ currentPassword: '', newPassword: '' });
      } else {
        const data = await res.json();
        showToast(data.error || 'Erreur lors de la mise à jour du mot de passe', 'error');
      }
    } catch (error) {
      console.error(error);
      showToast('Erreur lors de la mise à jour du mot de passe', 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (error) {
      console.error(error);
    }
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      const res = await fetch('/api/user/delete', { method: 'DELETE' });
      if (res.ok) {
        router.push('/login');
      } else {
        showToast('Erreur lors de la suppression du compte', 'error');
      }
    } catch (error) {
      console.error(error);
      showToast('Erreur lors de la suppression du compte', 'error');
    } finally {
      setDeletingAccount(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#E50914] animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const rank = getRankFromWatchTime(user.total_watch_time || 0, user.watched_count || 0);
  const RankIcon = rank.icon;
  const roleColor = user.role_color || '#10b981';

  const renderList = (items: any[]) => {
    if (items.length === 0) {
      const emptyConfig = {
        watchlist: { icon: Bookmark, msg: 'Votre watchlist est vide', sub: 'Ajoutez des films et séries à regarder' },
        favorites: { icon: Heart, msg: 'Aucun favori pour l\'instant', sub: 'Ajoutez vos contenus préférés' },
        watched:   { icon: Eye,      msg: 'Aucun contenu visionné', sub: 'Commencez à explorer Moveo' },
      };
      const cfg = emptyConfig[activeTab as keyof typeof emptyConfig];
      const Icon = cfg?.icon || Bookmark;
      return (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Icon className="w-14 h-14 text-zinc-800 mb-4" />
          <p className="text-zinc-400 font-semibold text-lg mb-1">{cfg?.msg || 'Liste vide'}</p>
          <p className="text-zinc-600 text-sm mb-6">{cfg?.sub || 'Ajoutez du contenu'}</p>
          <button onClick={() => router.push('/')} className="px-5 py-2.5 bg-[#E50914] rounded-lg font-bold text-sm hover:bg-red-700 transition-colors">
            Explorer
          </button>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {items.map(item => (
          <div 
            key={item.id} 
            onClick={() => router.push(`/${item.media_type}/${item.media_id}`)}
            className="relative aspect-[2/3] rounded-lg overflow-hidden cursor-pointer group"
          >
            <Image 
              src={item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : 'https://picsum.photos/seed/poster/342/513'} 
              alt={item.title} 
              fill 
              className="object-cover transition-transform duration-300 group-hover:scale-110" 
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
              <span className="text-white text-sm font-medium truncate">{item.title}</span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-black text-white pb-20 relative">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className={`fixed top-6 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 rounded-full font-medium shadow-2xl flex items-center gap-2 ${
              toast.type === 'success' ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white'
            }`}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden file inputs */}
      <input 
        type="file" 
        ref={avatarInputRef} 
        onChange={(e) => handleImageUpload(e, 'avatar')} 
        accept="image/*" 
        className="hidden" 
      />
      <input 
        type="file" 
        ref={bannerInputRef} 
        onChange={(e) => handleImageUpload(e, 'banner')} 
        accept="image/*" 
        className="hidden" 
      />

      {/* Banner */}
      <div className="relative w-full" style={{ paddingTop: 'min(33.33%, 380px)' }}>
        <div className="absolute inset-0 overflow-hidden group cursor-pointer bg-zinc-900"
             onClick={() => bannerInputRef.current?.click()}>
          {formData.banner_url || user.banner_url ? (
            <Image src={formData.banner_url || user.banner_url} alt="Banner" fill className="object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900" />
          )}
          
          {/* Dégradé bas fort pour lisibilité du texte */}
          <div 
            className="absolute inset-0 z-10 pointer-events-none" 
            style={{ background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.9) 100%)' }} 
          />
          
          {/* Edit overlay for banner */}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all duration-300 z-20">
            <div className="absolute bottom-3 right-4 flex items-center gap-1.5 bg-black/60 hover:bg-black/80 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/20 transition-colors shadow-lg">
              <Camera className="w-4 h-4 text-white" />
              <span className="text-xs text-white font-medium">Modifier</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Rangée 1 : avatar + nom + badges + bio */}
        <div className="flex flex-col md:flex-row gap-6 items-start md:items-end -mt-24 relative z-20">
          {/* Avatar */}
          <div className="relative w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden border-4 border-black bg-zinc-800 shadow-2xl group flex-shrink-0">
            {formData.avatar_url || user.avatar_url ? (
              <Image src={formData.avatar_url || user.avatar_url} alt={user.name} fill className="object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-5xl font-bold bg-gradient-to-tr from-[#E50914] to-purple-600">
                {user.name?.charAt(0).toUpperCase()}
              </div>
            )}
            
            {/* Edit overlay for avatar */}
            <div 
              onClick={() => avatarInputRef.current?.click()}
              className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
            >
              <Camera className="w-8 h-8 text-white" />
            </div>
          </div>
          
          {/* Basic Info */}
          <div className="pb-2 md:pb-6 flex-1 w-full">
            <div className="flex flex-col gap-2 md:gap-3">
              <div className="flex flex-wrap items-end gap-4">
                <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight drop-shadow-md">
                  {user.name}
                </h1>
                
                <div className="flex items-center gap-2 pb-1 md:pb-2">
                  {/* Role Badge */}
                  <div 
                    className="px-2.5 py-1 rounded border text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5"
                    style={{ borderColor: roleColor, color: roleColor, backgroundColor: 'transparent' }}
                  >
                    {user.role_name === 'admin' || user.role_name === 'Fondateur' ? <Shield size={12} /> : <User size={12} />}
                    {user.role_name || 'Membre'}
                  </div>

                  {/* Rank Badge */}
                  <div 
                    className="px-2.5 py-1 rounded text-[10px] font-bold uppercase flex items-center gap-1.5 transition-all duration-300"
                    style={{
                      backgroundColor: `${rank.color}1A`,
                      color: rank.color,
                      boxShadow: `0 0 8px ${rank.color}66`
                    }}
                  >
                    <RankIcon size={12} />
                    <span>{rank.name}</span>
                  </div>
                </div>
              </div>
              
              {user.bio && (
                <p className="text-zinc-300 text-base md:text-lg max-w-2xl leading-relaxed drop-shadow-sm">
                  {user.bio}
                </p>
              )}
              
              <p className="text-zinc-500 text-sm font-medium mt-1">
                Membre depuis le {new Date(user.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        {/* Rangée 2 : stats en pleine largeur */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-6 border-b border-white/10">
          <div className="bg-zinc-900/80 border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center text-center">
            <Bookmark className="w-6 h-6 text-blue-400 mb-2" />
            <span className="text-2xl font-bold">{stats?.watchlist || 0}</span>
            <span className="text-xs text-zinc-500 uppercase tracking-wider mt-1">À voir</span>
          </div>
          <div className="bg-zinc-900/80 border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center text-center">
            <Heart className="w-6 h-6 text-pink-500 mb-2" />
            <span className="text-2xl font-bold">{stats?.favorites || 0}</span>
            <span className="text-xs text-zinc-500 uppercase tracking-wider mt-1">Favoris</span>
          </div>
          <div className="bg-zinc-900/80 border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center text-center">
            <Eye className="w-6 h-6 text-emerald-500 mb-2" />
            <span className="text-2xl font-bold">{stats?.watched || 0}</span>
            <span className="text-xs text-zinc-500 uppercase tracking-wider mt-1">Vus</span>
          </div>
          <div className="bg-zinc-900/80 border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center text-center">
            <div className="w-6 h-6 mb-2 flex items-center justify-center">
              <Clock className="w-full h-full text-zinc-400" />
            </div>
            <span className="text-2xl font-bold">{Math.floor((stats?.watchTime || 0) / 60)}h</span>
            <span className="text-xs text-zinc-500 uppercase tracking-wider mt-1">Temps de visionnage</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-12">
          <div className="flex overflow-x-auto border-b border-white/10 no-scrollbar">
            <button
              onClick={() => setActiveTab('watchlist')}
              className={`px-6 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === 'watchlist' ? 'border-[#E50914] text-white' : 'border-transparent text-zinc-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <Bookmark className="w-4 h-4" />
                Watchlist
              </div>
            </button>
            <button
              onClick={() => setActiveTab('favorites')}
              className={`px-6 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === 'favorites' ? 'border-[#E50914] text-white' : 'border-transparent text-zinc-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4" />
                Favoris
              </div>
            </button>
            <button
              onClick={() => setActiveTab('watched')}
              className={`px-6 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === 'watched' ? 'border-[#E50914] text-white' : 'border-transparent text-zinc-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Déjà vus
              </div>
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-6 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === 'settings' ? 'border-[#E50914] text-white' : 'border-transparent text-zinc-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Paramètres
              </div>
            </button>
          </div>

          <div className="py-8">
            {activeTab === 'watchlist' && renderList(lists.watchlist)}
            {activeTab === 'favorites' && renderList(lists.favorites)}
            {activeTab === 'watched' && renderList(lists.watched)}
            
            {activeTab === 'settings' && (
              <div className="max-w-2xl bg-zinc-900/50 border border-white/5 rounded-2xl p-6 md:p-8">
                <h2 className="text-xl font-bold mb-6">Modifier le profil</h2>
                <form onSubmit={handleUpdateProfile} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Pseudo</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#E50914] transition-colors"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Bio</label>
                    <textarea
                      value={formData.bio}
                      onChange={(e) => setFormData({...formData, bio: e.target.value})}
                      className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#E50914] transition-colors h-24 resize-none"
                      placeholder="Parlez-nous de vous..."
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-2">Twitter</label>
                      <input
                        type="url"
                        value={formData.twitter_url}
                        onChange={(e) => setFormData({...formData, twitter_url: e.target.value})}
                        className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#E50914] transition-colors text-sm"
                        placeholder="https://twitter.com/..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-2">Instagram</label>
                      <input
                        type="url"
                        value={formData.instagram_url}
                        onChange={(e) => setFormData({...formData, instagram_url: e.target.value})}
                        className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#E50914] transition-colors text-sm"
                        placeholder="https://instagram.com/..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-2">Site web</label>
                      <input
                        type="url"
                        value={formData.website_url}
                        onChange={(e) => setFormData({...formData, website_url: e.target.value})}
                        className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#E50914] transition-colors text-sm"
                        placeholder="https://..."
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/10 flex justify-end items-center">
                    <button
                      type="submit"
                      disabled={saving}
                      className="bg-[#E50914] hover:bg-[#E50914]/90 text-white px-8 py-3 rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                    >
                      {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Edit2 className="w-5 h-5" />}
                      Enregistrer les modifications
                    </button>
                  </div>
                </form>

                <div className="mt-12 pt-8 border-t border-white/10">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                    <Key className="w-5 h-5" />
                    Changer le mot de passe
                  </h3>
                  <form onSubmit={handleUpdatePassword} className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-2">Mot de passe actuel</label>
                      <input
                        type="password"
                        value={passwordData.currentPassword}
                        onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
                        className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#E50914] transition-colors"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-2">Nouveau mot de passe</label>
                      <input
                        type="password"
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                        className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#E50914] transition-colors"
                        required
                        minLength={6}
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={savingPassword}
                        className="bg-zinc-800 hover:bg-zinc-700 text-white px-8 py-3 rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                      >
                        {savingPassword ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Mettre à jour le mot de passe'}
                      </button>
                    </div>
                  </form>
                </div>

                <div className="mt-12 pt-8 border-t border-white/10">
                  <h3 className="text-lg font-bold mb-6 text-red-500">Zone de danger</h3>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <button
                      onClick={handleLogout}
                      className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <LogOut className="w-5 h-5" />
                      Se déconnecter
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={deletingAccount}
                      className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {deletingAccount ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                      Supprimer le compte
                    </button>
                  </div>
                  {showDeleteConfirm && (
                    <div className="mt-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                      <p className="text-sm text-zinc-300 mb-3">
                        Êtes-vous sûr ? Cette action est irréversible et supprimera toutes vos données.
                      </p>
                      <div className="flex gap-2">
                        <button onClick={handleDeleteAccount} className="px-4 py-2 bg-red-600 rounded-lg text-sm font-bold cursor-pointer">
                          Confirmer la suppression
                        </button>
                        <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 bg-white/10 rounded-lg text-sm">
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#E50914] animate-spin" />
      </div>
    }>
      <ProfileContent />
    </Suspense>
  );
}
