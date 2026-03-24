"use client";

import { Suspense, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/context/LanguageContext';

function VerifyEmailContent() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { t } = useLanguage();

  const calledRef = useRef(false);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Invalid or missing verification token.');
      return;
    }

    if (calledRef.current) return;
    calledRef.current = true;

    const verifyEmail = async () => {
      try {
        const res = await fetch(`/api/auth/verify-email?token=${token}`);
        if (res.ok) {
          setStatus('success');
          setMessage('Email verified successfully! You can now log in.');
        } else {
          const data = await res.json();
          setStatus('error');
          setMessage(data.error || 'Failed to verify email.');
        }
      } catch (error) {
        setStatus('error');
        setMessage('An unexpected error occurred.');
      }
    };

    verifyEmail();
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4 py-12 sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/40" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent via-black/40 to-black" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md rounded-2xl bg-black/40 p-8 shadow-2xl backdrop-blur-xl border border-white/10 text-center"
      >
        <div className="mb-6">
          <Link href="/" className="inline-block">
            <h1 className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500 mb-2">
              MOVEO
            </h1>
          </Link>
        </div>

        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-red-500" />
            <p className="text-lg font-medium text-white">Verifying your email...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center justify-center space-y-4">
            <CheckCircle className="h-16 w-16 text-green-500" />
            <h2 className="text-2xl font-bold text-white">Verification Successful!</h2>
            <p className="text-gray-400">{message}</p>
            <Link
              href="/login"
              className="mt-6 inline-flex w-full justify-center rounded-xl bg-gradient-to-r from-red-600 to-orange-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:from-red-500 hover:to-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
            >
              {t.auth.signIn}
            </Link>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center justify-center space-y-4">
            <XCircle className="h-16 w-16 text-red-500" />
            <h2 className="text-2xl font-bold text-white">Verification Failed</h2>
            <p className="text-gray-400">{message}</p>
            <Link
              href="/login"
              className="mt-6 inline-flex w-full justify-center rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Back to Login
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-black"><Loader2 className="h-12 w-12 animate-spin text-red-500" /></div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
