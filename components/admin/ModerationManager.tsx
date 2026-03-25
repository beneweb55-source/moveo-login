"use client";

import { useState, useEffect, useCallback } from 'react';
import { Flag, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useLanguage } from '@/context/LanguageContext';

export default function ModerationManager() {
  const { t } = useLanguage();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/reports?status=${statusFilter}&page=${page}`);
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports);
        setTotalPages(data.totalPages);
      }
    } catch (error) {
      console.error('Failed to fetch reports', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleUpdateStatus = async (reportId: number, status: string) => {
    try {
      const res = await fetch('/api/admin/reports', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, status })
      });
      if (res.ok) {
        fetchReports();
      } else {
        const data = await res.json();
        showToast(data.error || t.admin.error, 'error');
      }
    } catch (error) {
      console.error('Failed to update report status', error);
      showToast(t.admin.error, 'error');
    }
  };

  if (loading) return <div className="text-zinc-400">{t.admin.loading}</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-1">{t.admin.moderation}</h2>
          <p className="text-zinc-400 text-sm">{t.admin.moderationDescription}</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <button 
            onClick={() => { setStatusFilter('pending'); setPage(1); }}
            className={`flex-1 sm:flex-none px-3 py-2 rounded-lg text-xs font-bold transition-colors ${statusFilter === 'pending' ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30' : 'bg-[#111] text-zinc-400 border border-white/5 hover:bg-white/5'}`}
          >
            {t.admin.pending}
          </button>
          <button 
            onClick={() => { setStatusFilter('resolved'); setPage(1); }}
            className={`flex-1 sm:flex-none px-3 py-2 rounded-lg text-xs font-bold transition-colors ${statusFilter === 'resolved' ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30' : 'bg-[#111] text-zinc-400 border border-white/5 hover:bg-white/5'}`}
          >
            {t.admin.resolvedPlural}
          </button>
          <button 
            onClick={() => { setStatusFilter('rejected'); setPage(1); }}
            className={`flex-1 sm:flex-none px-3 py-2 rounded-lg text-xs font-bold transition-colors ${statusFilter === 'rejected' ? 'bg-red-500/20 text-red-500 border border-red-500/30' : 'bg-[#111] text-zinc-400 border border-white/5 hover:bg-white/5'}`}
          >
            {t.admin.rejectedPlural}
          </button>
        </div>
      </div>

      <div className="bg-[#111] border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-left border-collapse min-w-[600px] lg:min-w-full">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="p-4 font-medium text-zinc-400 text-xs uppercase tracking-wider">{t.admin.date}</th>
                <th className="p-4 font-medium text-zinc-400 text-xs uppercase tracking-wider">{t.admin.reportedBy}</th>
                <th className="p-4 font-medium text-zinc-400 text-xs uppercase tracking-wider">{t.admin.contentType}</th>
                <th className="p-4 font-medium text-zinc-400 text-xs uppercase tracking-wider">{t.admin.reason}</th>
                <th className="p-4 font-medium text-zinc-400 text-xs uppercase tracking-wider text-right">{t.admin.actions}</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="p-4 text-xs text-zinc-400 whitespace-nowrap">
                    {new Date(report.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-4">
                    <p className="font-bold text-white text-sm truncate max-w-[150px]">{report.reporter_name}</p>
                    <p className="text-[10px] text-zinc-500 truncate max-w-[150px]">{report.reporter_email}</p>
                  </td>
                  <td className="p-4">
                    <span className="px-2 py-0.5 bg-white/10 rounded text-[10px] font-bold uppercase tracking-wider text-zinc-300">
                      {report.content_type}
                    </span>
                    <p className="text-[10px] text-zinc-500 mt-1">ID: {report.content_id}</p>
                  </td>
                  <td className="p-4">
                    <p className="text-sm text-white font-medium line-clamp-1">{report.reason}</p>
                    {report.details && <p className="text-[10px] text-zinc-500 mt-0.5 line-clamp-1">{report.details}</p>}
                  </td>
                  <td className="p-4 text-right">
                    {report.status === 'pending' ? (
                      <div className="flex gap-2 justify-end">
                        <button 
                          onClick={() => handleUpdateStatus(report.id, 'resolved')}
                          className="p-2 bg-emerald-500/20 text-emerald-500 rounded-lg hover:bg-emerald-500/30 transition-colors"
                          title={t.admin.markAsResolved}
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleUpdateStatus(report.id, 'rejected')}
                          className="p-2 bg-red-500/20 text-red-500 rounded-lg hover:bg-red-500/30 transition-colors"
                          title={t.admin.rejectReport}
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${report.status === 'resolved' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'}`}>
                        {report.status === 'resolved' ? t.admin.resolved : t.admin.rejected}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {reports.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-zinc-500">
                    <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-zinc-700" />
                    <p className="text-sm font-medium">{t.admin.noReportFound}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="p-4 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button 
              disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="flex-1 sm:flex-none px-4 py-2 bg-white/5 rounded-lg disabled:opacity-50 hover:bg-white/10 transition-colors text-white text-sm font-medium"
            >
              {t.admin.prev}
            </button>
            <button 
              disabled={page === totalPages || totalPages === 0}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="flex-1 sm:flex-none px-4 py-2 bg-white/5 rounded-lg disabled:opacity-50 hover:bg-white/10 transition-colors text-white text-sm font-medium"
            >
              {t.admin.next}
            </button>
          </div>
          <span className="text-xs text-zinc-500 font-medium order-first sm:order-none">
            {t.interpolate(t.admin.pageOf, { page, total: totalPages || 1 })}
          </span>
        </div>
      </div>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <div className={`px-4 py-3 rounded-lg shadow-xl flex items-center gap-3 ${
              toast.type === 'success' ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white'
            }`}>
              <span className="font-medium">{toast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
