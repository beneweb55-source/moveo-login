"use client";

import { useState } from 'react';
import { Clock, Search, User, Plus, Minus, Save } from 'lucide-react';

export default function WatchTimeManager() {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [minutesToAdd, setMinutesToAdd] = useState(0);
  const [saving, setSaving] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!search) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?search=${search}&page=1`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
      }
    } catch (error) {
      console.error('Failed to search users', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdjustWatchTime = async () => {
    if (!selectedUser || minutesToAdd === 0) return;
    
    setSaving(true);
    try {
      const res = await fetch('/api/admin/watch-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUser.id, minutesToAdd })
      });
      
      if (res.ok) {
        alert('Temps de visionnage ajusté avec succès');
        setSelectedUser({ ...selectedUser, total_watch_time: parseInt(selectedUser.total_watch_time) + minutesToAdd });
        setMinutesToAdd(0);
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (error) {
      console.error('Failed to adjust watch time', error);
    } finally {
      setSaving(false);
    }
  };

  const getRank = (minutes: number) => {
    if (minutes < 600) return 'Novice';
    if (minutes < 3000) return 'Amateur';
    if (minutes < 12000) return 'Cinephile';
    if (minutes < 30000) return 'Expert';
    return 'Master';
  };

  const getNextRankThreshold = (minutes: number) => {
    if (minutes < 600) return 600;
    if (minutes < 3000) return 3000;
    if (minutes < 12000) return 12000;
    if (minutes < 30000) return 30000;
    return null;
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Watching Time (Outil de test)</h2>
        <p className="text-zinc-400">Ajustez manuellement le temps de visionnage des utilisateurs pour tester les rangs.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Search & Select User */}
        <div className="bg-[#111] border border-white/10 rounded-xl p-6">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-500" />
            Rechercher un utilisateur
          </h3>
          
          <form onSubmit={handleSearch} className="flex gap-2 mb-6">
            <input 
              type="text" 
              placeholder="Nom ou email..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-[#1A1A1A] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-red-500"
            />
            <button 
              type="submit"
              disabled={loading || !search}
              className="px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {loading ? '...' : 'Rechercher'}
            </button>
          </form>

          <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
            {users.map(user => (
              <div 
                key={user.id}
                onClick={() => { setSelectedUser(user); setMinutesToAdd(0); }}
                className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${selectedUser?.id === user.id ? 'bg-white/10 border-white/20' : 'bg-[#1A1A1A] border-white/5 hover:bg-white/5'}`}
              >
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt={user.name} className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                    <User className="w-5 h-5 text-zinc-400" />
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-medium text-white">{user.name}</p>
                  <p className="text-xs text-zinc-500">{user.email}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-white">{Math.floor(user.total_watch_time / 60)}h</p>
                  <p className="text-xs text-zinc-500">{getRank(user.total_watch_time)}</p>
                </div>
              </div>
            ))}
            {users.length === 0 && search && !loading && (
              <p className="text-zinc-500 text-center py-4">Aucun utilisateur trouvé.</p>
            )}
          </div>
        </div>

        {/* Adjust Time */}
        <div className="bg-[#111] border border-white/10 rounded-xl p-6">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Clock className="w-5 h-5 text-purple-500" />
            Ajuster le temps
          </h3>
          
          {selectedUser ? (
            <div className="space-y-6">
              <div className="bg-[#1A1A1A] border border-white/10 rounded-lg p-6 text-center">
                <h4 className="text-lg font-bold text-white mb-2">{selectedUser.name}</h4>
                <div className="flex justify-center gap-8 mb-4">
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Temps Actuel</p>
                    <p className="text-2xl font-bold text-white">{Math.floor(selectedUser.total_watch_time / 60)}h <span className="text-sm text-zinc-400">{selectedUser.total_watch_time % 60}m</span></p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Rang Actuel</p>
                    <p className="text-2xl font-bold text-purple-500">{getRank(selectedUser.total_watch_time)}</p>
                  </div>
                </div>
                
                {getNextRankThreshold(selectedUser.total_watch_time) && (
                  <div className="w-full bg-zinc-800 rounded-full h-2 mb-2 overflow-hidden">
                    <div 
                      className="bg-purple-500 h-2 rounded-full" 
                      style={{ width: `${(selectedUser.total_watch_time / getNextRankThreshold(selectedUser.total_watch_time)!) * 100}%` }}
                    />
                  </div>
                )}
                <p className="text-xs text-zinc-500">
                  {getNextRankThreshold(selectedUser.total_watch_time) 
                    ? `${getNextRankThreshold(selectedUser.total_watch_time)! - selectedUser.total_watch_time} minutes restantes avant le prochain rang`
                    : 'Rang maximum atteint !'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-4">Ajouter / Retirer des minutes</label>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setMinutesToAdd(m => m - 60)}
                    className="p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors text-white"
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <div className="flex-1 relative">
                    <input 
                      type="number" 
                      value={minutesToAdd}
                      onChange={(e) => setMinutesToAdd(parseInt(e.target.value) || 0)}
                      className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-4 py-3 text-center text-xl font-bold text-white focus:outline-none focus:border-purple-500"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 font-medium">min</span>
                  </div>
                  <button 
                    onClick={() => setMinutesToAdd(m => m + 60)}
                    className="p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors text-white"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="flex gap-2 mt-4 justify-center">
                  {[60, 600, 3000, 12000].map(val => (
                    <button 
                      key={val}
                      onClick={() => setMinutesToAdd(val)}
                      className="px-3 py-1 bg-white/5 rounded text-sm text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      +{val}m
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-white/10">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-zinc-400">Nouveau temps estimé :</span>
                  <span className="font-bold text-white">
                    {Math.floor((parseInt(selectedUser.total_watch_time) + minutesToAdd) / 60)}h {(parseInt(selectedUser.total_watch_time) + minutesToAdd) % 60}m
                  </span>
                </div>
                <div className="flex justify-between items-center mb-6">
                  <span className="text-zinc-400">Nouveau rang estimé :</span>
                  <span className="font-bold text-purple-500">
                    {getRank(parseInt(selectedUser.total_watch_time) + minutesToAdd)}
                  </span>
                </div>

                <button 
                  onClick={handleAdjustWatchTime}
                  disabled={saving || minutesToAdd === 0}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 transition-colors disabled:opacity-50"
                >
                  <Save className="w-5 h-5" />
                  {saving ? 'Application...' : 'Appliquer les modifications'}
                </button>
              </div>
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-center">
              <User className="w-12 h-12 text-zinc-800 mb-4" />
              <p className="text-zinc-500">Sélectionnez un utilisateur pour ajuster son temps de visionnage.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
