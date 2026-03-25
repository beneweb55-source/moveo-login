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
  const [loading, setLoading] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [systemLogs, setSystemLogs] = useState<any[]>([]);
  const [apiStatus, setApiStatus] = useState({
    tmdb: 'checking',
    auth: 'online',
    database: 'online',
    storage: 'online'
  });

  useEffect(() => {
    // Simulate fetching system logs
    const mockLogs = [
      { id: 1, action: 'User Ban', admin: 'Admin', time: '2 mins ago', status: 'success' },
      { id: 2, action: 'Role Update', admin: 'Moderator', time: '15 mins ago', status: 'success' },
      { id: 3, action: 'Content Pin', admin: 'Admin', time: '1 hour ago', status: 'success' },
      { id: 4, action: 'System Backup', admin: 'System', time: '3 hours ago', status: 'success' },
      { id: 5, action: 'Failed Login', admin: 'Unknown', time: '5 hours ago', status: 'warning' },
    ];
    setSystemLogs(mockLogs);

    // Simulate API health check
    const checkApi = async () => {
      try {
        const res = await fetch('/api/tmdb-proxy?endpoint=trending/all/day');
        if (res.ok) {
          setApiStatus(prev => ({ ...prev, tmdb: 'online' }));
        } else {
          setApiStatus(prev => ({ ...prev, tmdb: 'offline' }));
        }
      } catch (error) {
        setApiStatus(prev => ({ ...prev, tmdb: 'offline' }));
      }
    };
    checkApi();
  }, []);

  const handleClearCache = async () => {
    setLoading(true);
    // Simulate cache clearing
    await new Promise(resolve => setTimeout(resolve, 1500));
    setLoading(false);
    alert('Cache système vidé avec succès !');
  };

  const toggleMaintenance = () => {
    setMaintenanceMode(!maintenanceMode);
    // In a real app, this would update a global setting in Firestore
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
            onClick={handleClearCache}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-all border border-white/5 font-bold text-sm disabled:opacity-50"
          >
            <Trash2 className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Vider le Cache
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
              {Object.entries(apiStatus).map(([service, status]) => (
                <div key={service} className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${status === 'online' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                      {service === 'tmdb' ? <Film className="w-4 h-4" /> : 
                       service === 'auth' ? <ShieldCheck className="w-4 h-4" /> :
                       service === 'database' ? <Database className="w-4 h-4" /> :
                       <Zap className="w-4 h-4" />}
                    </div>
                    <span className="text-sm font-bold text-white capitalize">{service} API</span>
                  </div>
                  <StatusBadge status={status} />
                </div>
              ))}
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
                        Par {log.admin} • {log.time}
                      </p>
                    </div>
                  </div>
                  <button className="text-zinc-600 hover:text-white transition-colors opacity-0 group-hover:opacity-100">
                    Détails
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Actions & Info */}
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-red-600 to-rose-700 rounded-2xl p-6 text-white shadow-xl shadow-red-900/20 relative overflow-hidden">
            <div className="absolute -bottom-4 -right-4 opacity-10">
              <Zap className="w-32 h-32" />
            </div>
            <h3 className="text-xl font-black mb-2 tracking-tight">ACTIONS RAPIDES</h3>
            <p className="text-white/80 text-sm mb-6">Exécutez des tâches critiques en un clic.</p>
            
            <div className="space-y-3">
              <button className="w-full flex items-center justify-between p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all border border-white/10 group">
                <span className="text-sm font-bold">Sauvegarde DB</span>
                <Database className="w-4 h-4 group-hover:scale-110 transition-transform" />
              </button>
              <button className="w-full flex items-center justify-between p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all border border-white/10 group">
                <span className="text-sm font-bold">Recharger Config</span>
                <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
              </button>
              <button className="w-full flex items-center justify-between p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all border border-white/10 group">
                <span className="text-sm font-bold">Vérifier Intégrité</span>
                <ShieldCheck className="w-4 h-4 group-hover:scale-110 transition-transform" />
              </button>
            </div>
          </div>

          <div className="bg-[#111] border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-500/10 text-amber-500 rounded-lg">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white">Alertes Système</h3>
            </div>
            <p className="text-sm text-zinc-400 mb-4">Aucune alerte critique détectée. Le système fonctionne normalement.</p>
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <p className="text-xs text-emerald-500 font-bold flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3" /> Tout est en ordre
              </p>
            </div>
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
