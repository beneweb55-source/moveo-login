"use client";

import { useState, useEffect } from 'react';
import { Users, Clock, Film, UserPlus, Activity } from 'lucide-react';

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
        <p className="text-zinc-400">Aperçu global de l'activité sur Moveo.</p>
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
              <div key={index} className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-rose-500/20 text-rose-500 flex items-center justify-center font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium text-white">ID: {movie.media_id}</p>
                    <p className="text-sm text-zinc-400 capitalize">{movie.media_type}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-white">{Math.floor(movie.total_minutes / 60)}h</p>
                  <p className="text-xs text-zinc-500">visionnées</p>
                </div>
              </div>
            ))}
            {(!stats.topMovies || stats.topMovies.length === 0) && (
              <p className="text-zinc-500 italic">Aucune donnée disponible.</p>
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
            {Object.entries(stats.usersByRank || {}).map(([rank, count]: any) => (
              <div key={rank} className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
                <span className="font-medium text-white">{rank}</span>
                <span className="bg-white/10 px-3 py-1 rounded-full text-sm font-bold">{count}</span>
              </div>
            ))}
            {Object.keys(stats.usersByRank || {}).length === 0 && (
              <p className="text-zinc-500 italic">Aucune donnée disponible.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
