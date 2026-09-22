"use client";

import { useState, useEffect } from 'react';
import {
  Settings,
  Database,
  Zap,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Server,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Film,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

/**
 * System panel: the status of the services Moveo depends on, plus the admin
 * action log.
 *
 * WHAT CHANGED, AND WHY EACH CHANGE WAS NECESSARY
 *
 * 1. The maintenance-mode toggle is gone. `POST /api/admin/system` had exactly
 *    one action — writing `maintenance_mode` into `content_settings` — and
 *    nothing in the application ever read that value back. The button displayed
 *    "Mode Maintenance: ON" over a change that altered no behaviour, which is
 *    the worst kind of control: during an incident an operator would have
 *    reached for it and been told the site was down while it stayed up. It is
 *    removed rather than implemented because gating the site needs middleware,
 *    an exemption list and a recovery path, and none of that can be tested from
 *    this checkout — §26 says an unreliable function does not get activated, and
 *    a maintenance mode that is not enforced is not "half done", it is false.
 *    See the audit report for what a real one requires.
 *
 * 2. "No data" no longer renders as "All good". The alert box tested
 *    `Object.values(apiStatus).some(s => s.status !== 'online')`, and `some` on an
 *    empty object returns `false` — so a panel that had received no health data
 *    at all displayed the green "Tout est en ordre". Absence of evidence was
 *    being rendered as evidence of health. There are now four distinct states and
 *    each one says only what is known: not yet loaded, loaded but empty, at least
 *    one service offline (naming them), or all responding.
 *
 * 3. "Could not read the log" is no longer shown as "no log entries". The API now
 *    reports a read failure separately, and the panel renders it as a failure,
 *    with the reason, instead of as an empty history.
 *
 * 4. The service rows say what they measured. `auth` was a fabricated row: the
 *    API's `try` block contained no failing operation, so it read "online" even
 *    on a deployment where no one could sign in. It is now `session_signing`, a
 *    real check of whether the JWT secret resolves, and the name says so. Labels
 *    are derived from the key (`session_signing` → "Session signing") rather
 *    than showing an operator a lowercase variable name.
 *
 * 5. Every string is translated. The component was French-only inside a panel the
 *    rest of the site presents in the visitor's chosen language, so an
 *    English-speaking admin saw "PANEL SPÉCIAL" and "Journaux d'Activité
 *    Récents". It now uses the same `t.admin.*` keys as every other manager.
 *
 * The log rows also carry their target when they have one — "watch_time_adjustment"
 * on its own does not tell an admin which account was adjusted, which made the log
 * something to look at rather than something to act on.
 */

export default function SystemManager() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [systemLogs, setSystemLogs] = useState<any[]>([]);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<Record<string, any>>({});

  const fetchSystemData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/system?action=full');
      if (res.ok) {
        const data = await res.json();
        setApiStatus(data.healthChecks || {});
        setSystemLogs(Array.isArray(data.logs) ? data.logs : []);
        setLogsError(typeof data.logsError === 'string' ? data.logsError : null);
      }
    } catch (error) {
      console.error('Failed to fetch system data', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSystemData();
  }, []);

  const StatusBadge = ({ status }: { status: string }) => {
    switch (status) {
      case 'online':
        return <span className="flex items-center gap-1.5 text-emerald-500 text-xs font-bold uppercase tracking-wider bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3" /> {t.admin.statusOnline}
        </span>;
      case 'offline':
        return <span className="flex items-center gap-1.5 text-red-500 text-xs font-bold uppercase tracking-wider bg-red-500/10 px-2 py-1 rounded-full border border-red-500/20">
          <XCircle className="w-3 h-3" /> {t.admin.statusOffline}
        </span>;
      case 'checking':
      default:
        return <span className="flex items-center gap-1.5 text-zinc-500 text-xs font-bold uppercase tracking-wider bg-zinc-500/10 px-2 py-1 rounded-full border border-zinc-500/20">
          <RefreshCw className="w-3 h-3 animate-spin" /> {t.admin.systemChecking}
        </span>;
    }
  };

  const ServiceIcon = ({ service }: { service: string }) => {
    if (service === 'tmdb') return <Film className="w-4 h-4" />;
    if (service === 'session_signing') return <ShieldCheck className="w-4 h-4" />;
    if (service === 'database') return <Database className="w-4 h-4" />;
    return <Zap className="w-4 h-4" />;
  };

  const services = Object.entries(apiStatus) as [string, any][];
  const offlineServices = services.filter(([, info]) => info?.status !== 'online');

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tighter flex items-center gap-3">
            <Settings className="w-8 h-8 text-red-600" />
            {t.admin.systemTitle}
          </h2>
          <p className="text-zinc-400 mt-1">{t.admin.systemDescription}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchSystemData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-all border border-white/5 font-bold text-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {t.admin.systemRefresh}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* API & Services Status */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#111] border border-white/10 rounded-2xl p-6 overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity pointer-events-none">
              <Activity className="w-32 h-32" />
            </div>

            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <Server className="w-5 h-5 text-red-500" />
              {t.admin.systemStatus}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {services.map(([service, info]) => (
                <div key={service} className="flex items-center justify-between gap-3 p-4 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-lg shrink-0 ${info.status === 'online' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                      <ServiceIcon service={service} />
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-bold text-white block capitalize">{service.replace(/_/g, ' ')}</span>
                      {typeof info.latency === 'number' && <span className="text-[10px] text-zinc-500 block">{info.latency}ms</span>}
                      {info.error && <span className="text-[10px] text-red-400 block break-words">{info.error}</span>}
                    </div>
                  </div>
                  <StatusBadge status={info.status || 'offline'} />
                </div>
              ))}
              {services.length === 0 && loading && (
                <div className="text-sm text-zinc-500 col-span-2 text-center py-4 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" /> {t.admin.systemChecking}
                </div>
              )}
              {services.length === 0 && !loading && (
                <div className="text-sm text-zinc-500 col-span-2 text-center py-4">{t.admin.systemNoServices}</div>
              )}
            </div>
          </div>

          {/* System Logs */}
          <div className="bg-[#111] border border-white/10 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" />
              {t.admin.systemActivity}
            </h3>

            <div className="space-y-3">
              {systemLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-all group">
                  <div className="flex items-center gap-4">
                    <div className={`w-2 h-2 rounded-full ${log.status === 'success' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <div>
                      <p className="text-sm font-bold text-white">
                        {log.action}
                        {log.target_type && log.target_id ? (
                          <span className="text-zinc-500 font-normal"> · {log.target_type} #{log.target_id}</span>
                        ) : null}
                      </p>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                        {t.admin.logBy} {log.admin_name} • {new Date(log.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {systemLogs.length === 0 && !loading && !logsError && (
                <div className="text-sm text-zinc-500 text-center py-4">{t.admin.systemNoLogs}</div>
              )}
              {logsError && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <p className="text-xs text-amber-500 font-bold flex items-center gap-2">
                    <AlertTriangle className="w-3 h-3 shrink-0" /> {t.admin.systemLogsUnavailable}
                  </p>
                  <p className="text-[10px] text-amber-500/80 break-words mt-1">{logsError}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Alerts */}
        <div className="space-y-6">
          <div className="bg-[#111] border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-500/10 text-amber-500 rounded-lg">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white">{t.admin.systemAlerts}</h3>
            </div>

            {services.length === 0 ? (
              <div className="p-3 bg-white/5 border border-white/10 rounded-xl">
                <p className="text-xs text-zinc-400 font-bold flex items-center gap-2">
                  <AlertTriangle className="w-3 h-3 shrink-0" /> {loading ? t.admin.systemChecking : t.admin.systemNoServices}
                </p>
              </div>
            ) : offlineServices.length > 0 ? (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-xs text-red-500 font-bold flex items-center gap-2">
                  <XCircle className="w-3 h-3 shrink-0" /> {t.admin.systemSomeOffline}
                </p>
                <p className="text-[10px] text-red-400/90 mt-1 capitalize">
                  {offlineServices.map(([name]) => name.replace(/_/g, ' ')).join(', ')}
                </p>
              </div>
            ) : (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <p className="text-xs text-emerald-500 font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3 shrink-0" /> {t.admin.systemAllOnline}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
