"use client";

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Activity, User, Globe, Clock } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export default function OnlineUsersManager() {
  const { t } = useLanguage();
  const [onlineData, setOnlineData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // A 10-second poll that fails silently is the worst case for a live panel: the
  // numbers stay on screen, the heading keeps its pulsing "live" icon, and the
  // admin has no way to tell that what they are reading stopped updating minutes
  // ago. These two pieces of state let the feed admit its own age.
  // The reason is stored as a code, not as a translated sentence, so that
  // nothing here depends on `t`: useLanguage() returns a new `t` on every
  // render, so reading it inside a request callback either forces the callback's
  // dependency list to be unstable (a re-fetch per render, §14) or silently
  // freezes the message in whichever language was active when it was fetched.
  // The translation happens at render time instead.
  const [feedError, setFeedError] = useState<'permission' | 'network' | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  // Stable, so the polling effect below can name it as its only dependency. It
  // reads nothing but setState functions, which are themselves stable.
  const fetchOnlineUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/online');
      if (res.ok) {
        const data = await res.json();
        setOnlineData(data);
        setFeedError(null);
        setUpdatedAt(new Date());
      } else {
        setFeedError(res.status === 401 || res.status === 403 ? 'permission' : 'network');
      }
    } catch (error) {
      console.error('Failed to fetch online users', error);
      setFeedError('network');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOnlineUsers();
    const interval = setInterval(fetchOnlineUsers, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [fetchOnlineUsers]);

  if (loading && !onlineData) return <div className="text-zinc-400">{t.admin.loading}</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-1 flex items-center gap-3">
            {/* The pulse means "this is live". It has to stop when it is not. */}
            <Activity className={`w-6 h-6 sm:w-8 sm:h-8 ${feedError ? 'text-amber-500' : 'text-emerald-500 animate-pulse'}`} />
            {t.admin.online}
          </h2>
          <p className="text-zinc-400 text-sm">{t.admin.onlineDescription}</p>
          {/* The numbers below are only meaningful next to when they were read.
              Without this, a frozen feed is indistinguishable from a quiet site. */}
          {feedError ? (
            <p className="text-xs text-amber-500 mt-2">
              {t.interpolate(t.admin.onlineStale, { time: updatedAt ? updatedAt.toLocaleTimeString() : '—' })}{' '}
              {feedError === 'permission' ? t.admin.missingPermission : t.admin.loadFailed}
            </p>
          ) : updatedAt ? (
            <p className="text-xs text-zinc-500 mt-2">
              {t.interpolate(t.admin.onlineUpdated, { time: updatedAt.toLocaleTimeString() })}
            </p>
          ) : null}
        </div>
        <div className="w-full lg:w-auto bg-[#111] border border-white/10 rounded-xl px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between sm:justify-start gap-4 sm:gap-6">
          <div className="text-center flex-1 sm:flex-none">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{t.admin.total}</p>
            <p className="text-xl sm:text-3xl font-bold text-white">{onlineData?.totalOnline || 0}</p>
          </div>
          <div className="w-px h-8 sm:h-10 bg-white/10" />
          <div className="text-center flex-1 sm:flex-none">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{t.admin.registered}</p>
            <p className="text-xl sm:text-3xl font-bold text-blue-500">{onlineData?.registeredCount || 0}</p>
          </div>
          <div className="w-px h-8 sm:h-10 bg-white/10" />
          <div className="text-center flex-1 sm:flex-none">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{t.admin.visitors}</p>
            <p className="text-xl sm:text-3xl font-bold text-zinc-400">{onlineData?.anonymousCount || 0}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Registered Users */}
        <div className="bg-[#111] border border-white/10 rounded-xl p-4 sm:p-6">
          <h3 className="text-lg sm:text-xl font-bold text-white mb-6 flex items-center gap-2">
            <User className="w-5 h-5 text-blue-500" />
            {t.interpolate(t.admin.registeredUsersCount, { count: onlineData?.registeredCount || 0 })}
          </h3>
          
          <div className="space-y-4">
            {onlineData?.registeredUsers?.map((user: any) => (
              <div key={user.session_id} className="bg-[#1A1A1A] border border-white/5 rounded-lg p-3 sm:p-4 flex items-start gap-3 sm:gap-4">
                {user.avatar_url ? (
                  <div className="relative w-8 h-8 sm:w-10 sm:h-10 shrink-0">
                    <Image 
                      src={user.avatar_url} 
                      alt={user.name} 
                      fill
                      className="rounded-full object-cover" 
                      referrerPolicy="no-referrer"
                    />
                  </div>
                ) : (
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 sm:w-5 sm:h-5 text-zinc-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-1 sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-white text-sm truncate max-w-[120px] sm:max-w-none">
                          {user.name}
                        </p>
                        <span 
                          className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider"
                          style={{ backgroundColor: `${user.role_color || '#808080'}20`, color: user.role_color || '#808080' }}
                        >
                          {user.role_name || 'User'}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-500 truncate">{user.email}</p>
                    </div>
                    <span className="text-[10px] text-zinc-500 flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" />
                      {new Date(user.last_ping).toLocaleTimeString()}
                    </span>
                  </div>
                  
                  {user.current_movie_title && (
                    <div className="mt-3 p-2 bg-white/5 rounded border border-white/5 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                      <span className="text-[10px] text-zinc-500 shrink-0">{t.admin.watching}</span>
                      <span className="text-xs font-medium text-white truncate">{user.current_movie_title}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {(!onlineData?.registeredUsers || onlineData.registeredUsers.length === 0) && (
              <p className="text-zinc-500 text-center py-8 italic text-sm">{t.admin.noRegisteredOnline}</p>
            )}
          </div>
        </div>

        {/* Anonymous Users */}
        <div className="bg-[#111] border border-white/10 rounded-xl p-4 sm:p-6">
          <h3 className="text-lg sm:text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Globe className="w-5 h-5 text-zinc-400" />
            {t.interpolate(t.admin.anonymousVisitorsCount, { count: onlineData?.anonymousCount || 0 })}
          </h3>
          
          <div className="space-y-4">
            {onlineData?.anonymousUsers?.map((user: any) => (
              <div key={user.session_id} className="bg-[#1A1A1A] border border-white/5 rounded-lg p-3 sm:p-4 flex items-start gap-3 sm:gap-4">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                  <Globe className="w-4 h-4 sm:w-5 sm:h-5 text-zinc-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-1 sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-zinc-300 text-sm">{t.admin.visitor}</p>
                      <p className="text-[10px] text-zinc-600 font-mono truncate">{user.session_id.substring(0, 8)}...</p>
                    </div>
                    <span className="text-[10px] text-zinc-500 flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" />
                      {new Date(user.last_ping).toLocaleTimeString()}
                    </span>
                  </div>
                  
                  {user.current_movie_title && (
                    <div className="mt-3 p-2 bg-white/5 rounded border border-white/5 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                      <span className="text-[10px] text-zinc-500 shrink-0">{t.admin.watching}</span>
                      <span className="text-xs font-medium text-white truncate">{user.current_movie_title}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {(!onlineData?.anonymousUsers || onlineData.anonymousUsers.length === 0) && (
              <p className="text-zinc-500 text-center py-8 italic text-sm">{t.admin.noVisitorsOnline}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
