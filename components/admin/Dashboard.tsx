"use client";

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { Users, Clock, Film, UserPlus, Activity, Eye, RefreshCw, ShieldAlert, AlertTriangle } from 'lucide-react';
import { RANKS } from '@/utils/ranks';
import { useLanguage } from '@/context/LanguageContext';
import { formatWatchTime } from '@/utils/formatDuration';

/**
 * The shape `GET /api/admin/stats` returns, checked before it is rendered.
 *
 * WHY THE CHECK AND NOT `data as any`. The component used to store whatever came
 * back and read fields off it, so the day a field is renamed on the server the
 * card prints `undefined` — a displayed value that is not a value, quietly, with
 * no error anywhere. This is not hypothetical: the same change that renames
 * `totalMoviesWatched` to `totalTitlesWatched` is the one adding this check,
 * precisely because the two sides are only connected by a string.
 *
 * A payload that fails the check is an ERROR STATE, not an empty dashboard. The
 * alternative — defaulting each field to 0 — would render a screen full of zeros
 * that looks like "nobody has watched anything", which is the confident wrong
 * answer §3 forbids.
 */
type StatsPayload = {
  totalUsers: number;
  totalWatchTime: number;
  adjustedWatchTime: number;
  totalTitlesWatched: number;
  topMovies: Array<{
    media_id: number;
    media_type: string;
    total_minutes: number;
    viewer_count: number;
    title: string;
    poster_path: string | null;
    overview: string;
  }>;
  newUsersThisWeek: number;
  usersByRank: Record<string, number>;
};

const isStatsPayload = (value: unknown): value is StatsPayload => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.totalUsers === 'number' &&
    typeof candidate.totalWatchTime === 'number' &&
    typeof candidate.adjustedWatchTime === 'number' &&
    typeof candidate.totalTitlesWatched === 'number' &&
    typeof candidate.newUsersThisWeek === 'number' &&
    Array.isArray(candidate.topMovies) &&
    !!candidate.usersByRank &&
    typeof candidate.usersByRank === 'object'
  );
};

/**
 * What went wrong, in the two kinds that need different words.
 *
 * `forbidden` is a 401/403: the request was understood and refused, and trying
 * again will be refused again — the admin needs to know it is a permission, not
 * a glitch. `unavailable` is everything else (5xx, a dropped connection, a
 * payload that did not match): the server did not answer correctly, and retrying
 * is exactly what might work.
 *
 * Both used to render as the same generic `t.admin.error`, so an admin whose role
 * lacked `view_stats` saw a screen that looked like a crash.
 */
type StatsError = 'forbidden' | 'unavailable';

export default function Dashboard() {
  const { t } = useLanguage();
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [error, setError] = useState<StatsError | null>(null);
  const [loading, setLoading] = useState(true);

  // Bumping this re-runs the effect below. It is a plain counter rather than a
  // "reload" boolean because two retries in a row must both run: a boolean
  // toggled to the same value is not a change and the effect would not re-run.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // A response that lands after this effect was torn down must not set state:
    // the retry button makes overlapping requests possible, and without this the
    // SLOWER of two answers wins, which is how a stale error overwrites a fresh
    // success.
    let cancelled = false;

    const fetchStats = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/admin/stats');
        if (cancelled) return;

        if (res.status === 401 || res.status === 403) {
          setStats(null);
          setError('forbidden');
          return;
        }
        if (!res.ok) {
          setStats(null);
          setError('unavailable');
          return;
        }

        const data = await res.json();
        if (cancelled) return;

        if (!isStatsPayload(data)) {
          // Worth a log line: this is the signal that the route and this
          // component have drifted apart.
          console.error('[admin/dashboard] unexpected /api/admin/stats payload', data);
          setStats(null);
          setError('unavailable');
          return;
        }

        setStats(data);
      } catch (fetchError) {
        if (cancelled) return;
        console.error('Failed to fetch stats', fetchError);
        setStats(null);
        setError('unavailable');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchStats();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((previous) => previous + 1), []);

  // ─── THE STATES, AND THEY ARE DISTINCT ────────────────────────────────────
  //
  // Loading, refused, broken. The old code had one: `if (!stats)` rendered the
  // generic error, which conflated "the request is still in flight" with "you
  // are not allowed" with "the database is down".
  if (loading) return <div className="text-zinc-400">{t.admin.loading}</div>;

  if (error === 'forbidden') {
    return (
      <div className="bg-[#111] border border-amber-500/20 rounded-xl p-6 sm:p-8 flex items-start gap-4">
        <ShieldAlert className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-white font-bold mb-1">{t.admin.unauthorized}</h3>
          <p className="text-sm text-zinc-400">{t.admin.dashboardPermissionDenied}</p>
        </div>
      </div>
    );
  }

  if (error === 'unavailable' || !stats) {
    return (
      <div className="bg-[#111] border border-red-500/20 rounded-xl p-6 sm:p-8 flex items-start gap-4">
        <AlertTriangle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h3 className="text-white font-bold mb-1">{t.admin.error}</h3>
          <p className="text-sm text-zinc-400 mb-4">{t.admin.statsUnavailable}</p>
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium text-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            {t.admin.retry}
          </button>
        </div>
      </div>
    );
  }

  const StatCard = ({ title, value, icon: Icon, color, note }: any) => (
    <div className="bg-[#111] border border-white/10 rounded-xl p-4 sm:p-6 flex items-center gap-4">
      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
      </div>
      <div className="min-w-0">
        <h3 className="text-zinc-400 text-[10px] sm:text-sm font-medium uppercase tracking-wider truncate">{title}</h3>
        <p className="text-xl sm:text-3xl font-bold text-white truncate">{value}</p>
        {note && <p className="text-[10px] sm:text-xs text-zinc-500 mt-0.5">{note}</p>}
      </div>
    </div>
  );

  // Shown only when there IS a credit to declare. A permanent "Manual credits
  // excluded (0min)" is noise that trains the reader to skip the line, so it
  // appears exactly when it carries information.
  const creditNote =
    stats.adjustedWatchTime > 0
      ? t.interpolate(t.admin.manualCreditsExcluded, { minutes: formatWatchTime(stats.adjustedWatchTime) })
      : undefined;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">{t.admin.dashboard}</h2>
        <p className="text-sm text-zinc-400">{t.admin.dashboardDescription}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <StatCard title={t.admin.totalUsers} value={stats.totalUsers} icon={Users} color="bg-blue-500/20 text-blue-500" />
        <StatCard title={t.admin.totalWatchTime} value={formatWatchTime(stats.totalWatchTime)} icon={Clock} color="bg-purple-500/20 text-purple-500" note={creditNote} />
        <StatCard title={t.admin.newUsers} value={stats.newUsersThisWeek} icon={UserPlus} color="bg-emerald-500/20 text-emerald-500" />
        <StatCard title={t.admin.titlesWatched} value={stats.totalTitlesWatched} icon={Film} color="bg-rose-500/20 text-rose-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
        {/* Top Movies */}
        <div className="bg-[#111] border border-white/10 rounded-xl p-4 sm:p-6">
          <h3 className="text-lg sm:text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Film className="w-5 h-5 text-rose-500" />
            {t.admin.topMovies}
          </h3>
          <div className="space-y-3 sm:space-y-4">
            {stats.topMovies.map((movie, index: number) => (
              <div key={`${movie.media_type}:${movie.media_id}`} className="flex items-center justify-between p-3 sm:p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
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
                  <p className="font-bold text-white text-sm sm:text-xl">{formatWatchTime(movie.total_minutes || 0)}</p>
                  <p className="text-[10px] sm:text-xs text-zinc-500">{t.admin.hoursWatched}</p>
                </div>
              </div>
            ))}
            {stats.topMovies.length === 0 && (
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
            {Object.entries(stats.usersByRank).map(([rank, count]: [string, any]) => {
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
            {Object.keys(stats.usersByRank).length === 0 && (
              <p className="text-zinc-500 italic">{t.admin.noData}.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
