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
  const [editForm, setEditForm] = useState({ name: '', bio: '', avatar_url: '', banner_url: '', twitter_url: '', instagram_url: '', website_url: '' });
  const [saving, setSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordStatus, setPasswordStatus] = useState({ type: '', message: '' });
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'avatar_url' | 'banner_url') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      alert('Le fichier est trop volumineux (max 3MB)');
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
      setPasswordStatus({ type: 'error', message: 'Les mots de passe ne correspondent pas' });
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
        setPasswordStatus({ type: 'success', message: 'Mot de passe mis à jour avec succès' });
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        setPasswordStatus({ type: 'error', message: data.error || 'Erreur lors de la mise à jour' });
      }
    } catch (error) {
      setPasswordStatus({ type: 'error', message: 'Erreur serveur' });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer votre compte ? Cette action est irréversible.')) {
      return;
    }
    
    setIsDeleting(true);
    try {
      const res = await fetch('/api/user/delete', { method: 'DELETE' });
      if (res.ok) {
        window.location.href = '/login';
      } else {
        alert('Erreur lors de la suppression du compte');
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      alert('Erreur serveur');
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

  return (
    <div className="min-h-screen bg-[#0A0A0A] pt-24 px-4 sm:px-6 lg:px-8 pb-20">
      <div className="max-w-6xl mx-auto">
        
        {/* Profile Card */}
        <div className="bg-[#141414] rounded-3xl overflow-hidden border border-white/10 shadow-2xl mb-12 max-w-sm mx-auto">
          {/* Banner */}
          <div className="relative h-32 w-full bg-gradient-to-r from-red-900 to-black">
             {(isEditing ? editForm.banner_url : user.banner_url) && (
               <Image 
                 src={isEditing ? editForm.banner_url : user.banner_url} 
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
                  <span className="text-5xl font-bold text-white uppercase">{(isEditing ? editForm.name : user.name).charAt(0)}</span>
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
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-white/50">Photo de profil (max 3MB)</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e, 'avatar_url')}
                      className="bg-[#0A0A0A] border border-white/10 rounded-lg px-4 py-2 text-white text-xs w-full focus:border-[#E50914] outline-none file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/20"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-white/50">Bannière (max 3MB)</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e, 'banner_url')}
                      className="bg-[#0A0A0A] border border-white/10 rounded-lg px-4 py-2 text-white text-xs w-full focus:border-[#E50914] outline-none file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/20"
                    />
                  </div>
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

                {/* Social Links */}
                {(user.twitter_url || user.instagram_url || user.website_url) && (
                  <div className="flex gap-4 mb-6">
                    {user.twitter_url && (
                      <a href={user.twitter_url} target="_blank" rel="noopener noreferrer" className="text-white/50 hover:text-blue-400 transition-colors">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                        </svg>
                      </a>
                    )}
                    {user.instagram_url && (
                      <a href={user.instagram_url} target="_blank" rel="noopener noreferrer" className="text-white/50 hover:text-pink-400 transition-colors">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path fillRule="evenodd" d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" clipRule="evenodd" />
                        </svg>
                      </a>
                    )}
                    {user.website_url && (
                      <a href={user.website_url} target="_blank" rel="noopener noreferrer" className="text-white/50 hover:text-[#E50914] transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                      </a>
                    )}
                  </div>
                )}

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
                    <label className="text-white/70 font-medium">Avatar</label>
                    <div className="sm:col-span-2">
                       {isEditing ? (
                         <div className="flex items-center gap-4">
                           {editForm.avatar_url && (
                             <div className="w-12 h-12 rounded-full overflow-hidden relative flex-shrink-0">
                               <Image src={editForm.avatar_url} alt="Avatar preview" fill className="object-cover" />
                             </div>
                           )}
                           <input
                             type="file"
                             accept="image/*"
                             onChange={(e) => handleFileUpload(e, 'avatar_url')}
                             className="bg-[#0A0A0A] border border-white/10 rounded-lg px-4 py-2 text-white w-full focus:border-[#E50914] outline-none text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#E50914] file:text-white hover:file:bg-red-700"
                           />
                         </div>
                       ) : (
                         <span className="text-white/50 text-sm truncate block">{user.avatar_url ? 'Avatar personnalisé défini' : 'Aucun avatar défini'}</span>
                       )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center py-4 border-b border-white/5">
                    <label className="text-white/70 font-medium">Bannière</label>
                    <div className="sm:col-span-2">
                       {isEditing ? (
                         <div className="flex flex-col gap-2">
                           {editForm.banner_url && (
                             <div className="w-full h-20 rounded-lg overflow-hidden relative">
                               <Image src={editForm.banner_url} alt="Banner preview" fill className="object-cover" />
                             </div>
                           )}
                           <input
                             type="file"
                             accept="image/*"
                             onChange={(e) => handleFileUpload(e, 'banner_url')}
                             className="bg-[#0A0A0A] border border-white/10 rounded-lg px-4 py-2 text-white w-full focus:border-[#E50914] outline-none text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#E50914] file:text-white hover:file:bg-red-700"
                           />
                         </div>
                       ) : (
                         <span className="text-white/50 text-sm truncate block">{user.banner_url ? 'Bannière personnalisée définie' : 'Aucune bannière définie'}</span>
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
                      {isEditing ? (
                        <textarea
                          value={editForm.bio}
                          onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                          className="bg-[#0A0A0A] border border-white/10 rounded-lg px-4 py-2 text-white w-full focus:border-[#E50914] outline-none min-h-[100px]"
                          placeholder="Parlez-nous de vous..."
                        />
                      ) : (
                        <span className="text-white/80 italic">{user.bio || 'Aucune bio définie'}</span>
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
                        <span className="text-white/80">{user.twitter_url ? <a href={user.twitter_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{user.twitter_url}</a> : 'Non défini'}</span>
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
                        <span className="text-white/80">{user.instagram_url ? <a href={user.instagram_url} target="_blank" rel="noopener noreferrer" className="text-pink-400 hover:underline">{user.instagram_url}</a> : 'Non défini'}</span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center py-4 border-b border-white/5">
                    <label className="text-white/70 font-medium">Site Web</label>
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
                        <span className="text-white/80">{user.website_url ? <a href={user.website_url} target="_blank" rel="noopener noreferrer" className="text-[#E50914] hover:underline">{user.website_url}</a> : 'Non défini'}</span>
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
                      Modifier le profil
                    </button>
                  </div>
                ) : (
                  <div className="mt-8 flex justify-end gap-4">
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-6 py-3 bg-white/10 text-white rounded-full font-medium hover:bg-white/20 transition-colors"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleSaveProfile}
                      disabled={saving}
                      className="flex items-center gap-2 px-6 py-3 bg-[#E50914] text-white rounded-full font-medium hover:bg-red-700 transition-colors"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Enregistrer
                    </button>
                  </div>
                )}
              </div>

              {/* Password Change Section */}
              <div className="pt-8 border-t border-white/10">
                <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider mb-6">Sécurité</h3>
                
                <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                  <div>
                    <label className="block text-sm text-white/70 mb-1">Mot de passe actuel</label>
                    <input
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                      className="bg-[#0A0A0A] border border-white/10 rounded-lg px-4 py-2 text-white w-full focus:border-[#E50914] outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-white/70 mb-1">Nouveau mot de passe</label>
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
                    <label className="block text-sm text-white/70 mb-1">Confirmer le nouveau mot de passe</label>
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
                    Mettre à jour le mot de passe
                  </button>
                </form>
              </div>

              {/* Danger Zone */}
              <div className="pt-8 border-t border-white/10">
                <h3 className="text-sm font-medium text-red-500 uppercase tracking-wider mb-6">Zone de danger</h3>
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6">
                  <h4 className="text-white font-medium mb-2">Supprimer le compte</h4>
                  <p className="text-white/60 text-sm mb-4">
                    Une fois que vous supprimez votre compte, il n&apos;y a pas de retour en arrière possible. Soyez certain.
                  </p>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={isDeleting}
                    className="px-6 py-2 bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                  >
                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Supprimer mon compte
                  </button>
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
