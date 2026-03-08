"use client";

import { useState, useEffect } from 'react';
import { Users, Clock, Film, UserPlus, Activity, Eye } from 'lucide-react';
import { RANKS } from '@/utils/ranks';

export default function Dashboard() {
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

  if (loading) return <div className="text-zinc-400">Chargement des statistiques...</div>;
  if (!stats) return <div className="text-red-400">Erreur lors du chargement des statistiques.</div>;

  const StatCard = ({ title, value, icon: Icon, color }: any) => (
    <div className="bg-[#111] border border-white/10 rounded-xl p-6 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <h3 className="text-zinc-400 text-sm font-medium uppercase tracking-wider">{title}</h3>
        <p className="text-3xl font-bold text-white">{value}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Dashboard</h2>
        <p className="text-zinc-400">Aperçu global de l&apos;activité sur Moveo.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Utilisateurs Inscrits" value={stats.totalUsers} icon={Users} color="bg-blue-500/20 text-blue-500" />
        <StatCard title="Temps de Visionnage" value={`${Math.floor(stats.totalWatchTime / 60)}h`} icon={Clock} color="bg-purple-500/20 text-purple-500" />
        <StatCard title="Nouveaux Inscrits (7j)" value={stats.newUsersThisWeek} icon={UserPlus} color="bg-emerald-500/20 text-emerald-500" />
        <StatCard title="Films Regardés" value={stats.topMovies?.length || 0} icon={Film} color="bg-rose-500/20 text-rose-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Movies */}
        <div className="bg-[#111] border border-white/10 rounded-xl p-6">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Film className="w-5 h-5 text-rose-500" />
            Top 5 Films les plus regardés
          </h3>
          <div className="space-y-4">
            {stats.topMovies?.map((movie: any, index: number) => (
              <div key={index} className="flex items-center justify-between p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-rose-500/20 text-rose-500 flex items-center justify-center font-bold shrink-0">
                    {index + 1}
                  </div>
                  {movie.poster_path ? (
                    <img 
                      src={`https://image.tmdb.org/t/p/w92${movie.poster_path}`} 
                      alt={movie.title} 
                      className="w-12 h-18 object-cover rounded shadow-lg" 
                    />
                  ) : (
                    <div className="w-12 h-18 bg-zinc-800 rounded flex items-center justify-center text-[10px] text-zinc-500 text-center p-1">
                      No Img
                    </div>
                  )}
                  <div>
                    <p className="font-bold text-white text-lg leading-tight">{movie.title}</p>
                    <p className="text-xs text-zinc-400 line-clamp-2 max-w-md mt-1 italic">
                      {movie.overview}
                    </p>
                    <p className="text-xs text-rose-400 mt-2 flex items-center gap-1 font-medium">
                       <Eye className="w-3 h-3" /> {movie.viewer_count || 0} personnes l'ont regardé
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="font-bold text-white text-xl">{Math.floor(movie.total_minutes / 60)}h</p>
                  <p className="text-xs text-zinc-500">visionnées</p>
                </div>
              </div>
            ))}
            {(!stats.topMovies || stats.topMovies.length === 0) && (
              <p className="text-zinc-500 italic text-center py-8">Aucune donnée disponible.</p>
            )}
          </div>
        </div>

        {/* Users by Rank */}
        <div className="bg-[#111] border border-white/10 rounded-xl p-6">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-500" />
            Répartition par Rang
          </h3>
          <div className="space-y-4">
            {Object.entries(stats.usersByRank || {}).map(([rank, count]: [string, any]) => {
               const rankObj = RANKS.find(r => r.name === rank);
               if (!rankObj) return null;
               const RankIcon = rankObj.icon;

               return (
                <div key={rank} className="flex items-center justify-between p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
                  <div 
                    className="flex items-center gap-2 px-3 py-1 rounded-full w-fit shadow-sm" 
                    style={{ 
                      backgroundColor: `${rankObj.color}1A`, 
                      color: rankObj.color,
                      boxShadow: `0 0 10px ${rankObj.color}33`
                    }}
                  >
                    <RankIcon className="w-3 h-3" style={{ color: rankObj.color }} />
                    <span className="text-[10px] font-bold uppercase tracking-widest leading-none">
                      {rankObj.name}
                    </span>
                  </div>
                  <span className="bg-white/10 px-3 py-1 rounded-full text-sm font-bold text-white">{count}</span>
                </div>
              );
            })}
            {Object.keys(stats.usersByRank || {}).length === 0 && (
              <p className="text-zinc-500 italic">Aucune donnée disponible.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
