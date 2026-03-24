"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'motion/react';
import { Mail, ArrowRight, Loader2 } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const { t } = useLanguage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setMessage('');

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatus('success');
        setMessage('If an account exists with that email, a password reset link has been sent.');
      } else {
        setStatus('error');
        setMessage(data.error || 'Failed to send reset email.');
      }
    } catch (err) {
      setStatus('error');
      setMessage('An error occurred. Please try again.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4 py-12 sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/40" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent via-black/40 to-black" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative w-full max-w-md"
      >
        <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-red-600 to-purple-600 opacity-20 blur-xl transition duration-1000 group-hover:opacity-40 group-hover:duration-200" />

        <div className="relative rounded-2xl bg-black/40 p-8 shadow-2xl backdrop-blur-xl border border-white/10">
          <div className="mb-8 text-center">
            <Link href="/" className="inline-block">
              <h1 className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500 mb-2">
                MOVEO
              </h1>
            </Link>
            <h2 className="text-2xl font-bold text-white mt-4">Reset Password</h2>
            <p className="mt-2 text-sm text-gray-400">
              Enter your email address and we'll send you a link to reset your password.
            </p>
          </div>

          {status === 'success' ? (
            <div className="text-center">
              <div className="rounded-lg bg-green-500/10 p-4 text-sm text-green-400 border border-green-500/20 mb-6">
                {message}
              </div>
              <Link
                href="/login"
                className="font-semibold text-red-500 hover:text-red-400 transition-colors hover:underline decoration-2 underline-offset-4"
              >
                Back to Login
              </Link>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
              {status === 'error' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="rounded-lg bg-red-500/10 p-4 text-sm text-red-400 border border-red-500/20 flex items-center gap-2"
                >
                  <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  {message}
                </motion.div>
              )}

              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-red-500 transition-colors">
                  <Mail className="h-5 w-5" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="block w-full rounded-xl border-0 bg-white/5 py-3.5 pl-10 pr-4 text-white shadow-sm ring-1 ring-inset ring-white/10 placeholder:text-gray-500 focus:ring-2 focus:ring-inset focus:ring-red-500 focus:bg-white/10 sm:text-sm sm:leading-6 transition-all duration-200"
                  placeholder={t.auth.emailPlaceholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={status === 'loading'}
                className="group relative flex w-full justify-center items-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 py-3.5 px-4 text-sm font-bold text-white hover:from-red-500 hover:to-orange-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-black disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-red-600/20 hover:shadow-red-600/40 hover:scale-[1.02] active:scale-[0.98]"
              >
                {status === 'loading' ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    Send Reset Link
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </button>

              <div className="text-center text-sm text-gray-400 mt-6">
                Remember your password?{' '}
                <Link href="/login" className="font-semibold text-red-500 hover:text-red-400 transition-colors hover:underline decoration-2 underline-offset-4">
                  {t.auth.signInLink}
                </Link>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
