"use client";

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Activity, User, Globe, Clock } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export default function OnlineUsersManager() {
  const { t } = useLanguage();
  const [onlineData, setOnlineData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOnlineUsers();
    const interval = setInterval(fetchOnlineUsers, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchOnlineUsers = async () => {
    try {
      const res = await fetch('/api/admin/online');
      if (res.ok) {
        const data = await res.json();
        setOnlineData(data);
      }
    } catch (error) {
      console.error('Failed to fetch online users', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !onlineData) return <div className="text-zinc-400">{t.admin.loading}</div>;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <Activity className="w-8 h-8 text-emerald-500 animate-pulse" />
            {t.admin.online}
          </h2>
          <p className="text-zinc-400">{t.admin.onlineDescription}</p>
        </div>
        <div className="bg-[#111] border border-white/10 rounded-xl px-6 py-4 flex items-center gap-6">
          <div className="text-center">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{t.admin.total}</p>
            <p className="text-3xl font-bold text-white">{onlineData?.totalOnline || 0}</p>
          </div>
          <div className="w-px h-10 bg-white/10" />
          <div className="text-center">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{t.admin.registered}</p>
            <p className="text-3xl font-bold text-blue-500">{onlineData?.registeredCount || 0}</p>
          </div>
          <div className="w-px h-10 bg-white/10" />
          <div className="text-center">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{t.admin.visitors}</p>
            <p className="text-3xl font-bold text-zinc-400">{onlineData?.anonymousCount || 0}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Registered Users */}
        <div className="bg-[#111] border border-white/10 rounded-xl p-6">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <User className="w-5 h-5 text-blue-500" />
            {t.interpolate(t.admin.registeredUsersCount, { count: onlineData?.registeredCount || 0 })}
          </h3>
          
          <div className="space-y-4">
            {onlineData?.registeredUsers?.map((user: any) => (
              <div key={user.session_id} className="bg-[#1A1A1A] border border-white/5 rounded-lg p-4 flex items-start gap-4">
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
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-white flex items-center gap-2">
                        {user.name}
                        <span 
                          className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                          style={{ backgroundColor: `${user.role_color || '#808080'}20`, color: user.role_color || '#808080' }}
                        >
                          {user.role_name || 'User'}
                        </span>
                      </p>
                      <p className="text-xs text-zinc-500">{user.email}</p>
                    </div>
                    <span className="text-xs text-zinc-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(user.last_ping).toLocaleTimeString()}
                    </span>
                  </div>
                  
                  {user.current_movie_title && (
                    <div className="mt-3 p-2 bg-white/5 rounded border border-white/5 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-xs text-zinc-400">{t.admin.watching}</span>
                      <span className="text-sm font-medium text-white line-clamp-1">{user.current_movie_title}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {(!onlineData?.registeredUsers || onlineData.registeredUsers.length === 0) && (
              <p className="text-zinc-500 text-center py-8 italic">{t.admin.noRegisteredOnline}</p>
            )}
          </div>
        </div>

        {/* Anonymous Users */}
        <div className="bg-[#111] border border-white/10 rounded-xl p-6">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Globe className="w-5 h-5 text-zinc-400" />
            {t.interpolate(t.admin.anonymousVisitorsCount, { count: onlineData?.anonymousCount || 0 })}
          </h3>
          
          <div className="space-y-4">
            {onlineData?.anonymousUsers?.map((user: any) => (
              <div key={user.session_id} className="bg-[#1A1A1A] border border-white/5 rounded-lg p-4 flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                  <Globe className="w-5 h-5 text-zinc-500" />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-zinc-300">{t.admin.visitor}</p>
                      <p className="text-xs text-zinc-600 font-mono">{user.session_id.substring(0, 8)}...</p>
                    </div>
                    <span className="text-xs text-zinc-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(user.last_ping).toLocaleTimeString()}
                    </span>
                  </div>
                  
                  {user.current_movie_title && (
                    <div className="mt-3 p-2 bg-white/5 rounded border border-white/5 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-xs text-zinc-400">{t.admin.watching}</span>
                      <span className="text-sm font-medium text-white line-clamp-1">{user.current_movie_title}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {(!onlineData?.anonymousUsers || onlineData.anonymousUsers.length === 0) && (
              <p className="text-zinc-500 text-center py-8 italic">{t.admin.noVisitorsOnline}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
