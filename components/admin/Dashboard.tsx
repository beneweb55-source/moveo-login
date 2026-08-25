"use client";

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Users, Clock, Film, UserPlus, Activity, Eye } from 'lucide-react';
import { RANKS } from '@/utils/ranks';
import { useLanguage } from '@/context/LanguageContext';

export default function Dashboard() {
  const { t } = useLanguage();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/admin/stats');
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Failed to fetch stats', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) return <div className="text-zinc-400">{t.admin.loading}</div>;
  if (!stats) return <div className="text-red-400">{t.admin.error}</div>;

  const formatMinutes = (minutes: number) => {
    if (minutes < 60) return `${minutes}min`;
    if (minutes % 60 === 0) return `${minutes / 60}h`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
  };

  const StatCard = ({ title, value, icon: Icon, color }: any) => (
    <div className="bg-[#111] border border-white/10 rounded-xl p-4 sm:p-6 flex items-center gap-4">
      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
      </div>
      <div className="min-w-0">
        <h3 className="text-zinc-400 text-[10px] sm:text-sm font-medium uppercase tracking-wider truncate">{title}</h3>
        <p className="text-xl sm:text-3xl font-bold text-white truncate">{value}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">{t.admin.dashboard}</h2>
        <p className="text-sm text-zinc-400">Aperçu global de l&apos;activité sur Moveo.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <StatCard title={t.admin.totalUsers} value={stats.totalUsers} icon={Users} color="bg-blue-500/20 text-blue-500" />
        <StatCard title={t.admin.totalWatchTime} value={formatMinutes(stats.totalWatchTime || 0)} icon={Clock} color="bg-purple-500/20 text-purple-500" />
        <StatCard title={t.admin.newUsers} value={stats.newUsersThisWeek} icon={UserPlus} color="bg-emerald-500/20 text-emerald-500" />
        <StatCard title={t.admin.moviesWatched} value={stats.totalMoviesWatched || 0} icon={Film} color="bg-rose-500/20 text-rose-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
        {/* Top Movies */}
        <div className="bg-[#111] border border-white/10 rounded-xl p-4 sm:p-6">
          <h3 className="text-lg sm:text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Film className="w-5 h-5 text-rose-500" />
            {t.admin.topMovies}
          </h3>
          <div className="space-y-3 sm:space-y-4">
            {stats.topMovies?.map((movie: any, index: number) => (
              <div key={index} className="flex items-center justify-between p-3 sm:p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-rose-500/20 text-rose-500 flex items-center justify-center text-xs sm:text-sm font-bold shrink-0">
                    {index + 1}
                  </div>
                  {movie.poster_path ? (
                    <div className="relative w-10 h-14 sm:w-12 sm:h-18 shrink-0">
                      <Image 
                        src={`https://image.tmdb.org/t/p/w92${movie.poster_path}`} 
                        alt={movie.title} 
                        fill
                        className="object-cover rounded shadow-lg" 
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ) : (
                    <div className="w-10 h-14 sm:w-12 sm:h-18 bg-zinc-800 rounded flex items-center justify-center text-[8px] sm:text-[10px] text-zinc-500 text-center p-1 shrink-0">
                      No Img
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-bold text-white text-sm sm:text-lg leading-tight truncate">{movie.title}</p>
                    <p className="text-[10px] sm:text-xs text-zinc-400 line-clamp-1 sm:line-clamp-2 max-w-md mt-0.5 sm:mt-1 italic">
                      {movie.overview}
                    </p>
                    <p className="text-[10px] sm:text-xs text-rose-400 mt-1 sm:mt-2 flex items-center gap-1 font-medium">
                       <Eye className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> {movie.viewer_count || 0} {t.admin.peopleWatched}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2 sm:ml-4">
                  <p className="font-bold text-white text-sm sm:text-xl">{formatMinutes(movie.total_minutes || 0)}</p>
                  <p className="text-[10px] sm:text-xs text-zinc-500">{t.admin.hoursWatched}</p>
                </div>
              </div>
            ))}
            {(!stats.topMovies || stats.topMovies.length === 0) && (
              <p className="text-zinc-500 italic text-center py-8">{t.admin.noData}.</p>
            )}
          </div>
        </div>

        {/* Users by Rank */}
        <div className="bg-[#111] border border-white/10 rounded-xl p-4 sm:p-6">
          <h3 className="text-lg sm:text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-500" />
            {t.admin.rankDistribution}
          </h3>
          <div className="space-y-3 sm:space-y-4">
            {Object.entries(stats.usersByRank || {}).map(([rank, count]: [string, any]) => {
               const rankObj = RANKS.find(r => r.name === rank);
               if (!rankObj) return null;
               const RankIcon = rankObj.icon;

               return (
                <div key={rank} className="flex items-center justify-between p-3 sm:p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
                  <div 
                    className="flex items-center gap-2 px-2 sm:px-3 py-1 rounded-full w-fit shadow-sm" 
                    style={{ 
                      backgroundColor: `${rankObj.color}1A`, 
                      color: rankObj.color,
                      boxShadow: `0 0 10px ${rankObj.color}33`
                    }}
                  >
                    <RankIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3" style={{ color: rankObj.color }} />
                    <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest leading-none">
                      {rankObj.name}
                    </span>
                  </div>
                  <span className="bg-white/10 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-bold text-white">{count}</span>
                </div>
              );
            })}
            {Object.keys(stats.usersByRank || {}).length === 0 && (
              <p className="text-zinc-500 italic">{t.admin.noData}.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
