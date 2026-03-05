'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'motion/react';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(token ? 'loading' : 'error');
  const [message, setMessage] = useState(token ? '' : 'Invalid or missing verification token.');

  useEffect(() => {
    if (!token) {
      return;
    }

    const verifyEmail = async () => {
      try {
        const res = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (res.ok) {
          setStatus('success');
          setMessage(data.message || 'Your email has been successfully verified!');
        } else {
          setStatus('error');
          setMessage(data.error || 'Failed to verify email.');
        }
      } catch (error) {
        setStatus('error');
        setMessage('An error occurred during verification. Please try again.');
      }
    };

    verifyEmail();
  }, [token]);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-black px-4 py-12 sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/40" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent via-black/40 to-black" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative w-full max-w-md"
      >
        <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-red-600 to-purple-600 opacity-20 blur-xl" />

        <div className="relative rounded-2xl bg-black/40 p-8 shadow-2xl backdrop-blur-xl border border-white/10 text-center">
          <Link href="/" className="inline-block mb-8">
            <h1 className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">
              MOVEO
            </h1>
          </Link>

          {status === 'loading' && (
            <div className="flex flex-col items-center justify-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-red-500" />
              <h2 className="text-xl font-semibold text-white">Verifying your email...</h2>
              <p className="text-gray-400">Please wait a moment.</p>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center justify-center space-y-4">
              <CheckCircle className="h-16 w-16 text-green-500" />
              <h2 className="text-2xl font-bold text-white">Email Verified!</h2>
              <p className="text-gray-300">{message}</p>
              <Link
                href="/login"
                className="mt-6 inline-flex w-full justify-center items-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 py-3.5 px-4 text-sm font-bold text-white hover:from-red-500 hover:to-orange-500 transition-all duration-200"
              >
                Go to Login
              </Link>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center justify-center space-y-4">
              <XCircle className="h-16 w-16 text-red-500" />
              <h2 className="text-2xl font-bold text-white">Verification Failed</h2>
              <p className="text-gray-300">{message}</p>
              <Link
                href="/login"
                className="mt-6 inline-flex w-full justify-center items-center gap-2 rounded-xl bg-white/10 py-3.5 px-4 text-sm font-bold text-white hover:bg-white/20 transition-all duration-200"
              >
                Back to Login
              </Link>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-red-500" /></div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
