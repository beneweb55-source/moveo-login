"use client";

import { useState, useEffect } from 'react';
import { 
  Settings, 
  Database, 
  Zap, 
  Trash2, 
  RefreshCw, 
  ShieldCheck, 
  AlertTriangle,
  Server,
  Activity,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { motion, AnimatePresence } from 'motion/react';

export default function SystemManager() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [systemLogs, setSystemLogs] = useState<any[]>([]);
  const [apiStatus, setApiStatus] = useState<Record<string, any>>({});

  const fetchSystemData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/system?action=full');
      if (res.ok) {
        const data = await res.json();
        setApiStatus(data.healthChecks || {});
        setSystemLogs(data.logs || []);
        setMaintenanceMode(data.maintenance?.enabled || false);
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

  const toggleMaintenance = async () => {
    try {
      const res = await fetch('/api/admin/system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_maintenance',
          data: { enabled: !maintenanceMode, message: "Site en maintenance. Nous revenons bientôt." }
        })
      });
      if (res.ok) {
        const data = await res.json();
        setMaintenanceMode(data.maintenance.enabled);
        fetchSystemData(); // Refresh logs
      }
    } catch (error) {
      console.error('Failed to toggle maintenance mode', error);
    }
  };

  const StatusBadge = ({ status }: { status: string }) => {
    switch (status) {
      case 'online':
        return <span className="flex items-center gap-1.5 text-emerald-500 text-xs font-bold uppercase tracking-wider bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3" /> Online
        </span>;
      case 'offline':
        return <span className="flex items-center gap-1.5 text-red-500 text-xs font-bold uppercase tracking-wider bg-red-500/10 px-2 py-1 rounded-full border border-red-500/20">
          <XCircle className="w-3 h-3" /> Offline
        </span>;
      case 'checking':
        return <span className="flex items-center gap-1.5 text-zinc-500 text-xs font-bold uppercase tracking-wider bg-zinc-500/10 px-2 py-1 rounded-full border border-zinc-500/20">
          <RefreshCw className="w-3 h-3 animate-spin" /> Checking
        </span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tighter flex items-center gap-3">
            <Settings className="w-8 h-8 text-red-600" />
            PANEL <span className="text-red-600">SPÉCIAL</span>
          </h2>
          <p className="text-zinc-400 mt-1">Outils avancés et maintenance du système.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchSystemData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-all border border-white/5 font-bold text-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
          
          <button 
            onClick={toggleMaintenance}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all border font-bold text-sm ${
              maintenanceMode 
              ? 'bg-red-600 border-red-500 text-white shadow-[0_0_20px_rgba(220,38,38,0.3)]' 
              : 'bg-zinc-800 border-white/5 text-zinc-400 hover:text-white'
            }`}
          >
            <Zap className={`w-4 h-4 ${maintenanceMode ? 'fill-current' : ''}`} />
            {maintenanceMode ? 'Mode Maintenance: ON' : 'Mode Maintenance: OFF'}
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
              État des Services
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Object.entries(apiStatus).map(([service, info]: [string, any]) => (
                <div key={service} className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${info.status === 'online' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                      {service === 'tmdb' ? <Film className="w-4 h-4" /> : 
                       service === 'auth' ? <ShieldCheck className="w-4 h-4" /> :
                       service === 'database' ? <Database className="w-4 h-4" /> :
                       <Zap className="w-4 h-4" />}
                    </div>
                    <div>
                      <span className="text-sm font-bold text-white capitalize block">{service}</span>
                      {info.latency && <span className="text-[10px] text-zinc-500 block">{info.latency}ms</span>}
                      {info.error && <span className="text-[10px] text-red-400 line-clamp-1 max-w-[120px]">{info.error}</span>}
                    </div>
                  </div>
                  <StatusBadge status={info.status || 'offline'} />
                </div>
              ))}
              {Object.keys(apiStatus).length === 0 && !loading && (
                <div className="text-sm text-zinc-500 col-span-2 text-center py-4">Aucune donnée de service.</div>
              )}
            </div>
          </div>

          {/* System Logs */}
          <div className="bg-[#111] border border-white/10 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" />
              Journaux d&apos;Activité Récents
            </h3>
            
            <div className="space-y-3">
              {systemLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-all group">
                  <div className="flex items-center gap-4">
                    <div className={`w-2 h-2 rounded-full ${log.status === 'success' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <div>
                      <p className="text-sm font-bold text-white">{log.action}</p>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                        Par {log.admin_name} • {new Date(log.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {systemLogs.length === 0 && !loading && (
                <div className="text-sm text-zinc-500 text-center py-4">Aucun journal trouvé.</div>
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions & Info */}
        <div className="space-y-6">
          <div className="bg-[#111] border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-500/10 text-amber-500 rounded-lg">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white">Alertes Système</h3>
            </div>
            
            {Object.values(apiStatus).some((s: any) => s.status !== 'online') ? (
               <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                 <p className="text-xs text-red-500 font-bold flex items-center gap-2">
                   <XCircle className="w-3 h-3" /> Certains services sont hors ligne !
                 </p>
               </div>
            ) : (
               <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                 <p className="text-xs text-emerald-500 font-bold flex items-center gap-2">
                   <CheckCircle2 className="w-3 h-3" /> Tout est en ordre
                 </p>
               </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Film(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M7 3v18" />
      <path d="M17 3v18" />
      <path d="M3 7h4" />
      <path d="M3 12h4" />
      <path d="M3 17h4" />
      <path d="M17 7h4" />
      <path d="M17 12h4" />
      <path d="M17 17h4" />
    </svg>
  )
}
