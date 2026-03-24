"use client";

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Clock, Search, User, Plus, Minus, Save, ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { getRankFromWatchTime } from '@/utils/ranks';
import { useLanguage } from '@/context/LanguageContext';

export default function WatchTimeManager() {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [saving, setSaving] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/users?search=${search}&page=${page}&limit=20&sort=total_watch_time`);
        if (res.ok) {
          const data = await res.json();
          setUsers(data.users);
          setTotalPages(data.totalPages);
        }
      } catch (error) {
        console.error('Failed to fetch users', error);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, [page, search]);

  const handleAdjustWatchTime = async (userId: number, minutesToAdd: number) => {
    setSaving(userId);
    try {
      const res = await fetch('/api/admin/watch-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, minutesToAdd })
      });
      
      if (res.ok) {
        setUsers(users.map(u => {
          if (u.id === userId) {
            return { ...u, total_watch_time: parseInt(u.total_watch_time) + minutesToAdd };
          }
          return u;
        }));
      } else {
        const data = await res.json();
        showToast(data.error || t.admin.error, 'error');
      }
    } catch (error) {
      console.error('Failed to adjust watch time', error);
      showToast(t.admin.error, 'error');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">{t.admin.watchTime}</h2>
        <p className="text-zinc-400">{t.admin.watchTimeDescription}</p>
      </div>

      <div className="bg-[#111] border border-white/10 rounded-xl p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-purple-500" />
            {t.admin.userListSorted}
          </h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input 
              type="text" 
              placeholder={t.admin.search} 
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9 pr-4 py-2 bg-[#1A1A1A] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500 w-64"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="p-4 font-medium text-zinc-400">{t.admin.user}</th>
                <th className="p-4 font-medium text-zinc-400">{t.admin.currentRank}</th>
                <th className="p-4 font-medium text-zinc-400">{t.admin.totalTime}</th>
                <th className="p-4 font-medium text-zinc-400 text-center">{t.admin.quickAdjustment}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-zinc-500">{t.admin.loading}</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-zinc-500">{t.admin.noUserFound}</td>
                </tr>
              ) : (
                users.map((user) => {
                  const rank = getRankFromWatchTime(user.total_watch_time, user.watched_count);
                  const RankIcon = rank?.icon;
                  
                  return (
                    <tr key={user.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="p-4 flex items-center gap-3">
                        {user.avatar_url ? (
                          <div className="relative w-10 h-10 shrink-0">
                            <Image 
                              src={user.avatar_url} 
                              alt={user.name} 
                              fill
                              className="rounded-full object-cover" 
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                            <User className="w-5 h-5 text-zinc-400" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-white">{user.name}</p>
                          <p className="text-xs text-zinc-500">{user.email}</p>
                        </div>
                      </td>
                      <td className="p-4">
                        {rank ? (
                          <div 
                            className="flex items-center gap-2 px-3 py-1 rounded-full w-fit shadow-sm" 
                            style={{ 
                              backgroundColor: `${rank.color}1A`, 
                              color: rank.color,
                              boxShadow: `0 0 10px ${rank.color}33`
                            }}
                          >
                            <RankIcon className="w-3 h-3" style={{ color: rank.color }} />
                            <span className="text-[10px] font-bold uppercase tracking-widest leading-none">
                              {rank.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-zinc-500">-</span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className="font-mono text-white font-bold">
                          {Math.floor(user.total_watch_time / 60)}h <span className="text-zinc-500 text-xs">{user.total_watch_time % 60}m</span>
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => handleAdjustWatchTime(user.id, -60)}
                            disabled={saving === user.id}
                            className="p-2 bg-white/5 rounded hover:bg-red-500/20 hover:text-red-500 transition-colors disabled:opacity-50"
                            title="-1h"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleAdjustWatchTime(user.id, 60)}
                            disabled={saving === user.id}
                            className="p-2 bg-white/5 rounded hover:bg-emerald-500/20 hover:text-emerald-500 transition-colors disabled:opacity-50"
                            title="+1h"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-white/10 flex justify-between items-center mt-4">
          <button 
            disabled={page === 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-lg disabled:opacity-50 hover:bg-white/10 transition-colors text-white"
          >
            <ChevronLeft className="w-4 h-4" /> {t.admin.prev}
          </button>
          <span className="text-zinc-400">{t.interpolate(t.admin.pageOf, { page, total: totalPages || 1 })}</span>
          <button 
            disabled={page === totalPages || totalPages === 0}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-lg disabled:opacity-50 hover:bg-white/10 transition-colors text-white"
          >
            {t.admin.next} <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <div className={`px-4 py-3 rounded-lg shadow-xl flex items-center gap-3 ${
              toast.type === 'success' ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white'
            }`}>
              <span className="font-medium">{toast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
