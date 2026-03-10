'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldOff } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export default function BannedPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason');
  const { t } = useLanguage();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
      <ShieldOff className="w-24 h-24 text-red-500 mb-8" />
      <h1 className="text-4xl font-bold mb-4">{t.auth.accountSuspended}</h1>
      <p className="text-zinc-400 mb-8 max-w-md">{t.auth.suspendedMessage}</p>
      {reason && (
        <div className="bg-zinc-900 p-4 rounded-lg mb-8 w-full max-w-md">
          <p className="text-sm text-zinc-500 uppercase tracking-wider mb-1">{t.auth.suspensionReason}</p>
          <p className="text-white">{decodeURIComponent(reason)}</p>
        </div>
      )}
      <button 
        onClick={handleLogout}
        className="px-6 py-3 bg-[#E50914] rounded-lg font-bold hover:bg-red-700 transition-colors"
      >
        Se déconnecter
      </button>
    </div>
  );
}
