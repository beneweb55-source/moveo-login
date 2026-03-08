"use client";

import { useState, useEffect } from 'react';
import { Shield, Plus, Edit2, Trash2, Check, X } from 'lucide-react';

const AVAILABLE_PERMISSIONS = [
  { id: 'access_admin_panel', label: 'Accéder au panel admin' },
  { id: 'view_stats', label: 'Voir les statistiques' },
  { id: 'view_users', label: 'Voir les utilisateurs' },
  { id: 'edit_roles', label: 'Modifier les rôles' },
  { id: 'ban_users', label: 'Bannir des utilisateurs' },
  { id: 'manage_roles', label: 'Gérer les rôles et permissions' },
  { id: 'edit_hero', label: 'Modifier le Hero Banner' },
  { id: 'pin_sections', label: 'Épingler des sections' },
  { id: 'view_reports', label: 'Voir les signalements' },
  { id: 'handle_reports', label: 'Traiter les signalements' },
  { id: 'manage_watch_time', label: 'Gérer le temps de visionnage' },
];

export default function RolesManager({ currentUser }: { currentUser: any }) {
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    try {
      const res = await fetch('/api/admin/roles');
      if (res.ok) {
        const data = await res.json();
        setRoles(data);
      }
    } catch (error) {
      console.error('Failed to fetch roles', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRole = async (role: any) => {
    try {
      const method = role.id ? 'PUT' : 'POST';
      const res = await fetch('/api/admin/roles', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(role)
      });
      
      if (res.ok) {
        fetchRoles();
        setEditingRole(null);
        setIsCreating(false);
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (error) {
      console.error('Failed to save role', error);
    }
  };

  const handleDeleteRole = async (id: number) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce rôle ? Les utilisateurs seront réassignés au rôle par défaut.')) return;
    
    try {
      const res = await fetch(`/api/admin/roles?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchRoles();
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (error) {
      console.error('Failed to delete role', error);
    }
  };

  if (loading) return <div className="text-zinc-400">Chargement des rôles...</div>;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Rôles & Permissions</h2>
          <p className="text-zinc-400">Gérez les niveaux d'accès et les permissions de la plateforme.</p>
        </div>
        <button 
          onClick={() => { setIsCreating(true); setEditingRole({ name: '', color: '#ffffff', permissions: [], priority: 10 }); }}
          disabled={!currentUser.permissions?.includes('manage_roles')}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          <Plus className="w-5 h-5" />
          Nouveau Rôle
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Roles List */}
        <div className="lg:col-span-1 space-y-4">
          {roles.map(role => (
            <div 
              key={role.id}
              onClick={() => { if (!isCreating) setEditingRole(role); }}
              className={`p-4 rounded-xl border transition-colors cursor-pointer ${editingRole?.id === role.id ? 'bg-white/10 border-white/20' : 'bg-[#111] border-white/5 hover:bg-white/5'}`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: role.color }} />
                  <h3 className="font-bold text-white text-lg">{role.name}</h3>
                </div>
                {role.name !== 'Admin' && currentUser.permissions?.includes('manage_roles') && role.priority < currentUser.priority && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeleteRole(role.id); }}
                    className="text-zinc-500 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-sm text-zinc-400">Priorité : {role.priority}</p>
              <p className="text-sm text-zinc-400 mt-2">{role.permissions?.length || 0} permissions</p>
            </div>
          ))}
        </div>

        {/* Role Editor */}
        <div className="lg:col-span-2">
          {(editingRole || isCreating) ? (
            <div className="bg-[#111] border border-white/10 rounded-xl p-6">
              <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-red-500" />
                  {isCreating ? 'Créer un rôle' : `Modifier : ${editingRole.name}`}
                </h3>
                <button 
                  onClick={() => { setEditingRole(null); setIsCreating(false); }}
                  className="text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Nom du rôle</label>
                    <input 
                      type="text" 
                      value={editingRole.name}
                      onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })}
                      disabled={editingRole.name === 'Admin'}
                      className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-red-500 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Couleur (Hex)</label>
                    <div className="flex gap-2">
                      <input 
                        type="color" 
                        value={editingRole.color}
                        onChange={(e) => setEditingRole({ ...editingRole, color: e.target.value })}
                        className="w-10 h-10 rounded cursor-pointer bg-transparent border-0 p-0"
                      />
                      <input 
                        type="text" 
                        value={editingRole.color}
                        onChange={(e) => setEditingRole({ ...editingRole, color: e.target.value })}
                        className="flex-1 bg-[#1A1A1A] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-red-500 uppercase"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Priorité (0-100, plus c'est haut, plus c'est important)</label>
                  <input 
                    type="number" 
                    min="0" max="100"
                    value={editingRole.priority}
                    onChange={(e) => setEditingRole({ ...editingRole, priority: parseInt(e.target.value) })}
                    disabled={editingRole.name === 'Admin'}
                    className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-red-500 disabled:opacity-50"
                  />
                  <p className="text-xs text-zinc-500 mt-1">Un rôle ne peut modifier que les rôles ayant une priorité strictement inférieure à la sienne.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-4">Permissions</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {AVAILABLE_PERMISSIONS.map(perm => {
                      const hasPerm = editingRole.permissions?.includes(perm.id);
                      return (
                        <label 
                          key={perm.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${hasPerm ? 'bg-red-500/10 border-red-500/30' : 'bg-[#1A1A1A] border-white/5 hover:bg-white/5'}`}
                        >
                          <div className={`w-5 h-5 rounded border flex items-center justify-center ${hasPerm ? 'bg-red-500 border-red-500' : 'border-zinc-600'}`}>
                            {hasPerm && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <input 
                            type="checkbox" 
                            className="hidden"
                            checked={hasPerm}
                            disabled={editingRole.name === 'Admin'}
                            onChange={(e) => {
                              const newPerms = e.target.checked 
                                ? [...(editingRole.permissions || []), perm.id]
                                : (editingRole.permissions || []).filter((p: string) => p !== perm.id);
                              setEditingRole({ ...editingRole, permissions: newPerms });
                            }}
                          />
                          <span className={`text-sm ${hasPerm ? 'text-white font-medium' : 'text-zinc-400'}`}>{perm.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-4 pt-4 border-t border-white/10">
                  <button 
                    onClick={() => { setEditingRole(null); setIsCreating(false); }}
                    className="px-6 py-2 bg-white/5 text-white rounded-lg font-bold hover:bg-white/10 transition-colors"
                  >
                    Annuler
                  </button>
                  <button 
                    onClick={() => handleSaveRole(editingRole)}
                    disabled={!currentUser.permissions?.includes('manage_roles') || (editingRole.priority >= currentUser.priority && currentUser.role_name !== 'Admin')}
                    className="px-6 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    <Check className="w-5 h-5" />
                    Enregistrer
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[#111] border border-white/10 rounded-xl p-12 flex flex-col items-center justify-center text-center h-full">
              <Shield className="w-16 h-16 text-zinc-800 mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">Sélectionnez un rôle</h3>
              <p className="text-zinc-400 max-w-md">
                Cliquez sur un rôle dans la liste pour voir ou modifier ses permissions, ou créez un nouveau rôle.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
