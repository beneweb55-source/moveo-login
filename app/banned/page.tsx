'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

function BannedContent() {
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason');
  const { t } = useLanguage();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
      router.push('/login');
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-zinc-900/50 border border-red-500/20 rounded-2xl p-8 text-center">
        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShieldAlert className="w-10 h-10 text-red-500" />
        </div>
        
        <h1 className="text-2xl font-bold text-white mb-4">
          {t.auth.accountSuspended}
        </h1>
        
        <p className="text-zinc-400 mb-6">
          {t.auth.suspendedMessage}
        </p>
        
        {reason && (
          <div className="bg-black/50 rounded-lg p-4 mb-8 border border-white/5">
            <p className="text-sm text-zinc-500 mb-1 uppercase tracking-wider font-semibold">
              {t.auth.suspensionReason}
            </p>
            <p className="text-white font-medium">
              {reason}
            </p>
          </div>
        )}
        
        <div className="flex flex-col gap-3">
          <button 
            onClick={handleLogout}
            className="w-full py-3 px-4 bg-[#E50914] hover:bg-[#b80710] text-white rounded-lg font-medium transition-colors"
          >
            {t.nav.logout}
          </button>
          
          <button 
            className="w-full py-3 px-4 bg-white/5 hover:bg-white/10 text-white rounded-lg font-medium transition-colors"
          >
            {t.auth.contactSupport}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BannedPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <BannedContent />
    </Suspense>
  );
}
