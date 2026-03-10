"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutDashboard, Users, Shield, LayoutTemplate, Flag, Clock, Activity, LogOut } from 'lucide-react';
import Dashboard from '@/components/admin/Dashboard';
import UsersManager from '@/components/admin/UsersManager';
import RolesManager from '@/components/admin/RolesManager';
import ContentManager from '@/components/admin/ContentManager';
import ModerationManager from '@/components/admin/ModerationManager';
import WatchTimeManager from '@/components/admin/WatchTimeManager';
import OnlineUsersManager from '@/components/admin/OnlineUsersManager';
import { useLanguage } from '@/context/LanguageContext';

export default function AdminPage() {
  const { t } = useLanguage();
  const [activeSection, setActiveSection] = useState('dashboard');
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          console.log("Admin Page - Données reçues de /auth/me:", data);
          const permissions = data.user?.permissions || [];
          console.log("Admin Page - Permissions extraites:", permissions);
          if (permissions.includes('access_admin_panel')) {
            setUser(data.user);
          } else {
            router.push('/');
          }
        } else {
          router.push('/');
        }
      } catch (error) {
        router.push('/');
      } finally {
        setLoading(false);
      }
    };
    checkAccess();
  }, [router]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A] text-white">{t.admin.loading}</div>;
  }

  if (!user) return null;

  const sections = [
    { id: 'dashboard', label: t.admin.dashboard, icon: LayoutDashboard, permissions: ['view_stats'] },
    { id: 'users', label: t.admin.users, icon: Users, permissions: ['view_users'] },
    { id: 'roles', label: t.admin.roles, icon: Shield, permissions: ['manage_roles'] },
    { id: 'content', label: t.admin.content, icon: LayoutTemplate, permissions: ['edit_hero', 'pin_sections'] },
    { id: 'moderation', label: t.admin.moderation, icon: Flag, permissions: ['view_reports'] },
    { id: 'watchtime', label: t.admin.watchTime, icon: Clock, permissions: ['manage_watch_time'] },
    { id: 'online', label: t.admin.online, icon: Activity, permissions: ['access_admin_panel'] },
  ];

  const renderSection = () => {
    switch (activeSection) {
      case 'dashboard': return <Dashboard />;
      case 'users': return <UsersManager currentUser={user} />;
      case 'roles': return <RolesManager currentUser={user} />;
      case 'content': return <ContentManager />;
      case 'moderation': return <ModerationManager />;
      case 'watchtime': return <WatchTimeManager />;
      case 'online': return <OnlineUsersManager />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#0A0A0A]">
      {/* Sidebar */}
      <div className="w-64 bg-[#111] border-r border-white/10 flex flex-col">
        <div className="p-6 border-b border-white/10">
          <h1 className="text-2xl font-black tracking-tighter text-white">MOVEO <span className="text-red-600">ADMIN</span></h1>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-3">
            {sections.map((section) => {
              // Check if user has permission to view this section
              if (section.permissions && !section.permissions.some((p: string) => user.permissions?.includes(p))) return null;
              
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              
              return (
                <li key={section.id}>
                  <button
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive ? 'bg-red-600 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{section.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        
        <div className="p-4 border-t border-white/10">
          <button 
            onClick={() => router.push('/')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">{t.admin.backToSite}</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-[#0A0A0A] p-8">
        {renderSection()}
      </div>
    </div>
  );
}
