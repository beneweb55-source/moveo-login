"use client";
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldOff, AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

function BannedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason');
  const { t } = useLanguage();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col items-center justify-center p-6 text-center">
      <div className="bg-black/40 p-8 md:p-12 rounded-3xl border border-red-500/20 shadow-2xl shadow-red-900/20 max-w-lg w-full backdrop-blur-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 to-red-900" />
        
        <div className="flex justify-center mb-6 relative">
          <div className="absolute inset-0 bg-red-500/20 blur-2xl rounded-full" />
          <ShieldOff className="w-20 h-20 text-red-500 relative z-10" />
        </div>
        
        <h1 className="text-3xl md:text-4xl font-black mb-4 text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-red-300">
          {t.auth.accountBanned || "Compte suspendu définitivement"}
        </h1>
        
        <p className="text-zinc-300 mb-6 text-lg font-medium">
          Votre compte Moveo a été suspendu par un administrateur.
        </p>

        {reason && (
          <div className="bg-red-950/30 border border-red-500/30 p-5 rounded-xl mb-8 text-left relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500" />
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <p className="text-sm text-red-400 font-bold uppercase tracking-wider">{t.auth.banReason || "Raison du bannissement"}</p>
            </div>
            <p className="text-white font-medium text-lg pl-6">{decodeURIComponent(reason)}</p>
          </div>
        )}

        <div className="space-y-4 mb-8">
          <p className="text-red-400/80 text-sm font-semibold flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            {t.auth.permanentBan || "Cette décision est définitive."}
          </p>
          <p className="text-zinc-500 text-sm">
            {t.auth.contactSupport || "Si vous pensez que c'est une erreur, contactez le support."}
          </p>
        </div>

        <button 
          onClick={handleLogout}
          className="w-full px-6 py-4 bg-gradient-to-r from-red-600 to-red-800 rounded-xl font-bold text-white hover:from-red-500 hover:to-red-700 transition-all duration-300 shadow-lg shadow-red-900/30 hover:shadow-red-900/50 hover:-translate-y-0.5 cursor-pointer"
        >
          {t.auth.signOut || "Se déconnecter"}
        </button>
      </div>
    </div>
  );
}

export default function BannedPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center">Loading...</div>}>
      <BannedContent />
    </Suspense>
  );
}
