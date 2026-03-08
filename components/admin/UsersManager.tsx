"use client";

import { useState, useEffect } from 'react';
import { Search, MoreVertical, ShieldAlert, Clock, Calendar, Mail, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function UsersManager({ currentUser }: { currentUser: any }) {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  useEffect(() => {
    fetchUsers();
    fetchRoles();
  }, [page, search]);

  const fetchUsers = async () => {
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
  };

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
          setSelectedUser({ ...selectedUser, role_id: roleId });
        }
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (error) {
      console.error('Failed to update role', error);
    }
  };

  const handleBanUser = async (userId: number, isBanned: boolean) => {
    if (!confirm(`Êtes-vous sûr de vouloir ${isBanned ? 'bannir' : 'débannir'} cet utilisateur ?`)) return;
    
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isBanned, banReason: isBanned ? 'Violation des règles' : null })
      });
      if (res.ok) {
        fetchUsers();
        if (selectedUser?.id === userId) {
          setSelectedUser({ ...selectedUser, is_banned: isBanned });
        }
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (error) {
      console.error('Failed to ban user', error);
    }
  };

  const getRank = (minutes: number) => {
    if (minutes < 600) return 'Novice';
    if (minutes < 3000) return 'Amateur';
    if (minutes < 12000) return 'Cinephile';
    if (minutes < 30000) return 'Expert';
    return 'Master';
  };

  return (
    <div className="flex h-full gap-6">
      <div className={`flex-1 flex flex-col ${selectedUser ? 'hidden lg:flex' : 'flex'}`}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-white">Utilisateurs</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Rechercher un utilisateur..." 
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-10 pr-4 py-2 bg-[#111] border border-white/10 rounded-lg text-white focus:outline-none focus:border-red-500 w-64"
            />
          </div>
        </div>

        <div className="bg-[#111] border border-white/10 rounded-xl overflow-hidden flex-1 flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="p-4 font-medium text-zinc-400">Utilisateur</th>
                  <th className="p-4 font-medium text-zinc-400">Rôle</th>
                  <th className="p-4 font-medium text-zinc-400">Rang</th>
                  <th className="p-4 font-medium text-zinc-400">Temps</th>
                  <th className="p-4 font-medium text-zinc-400">Statut</th>
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
                        <img src={user.avatar_url} alt={user.name} className="w-10 h-10 rounded-full object-cover" />
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
                        className="px-2 py-1 rounded text-xs font-bold uppercase tracking-wider"
                        style={{ backgroundColor: `${user.role_color || '#808080'}20`, color: user.role_color || '#808080' }}
                      >
                        {user.role_name || 'User'}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-zinc-300">{getRank(user.total_watch_time)}</td>
                    <td className="p-4 text-sm text-zinc-300">{Math.floor(user.total_watch_time / 60)}h</td>
                    <td className="p-4">
                      {user.is_banned ? (
                        <span className="px-2 py-1 bg-red-500/20 text-red-500 rounded text-xs font-bold uppercase">Banni</span>
                      ) : (
                        <span className="px-2 py-1 bg-emerald-500/20 text-emerald-500 rounded text-xs font-bold uppercase">Actif</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          <div className="p-4 border-t border-white/10 flex justify-between items-center mt-auto">
            <button 
              disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-4 py-2 bg-white/5 rounded-lg disabled:opacity-50 hover:bg-white/10 transition-colors"
            >
              Précédent
            </button>
            <span className="text-zinc-400">Page {page} sur {totalPages || 1}</span>
            <button 
              disabled={page === totalPages || totalPages === 0}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="px-4 py-2 bg-white/5 rounded-lg disabled:opacity-50 hover:bg-white/10 transition-colors"
            >
              Suivant
            </button>
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
            className="w-full lg:w-96 bg-[#111] border border-white/10 rounded-xl flex flex-col overflow-hidden"
          >
            <div className="p-6 border-b border-white/10 flex justify-between items-start">
              <h3 className="text-xl font-bold text-white">Profil Utilisateur</h3>
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
                  <img src={selectedUser.avatar_url} alt={selectedUser.name} className="w-24 h-24 rounded-full object-cover mb-4 border-4 border-white/10" />
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
                  <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Rang</p>
                  <p className="font-bold text-white">{getRank(selectedUser.total_watch_time)}</p>
                </div>
                <div className="bg-white/5 p-4 rounded-lg text-center">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Temps</p>
                  <p className="font-bold text-white">{Math.floor(selectedUser.total_watch_time / 60)}h</p>
                </div>
              </div>

              <div className="space-y-4">
                <h5 className="font-medium text-white border-b border-white/10 pb-2">Gestion du Rôle</h5>
                <select 
                  value={roles.find(r => r.name === selectedUser.role_name)?.id || ''}
                  onChange={(e) => handleUpdateRole(selectedUser.id, parseInt(e.target.value))}
                  disabled={!currentUser.permissions?.includes('edit_roles') || (selectedUser.role_priority >= currentUser.priority && currentUser.role_name !== 'Admin')}
                  className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-red-500 disabled:opacity-50"
                >
                  <option value="" disabled>Sélectionner un rôle</option>
                  {roles.map(role => (
                    <option key={role.id} value={role.id} disabled={role.priority >= currentUser.priority && currentUser.role_name !== 'Admin'}>
                      {role.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-zinc-500">
                  Vous ne pouvez pas assigner ou modifier un rôle ayant une priorité supérieure ou égale à la vôtre.
                </p>
              </div>

              <div className="space-y-4">
                <h5 className="font-medium text-white border-b border-white/10 pb-2">Actions</h5>
                <button 
                  onClick={() => handleBanUser(selectedUser.id, !selectedUser.is_banned)}
                  disabled={!currentUser.permissions?.includes('ban_users') || (selectedUser.role_priority >= currentUser.priority && currentUser.role_name !== 'Admin')}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-bold transition-colors disabled:opacity-50 ${selectedUser.is_banned ? 'bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30' : 'bg-red-500/20 text-red-500 hover:bg-red-500/30'}`}
                >
                  <ShieldAlert className="w-5 h-5" />
                  {selectedUser.is_banned ? 'Débannir le compte' : 'Bannir le compte'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
