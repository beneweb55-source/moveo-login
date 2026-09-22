"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutDashboard, Users, Shield, LayoutTemplate, Flag, Clock, Activity, LogOut, Home, Menu, X, Zap, type LucideIcon } from 'lucide-react';
import Dashboard from '@/components/admin/Dashboard';
import UsersManager from '@/components/admin/UsersManager';
import RolesManager from '@/components/admin/RolesManager';
import ContentManager from '@/components/admin/ContentManager';
import ModerationManager from '@/components/admin/ModerationManager';
import WatchTimeManager from '@/components/admin/WatchTimeManager';
import OnlineUsersManager from '@/components/admin/OnlineUsersManager';
import SystemManager from '@/components/admin/SystemManager';
import { useLanguage } from '@/context/LanguageContext';

// The floating "Quick Actions" menu that used to be mounted under the content
// area is gone. Three of its four entries — "Backup Rapide", "Audit Sécurité",
// "Recharger API" — had no `onClick` at all: buttons that did nothing, which is
// a control that reads as a capability and is not one (§4). The fourth only
// switched to the system section, which the sidebar beside it already does. It
// also carried a permanently bouncing red "!" badge, which implied that
// something on the panel needed attention at every moment, on every section.

export default function AdminPage() {
  const { t } = useLanguage();
  const [activeSection, setActiveSection] = useState('dashboard');
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          // The two console.log calls that stood here printed the whole
          // `/api/auth/me` payload — the account's email, bio, links and
          // permission set — into the browser console of every admin page load,
          // and the extracted permission list beside it. Nothing consumed either
          // one, and the panel it logged to is the one surface on the site whose
          // contents are worth not leaving in a console (§7).
          const permissions = data.user?.permissions || [];
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

  // This layout renders no <Header>, and the Header is where the rest of the
  // site keeps its sign-out — so this panel was the only authenticated surface
  // with no way to end a session. On a shared machine the sole recourse was to
  // navigate to the public site and use the menu there.
  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout failed', error);
    } finally {
      // Navigate either way. The cookie is the session, and an admin who asked
      // to leave must not be held on the panel by a failed request.
      router.push('/');
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A] text-white">{t.admin.loading}</div>;
  }

  if (!user) return null;

  // `permissions` reads as "any of these grants the section" — that is what the
  // guard below has always done, and it is right for `content`, which is
  // reachable through either of two independent capabilities.
  //
  // `allOf` is "every one of these", and it exists for the watch-time section.
  // That section lists users through /api/admin/users, which requires
  // `view_users`, while its adjustment action requires `manage_watch_time`. It
  // was offered on `manage_watch_time` alone, so a role holding only that
  // permission was shown a section it could never populate — the request came
  // back 403 and the table rendered as "Aucun utilisateur trouvé". A tool whose
  // data the admin is not permitted to read should not be offered at all.
  const sections: { id: string; label: string; icon: LucideIcon; permissions: string[]; allOf?: string[] }[] = [
    { id: 'dashboard', label: t.admin.dashboard, icon: LayoutDashboard, permissions: ['view_stats'] },
    { id: 'users', label: t.admin.users, icon: Users, permissions: ['view_users'] },
    { id: 'roles', label: t.admin.roles, icon: Shield, permissions: ['manage_roles'] },
    { id: 'content', label: t.admin.content, icon: LayoutTemplate, permissions: ['edit_hero', 'pin_sections'] },
    { id: 'moderation', label: t.admin.moderation, icon: Flag, permissions: ['view_reports'] },
    { id: 'watchtime', label: t.admin.watchTime, icon: Clock, permissions: ['manage_watch_time'], allOf: ['view_users'] },
    { id: 'online', label: t.admin.online, icon: Activity, permissions: ['access_admin_panel'] },
    { id: 'system', label: t.admin.system, icon: Zap, permissions: ['access_admin_panel'] },
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
              // ...and, where the section declares it, every permission in `allOf`.
              if (section.allOf && !section.allOf.every((p: string) => user.permissions?.includes(p))) return null;
              
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
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        
        <div className="p-4 border-t border-white/10 space-y-1">
          <button
            onClick={() => router.push('/')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white transition-colors"
          >
            <Home className="w-5 h-5" />
            <span className="font-medium">{t.admin.backToSite}</span>
          </button>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-400 hover:bg-red-500/10 hover:text-red-500 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">{t.nav.logout}</span>
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

      </div>
    </div>
  );
}

