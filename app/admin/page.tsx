"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutDashboard, Users, Shield, LayoutTemplate, Flag, Clock, Activity, LogOut, Menu, X } from 'lucide-react';
import Dashboard from '@/components/admin/Dashboard';
import UsersManager from '@/components/admin/UsersManager';
import RolesManager from '@/components/admin/RolesManager';
import ContentManager from '@/components/admin/ContentManager';
import ModerationManager from '@/components/admin/ModerationManager';
import WatchTimeManager from '@/components/admin/WatchTimeManager';
import OnlineUsersManager from '@/components/admin/OnlineUsersManager';
import SystemManager from '@/components/admin/SystemManager';
import { useLanguage } from '@/context/LanguageContext';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, ChevronUp, Database, ShieldCheck, RefreshCw } from 'lucide-react';

export default function AdminPage() {
  const { t } = useLanguage();
  const [activeSection, setActiveSection] = useState('dashboard');
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
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
    { id: 'system', label: "Système Spécial", icon: Zap, permissions: ['access_admin_panel'] },
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
      case 'system': return <SystemManager />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#0A0A0A] relative">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-[#111] border-r border-white/10 flex flex-col transition-transform duration-300 transform
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:relative lg:translate-x-0
      `}>
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <h1 className="text-2xl font-black tracking-tighter text-white">MOVEO <span className="text-red-600">ADMIN</span></h1>
          <button 
            className="lg:hidden text-zinc-400 hover:text-white"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-3">
            {sections.map((section) => {
              // Check if user has permission to view this section
              if (section.permissions && !section.permissions.some((p: string) => user.permissions?.includes(p))) return null;
              
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              const isSpecial = section.id === 'system';
              
              return (
                <li key={section.id}>
                  <button
                    onClick={() => {
                      setActiveSection(section.id);
                      setIsSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300 ${
                      isActive 
                      ? (isSpecial ? 'bg-gradient-to-r from-red-600 to-rose-700 text-white shadow-lg shadow-red-900/20' : 'bg-red-600 text-white') 
                      : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                    } ${isSpecial && !isActive ? 'border border-red-600/20' : ''}`}
                  >
                    <Icon className={`w-5 h-5 ${isSpecial && !isActive ? 'text-red-500' : ''}`} />
                    <span className="font-medium">{section.label}</span>
                    {isSpecial && <span className="ml-auto text-[8px] font-black bg-red-600 text-white px-1.5 py-0.5 rounded uppercase tracking-tighter">NEW</span>}
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

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Mobile Header */}
        <header className="lg:hidden h-16 bg-[#111] border-b border-white/10 flex items-center justify-between px-4 shrink-0">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-black tracking-tighter text-white">MOVEO <span className="text-red-600">ADMIN</span></h1>
          <div className="w-10" /> {/* Spacer for centering */}
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-[#0A0A0A] p-4 md:p-8">
          {renderSection()}
        </div>

        {/* Quick Actions Floating Menu */}
        <div className="fixed bottom-6 right-6 z-[60]">
          <AnimatePresence>
            {isQuickActionsOpen && (
              <motion.div 
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.9 }}
                className="absolute bottom-16 right-0 w-56 bg-[#111] border border-white/10 rounded-2xl p-2 shadow-2xl overflow-hidden"
              >
                <div className="px-3 py-2 mb-1 border-b border-white/5">
                  <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Actions Spéciales</p>
                </div>
                <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-400 hover:bg-white/5 hover:text-white transition-all group">
                  <Database className="w-4 h-4 group-hover:text-red-500" />
                  <span className="font-bold">Backup Rapide</span>
                </button>
                <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-400 hover:bg-white/5 hover:text-white transition-all group">
                  <ShieldCheck className="w-4 h-4 group-hover:text-emerald-500" />
                  <span className="font-bold">Audit Sécurité</span>
                </button>
                <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-400 hover:bg-white/5 hover:text-white transition-all group">
                  <RefreshCw className="w-4 h-4 group-hover:text-blue-500" />
                  <span className="font-bold">Recharger API</span>
                </button>
                <div className="mt-1 pt-1 border-t border-white/5">
                  <button 
                    onClick={() => {
                      setActiveSection('system');
                      setIsQuickActionsOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-500 hover:bg-red-500/10 transition-all font-black uppercase tracking-tighter"
                  >
                    <Zap className="w-4 h-4 fill-current" />
                    Panel Système
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button 
            onClick={() => setIsQuickActionsOpen(!isQuickActionsOpen)}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl shadow-red-900/40 border-2 ${
              isQuickActionsOpen 
              ? 'bg-white border-white text-red-600 rotate-180' 
              : 'bg-red-600 border-red-500 text-white hover:scale-110'
            }`}
          >
            {isQuickActionsOpen ? <X className="w-6 h-6" /> : <Zap className="w-6 h-6 fill-current" />}
            {!isQuickActionsOpen && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-white text-red-600 text-[10px] font-black rounded-full flex items-center justify-center border-2 border-red-600 animate-bounce">
                !
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

