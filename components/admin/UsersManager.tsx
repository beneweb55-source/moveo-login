"use client";

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Search, MoreVertical, ShieldAlert, Clock, Calendar, Mail, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getRankFromWatchTime } from '@/utils/ranks';
import { useLanguage } from '@/context/LanguageContext';

export default function UsersManager({ currentUser }: { currentUser: any }) {
  const { t } = useLanguage();
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/users?page=${page}&search=${search}`);
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
  }, [page, search]);

  const fetchRoles = async () => {
    try {
      const res = await fetch('/api/admin/roles');
      if (res.ok) {
        const data = await res.json();
        setRoles(data);
      }
    } catch (error) {
      console.error('Failed to fetch roles', error);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchRoles();
  }, [fetchUsers]);

  const handleUpdateRole = async (userId: number, roleId: number) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, roleId })
      });
      if (res.ok) {
        fetchUsers();
        if (selectedUser?.id === userId) {
          const newRole = roles.find(r => r.id === roleId);
          setSelectedUser({ 
            ...selectedUser, 
            role_id: roleId,
            role_name: newRole?.name,
            role_color: newRole?.color,
            role_priority: newRole?.priority
          });
        }
      } else {
        const data = await res.json();
        showToast(data.error || t.admin.error, 'error');
      }
    } catch (error) {
      console.error('Failed to update role', error);
      showToast(t.admin.error, 'error');
    }
  };

  const [pendingBanUserId, setPendingBanUserId] = useState<number | null>(null);
  const [banReasonInput, setBanReasonInput] = useState('');

  const handleBanUser = async (userId: number, isBanned: boolean) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isBanned, banReason: isBanned ? (banReasonInput.trim() || t.admin.banReasonDefault) : null })
      });
      if (res.ok) {
        fetchUsers();
        if (selectedUser?.id === userId) setSelectedUser({ ...selectedUser, is_banned: isBanned, ban_reason: isBanned ? (banReasonInput.trim() || t.admin.banReasonDefault) : null });
        setPendingBanUserId(null);
        setBanReasonInput('');
      } else {
        const data = await res.json();
        showToast(data.error || t.admin.error, 'error');
      }
    } catch {
      showToast(t.admin.error, 'error');
    }
  };

  return (
    <div className="flex h-full gap-6 relative">
      <div className={`flex-1 flex flex-col ${selectedUser ? 'hidden lg:flex' : 'flex'}`}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <h2 className="text-2xl md:text-3xl font-bold text-white">{t.admin.users}</h2>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input 
              type="text" 
              placeholder={t.admin.searchUser}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-10 pr-4 py-2 bg-[#111] border border-white/10 rounded-lg text-white focus:outline-none focus:border-red-500 w-full"
            />
          </div>
        </div>

        <div className="bg-[#111] border border-white/10 rounded-xl overflow-hidden flex-1 flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="p-4 font-medium text-zinc-400">{t.admin.user}</th>
                  <th className="p-4 font-medium text-zinc-400">{t.admin.role}</th>
                  <th className="p-4 font-medium text-zinc-400">{t.admin.rank}</th>
                  <th className="p-4 font-medium text-zinc-400">{t.admin.time}</th>
                  <th className="p-4 font-medium text-zinc-400">{t.admin.status}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr 
                    key={user.id} 
                    onClick={() => setSelectedUser(user)}
                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                  >
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
                      <span 
                        className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border"
                        style={{ borderColor: user.role_color || '#808080', color: user.role_color || '#808080' }}
                      >
                        {user.role_name || 'User'}
                      </span>
                    </td>
                    <td className="p-4">
                      {(() => {
                        const rank = getRankFromWatchTime(user.total_watch_time, user.watched_count);
                        if (!rank) return <span className="text-zinc-500 text-xs">-</span>;
                        const RankIcon = rank.icon;
                        return (
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
                        );
                      })()}
                    </td>
                    <td className="p-4 text-sm text-zinc-300">{Math.floor(user.total_watch_time / 60)}h</td>
                    <td className="p-4">
                      {user.is_banned ? (
                        <span className="px-2 py-1 bg-red-500/20 text-red-500 rounded text-xs font-bold uppercase">{t.admin.banned}</span>
                      ) : (
                        <span className="px-2 py-1 bg-emerald-500/20 text-emerald-500 rounded text-xs font-bold uppercase">{t.admin.active}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          <div className="p-4 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4 mt-auto">
            <div className="flex gap-2 w-full sm:w-auto">
              <button 
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="flex-1 sm:flex-none px-4 py-2 bg-white/5 rounded-lg disabled:opacity-50 hover:bg-white/10 transition-colors"
              >
                {t.admin.prev}
              </button>
              <button 
                disabled={page === totalPages || totalPages === 0}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="flex-1 sm:flex-none px-4 py-2 bg-white/5 rounded-lg disabled:opacity-50 hover:bg-white/10 transition-colors"
              >
                {t.admin.next}
              </button>
            </div>
            <span className="text-zinc-400 text-sm">{t.interpolate(t.admin.pageOf, { page, total: totalPages || 1 })}</span>
          </div>
        </div>
      </div>

      {/* Side Panel */}
      <AnimatePresence>
        {selectedUser && (
            <motion.div 
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              className="fixed inset-0 lg:relative lg:inset-auto z-50 lg:z-0 w-full lg:w-96 bg-[#111] border-l lg:border border-white/10 lg:rounded-xl flex flex-col overflow-hidden"
            >
            <div className="p-6 border-b border-white/10 flex justify-between items-start">
              <h3 className="text-xl font-bold text-white">{t.admin.userProfile}</h3>
              <button 
                onClick={() => setSelectedUser(null)}
                className="text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              <div className="flex flex-col items-center text-center">
                {selectedUser.avatar_url ? (
                  <div className="relative w-24 h-24 mb-4 border-4 border-white/10 rounded-full overflow-hidden">
                    <Image 
                      src={selectedUser.avatar_url} 
                      alt={selectedUser.name} 
                      fill
                      className="object-cover" 
                      referrerPolicy="no-referrer"
                    />
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-full bg-zinc-800 flex items-center justify-center mb-4 border-4 border-white/10">
                    <User className="w-10 h-10 text-zinc-400" />
                  </div>
                )}
                <h4 className="text-2xl font-bold text-white">{selectedUser.name}</h4>
                <p className="text-zinc-400 flex items-center gap-2 mt-1">
                  <Mail className="w-4 h-4" /> {selectedUser.email}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 p-4 rounded-lg text-center">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{t.admin.rank}</p>
                  <p className="font-bold text-white">{getRankFromWatchTime(selectedUser.total_watch_time, selectedUser.watched_count)?.name || '-'}</p>
                </div>
                <div className="bg-white/5 p-4 rounded-lg text-center">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{t.admin.time}</p>
                  <p className="font-bold text-white">{Math.floor(selectedUser.total_watch_time / 60)}h</p>
                </div>
              </div>

              <div className="space-y-4">
                <h5 className="font-medium text-white border-b border-white/10 pb-2">{t.admin.roleManagement}</h5>
                <select 
                  value={selectedUser.role_id || ''}
                  onChange={(e) => handleUpdateRole(selectedUser.id, parseInt(e.target.value))}
                  disabled={(!(currentUser.permissions ?? []).includes('edit_roles') && !(currentUser.permissions ?? []).includes('manage_roles')) || (selectedUser.role_priority >= currentUser.priority && currentUser.role_name !== 'Admin' && !currentUser.is_founder)}
                  className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-red-500 disabled:opacity-50"
                >
                  <option value="" disabled>{t.admin.selectRole}</option>
                  {roles.map(role => (
                    <option key={role.id} value={role.id} disabled={role.priority >= currentUser.priority && currentUser.role_name !== 'Admin' && !currentUser.is_founder}>
                      {role.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-zinc-500">
                  {t.admin.rolePriorityNotice}
                </p>
              </div>

              <div className="space-y-4">
                <h5 className="font-medium text-white border-b border-white/10 pb-2">{t.admin.actions}</h5>
                <button 
                  onClick={() => setPendingBanUserId(selectedUser.id)}
                  disabled={!(currentUser.permissions ?? []).includes('ban_users') || (selectedUser.role_priority >= currentUser.priority && currentUser.role_name !== 'Admin' && !currentUser.is_founder)}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-bold transition-colors disabled:opacity-50 ${selectedUser.is_banned ? 'bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30' : 'bg-red-500/20 text-red-500 hover:bg-red-500/30'}`}
                >
                  <ShieldAlert className="w-5 h-5" />
                  {selectedUser.is_banned ? t.admin.unbanAccount : t.admin.banAccount}
                </button>
              
              {pendingBanUserId === selectedUser.id && (
                <div className="space-y-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg mt-2">
                  <p className="text-sm text-zinc-300">
                    {selectedUser.is_banned ? t.admin.unbanConfirm : t.admin.banConfirm}
                  </p>
                  
                  {!selectedUser.is_banned && (
                    <input
                      type="text"
                      placeholder={t.admin.banReasonPlaceholder || "Raison du bannissement (optionnel)..."}
                      value={banReasonInput}
                      onChange={(e) => setBanReasonInput(e.target.value)}
                      autoFocus
                      className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                    />
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleBanUser(selectedUser.id, !selectedUser.is_banned)}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${selectedUser.is_banned ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
                    >
                      {t.admin.confirm}
                    </button>
                    <button
                      onClick={() => {
                        setPendingBanUserId(null);
                        setBanReasonInput('');
                      }}
                      className="flex-1 py-2 bg-white/10 rounded-lg text-sm hover:bg-white/15 transition-colors"
                    >
                      {t.admin.cancel}
                    </button>
                  </div>
                </div>
              )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
