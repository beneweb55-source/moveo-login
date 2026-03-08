"use client";

import { useState, useEffect } from 'react';
import { Shield, Plus, Edit2, Trash2, X, Check, GripVertical } from 'lucide-react';
import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableRoleItem({ role, onEdit, onDelete }: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: role.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center justify-between p-4 bg-[#1A1A1A] border border-white/5 rounded-lg group hover:border-white/10 transition-colors">
      <div className="flex items-center gap-4">
        <button {...attributes} {...listeners} className="cursor-grab text-zinc-600 hover:text-white transition-colors p-1 rounded hover:bg-white/5">
          <GripVertical className="w-5 h-5" />
        </button>
        
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: role.color, boxShadow: `0 0 10px ${role.color}` }} />
          <div>
            <p className="font-bold text-white">{role.name}</p>
            <p className="text-xs text-zinc-500">{(role.permissions ?? []).length} permissions</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          onClick={() => onEdit(role)}
          className="p-2 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors"
        >
          <Edit2 className="w-4 h-4" />
        </button>
        <button 
          onClick={() => onDelete(role.id)}
          className="p-2 hover:bg-red-500/10 rounded-lg text-zinc-400 hover:text-red-500 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function RolesManager({ currentUser }: { currentUser: any }) {
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    try {
      const res = await fetch('/api/admin/roles');
      if (res.ok) {
        const data = await res.json();
        // Sort by priority DESC
        setRoles(data.sort((a: any, b: any) => b.priority - a.priority));
      }
    } catch (error) {
      console.error('Failed to fetch roles', error);
    } finally {
      setLoading(false);
    }
  };

  // Split roles into locked and sortable
  const lockedRoles = roles.filter(r => r.name === 'Fondateur' || r.name === 'Admin' || r.priority >= 999);
  const sortableRoles = roles.filter(r => !(r.name === 'Fondateur' || r.name === 'Admin' || r.priority >= 999));

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortableRoles.findIndex((item) => item.id === active.id);
    const newIndex = sortableRoles.findIndex((item) => item.id === over.id);

    const newSortableRoles = arrayMove(sortableRoles, oldIndex, newIndex);
    
    // Reconstruct full list
    const newRoles = [...lockedRoles, ...newSortableRoles];
    setRoles(newRoles);

    // Calculate priorities
    // Locked roles keep their high priority (e.g. 100, 99...)
    // Sortable roles get priorities starting from e.g. 80 downwards.
    
    const updates = newSortableRoles.map((role, index) => ({
      id: role.id,
      priority: 80 - index // Simple logic: 80, 79, 78...
    }));

    try {
      await fetch('/api/admin/roles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates })
      });
    } catch (error) {
      console.error('Failed to update priorities', error);
    }
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const method = editingRole.id ? 'PUT' : 'POST';
      const body = { ...editingRole };
      
      // If creating new role, assign a default priority at the bottom
      if (!editingRole.id) {
        body.priority = 0; 
      }

      const res = await fetch('/api/admin/roles', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        setIsEditing(false);
        setEditingRole(null);
        fetchRoles();
      }
    } catch (error) {
      console.error('Failed to save role', error);
    }
  };

  const handleDeleteRole = async (id: number) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce rôle ?')) return;
    try {
      const res = await fetch(`/api/admin/roles?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchRoles();
      }
    } catch (error) {
      console.error('Failed to delete role', error);
    }
  };

  const togglePermission = (perm: string) => {
    const currentPerms = editingRole.permissions || [];
    if (currentPerms.includes(perm)) {
      setEditingRole({ ...editingRole, permissions: currentPerms.filter((p: string) => p !== perm) });
    } else {
      setEditingRole({ ...editingRole, permissions: [...currentPerms, perm] });
    }
  };

  if (loading) return <div className="text-zinc-500">Chargement...</div>;

  if (isEditing) {
    return (
      <div className="bg-[#111] border border-white/10 rounded-xl p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-white">
            {editingRole.id ? 'Modifier le rôle' : 'Nouveau rôle'}
          </h3>
          <button onClick={() => setIsEditing(false)} className="p-2 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSaveRole} className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Nom du rôle</label>
              <input 
                type="text" 
                value={editingRole.name}
                onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })}
                className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Couleur (Hex)</label>
              <div className="flex gap-2">
                <input 
                  type="color" 
                  value={editingRole.color}
                  onChange={(e) => setEditingRole({ ...editingRole, color: e.target.value })}
                  className="h-10 w-10 rounded cursor-pointer bg-transparent border-0"
                />
                <input 
                  type="text" 
                  value={editingRole.color}
                  onChange={(e) => setEditingRole({ ...editingRole, color: e.target.value })}
                  className="flex-1 bg-[#1A1A1A] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 uppercase"
                  pattern="^#[0-9A-Fa-f]{6}$"
                  required
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-4">Permissions</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {['access_admin_panel', 'manage_roles', 'view_users', 'edit_users', 'ban_users', 'manage_content'].map(perm => (
                <div 
                  key={perm}
                  onClick={() => togglePermission(perm)}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors flex items-center gap-3 ${
                    (editingRole.permissions ?? []).includes(perm) 
                      ? 'bg-blue-500/10 border-blue-500/50 text-blue-400' 
                      : 'bg-[#1A1A1A] border-white/5 text-zinc-500 hover:bg-white/5'
                  }`}
                >
                  <div className={`w-5 h-5 rounded flex items-center justify-center border ${
                    (editingRole.permissions ?? []).includes(perm) ? 'bg-blue-500 border-blue-500' : 'border-zinc-600'
                  }`}>
                    {(editingRole.permissions ?? []).includes(perm) && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className="text-sm font-medium">{perm.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-4 pt-4 border-t border-white/10">
            <button 
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
            >
              Annuler
            </button>
            <button 
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors"
            >
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Gestion des Rôles</h2>
          <p className="text-zinc-400">Glissez-déposez pour réorganiser la hiérarchie.</p>
        </div>
        <button 
          onClick={() => {
            setEditingRole({ name: '', color: '#3b82f6', permissions: [], priority: 0 });
            setIsEditing(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Nouveau Rôle
        </button>
      </div>

      <div className="space-y-3">
        {/* Locked Roles */}
        {lockedRoles.map(role => (
          <div key={role.id} className="flex items-center justify-between p-4 bg-[#111] border border-white/10 rounded-lg opacity-75">
            <div className="flex items-center gap-4">
              <div className="w-7 h-7 flex items-center justify-center">
                <Shield className="w-5 h-5 text-yellow-500" />
              </div>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: role.color, boxShadow: `0 0 10px ${role.color}` }} />
                <div>
                  <p className="font-bold text-white">{role.name} <span className="text-xs text-yellow-500 ml-2">(Verrouillé)</span></p>
                  <p className="text-xs text-zinc-500">{(role.permissions ?? []).length} permissions</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
               {/* No actions for locked roles */}
            </div>
          </div>
        ))}

        {/* Sortable Roles */}
        <DndContext 
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext 
            items={sortableRoles.map(r => r.id)}
            strategy={verticalListSortingStrategy}
          >
            {sortableRoles.map(role => (
              <SortableRoleItem 
                key={role.id} 
                role={role} 
                onEdit={(r: any) => { setEditingRole(r); setIsEditing(true); }}
                onDelete={handleDeleteRole}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
