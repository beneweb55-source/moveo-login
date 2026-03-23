"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'motion/react';
import { Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { fetchDataFromApi } from '../../utils/api';
import Img from '../../components/Img';
import { useLanguage } from '@/context/LanguageContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [background, setBackground] = useState<string>('');
  const [captchaToken, setCaptchaToken] = useState<string>('');
  const captchaRef = useRef<HCaptcha>(null);
  const router = useRouter();
  const { t } = useLanguage();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('banned') === '1') {
      setError(`Votre compte a été suspendu. Raison : ${params.get('reason') || 'Violation des règles'}`);
    }
  }, []);

  useEffect(() => {
    const fetchBackground = async () => {
      try {
        const res = await fetchDataFromApi('/trending/all/day');
        const random = res.results[Math.floor(Math.random() * res.results.length)];
        setBackground(random?.backdrop_path);
      } catch (err) {
        console.error('Failed to fetch background', err);
      }
    };
    fetchBackground();
  }, []);

  const handleGoogleLogin = async () => {
    if (!captchaToken) {
      setError('Please complete the captcha');
      return;
    }

    try {
      // Verify Captcha
      const captchaRes = await fetch('/api/verify-hcaptcha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: captchaToken }),
      });

      const captchaData = await captchaRes.json();
      if (!captchaData.success) {
        setError('Captcha verification failed. Please try again.');
        captchaRef.current?.resetCaptcha();
        setCaptchaToken('');
        return;
      }

      const origin = window.location.origin;
      const res = await fetch(`/api/auth/google/url?origin=${encodeURIComponent(origin)}`);
      const { url } = await res.json();
      
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      const popup = window.open(
        url,
        'google_oauth',
        `width=${width},height=${height},top=${top},left=${left}`
      );

      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        
        if (event.data.type === 'OAUTH_AUTH_SUCCESS') {
          window.removeEventListener('message', handleMessage);
          popup?.close();
          router.push('/');
          router.refresh();
        }
      };

      window.addEventListener('message', handleMessage);
    } catch (error) {
      console.error('Google login failed:', error);
      setError('Google login failed. Please try again.');
      captchaRef.current?.resetCaptcha();
      setCaptchaToken('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!captchaToken) {
      setError('Please complete the captcha');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, captchaToken }),
      });

      if (res.ok) {
        router.push('/');
        router.refresh();
      } else {
        const data = await res.json();
        if (data.error === 'ACCOUNT_BANNED') {
          router.push(`/banned?reason=${encodeURIComponent(data.ban_reason || 'Violation des règles')}`);
        } else {
          setError(data.error || 'Failed to login');
          captchaRef.current?.resetCaptcha();
          setCaptchaToken('');
        }
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      captchaRef.current?.resetCaptcha();
      setCaptchaToken('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-black px-4 py-12 sm:px-6 lg:px-8">
      {/* Dynamic Background */}
      <div className="absolute inset-0 overflow-hidden">
        {background && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.5 }}
            className="h-full w-full"
          >
            <Img
              src={background}
              className="h-full w-full object-cover opacity-40 scale-105 blur-sm"
            />
          </motion.div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/40" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent via-black/40 to-black" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative w-full max-w-md"
      >
        {/* Glow Effect */}
        <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-red-600 to-purple-600 opacity-20 blur-xl transition duration-1000 group-hover:opacity-40 group-hover:duration-200" />

        <div className="relative rounded-2xl bg-black/40 p-8 shadow-2xl backdrop-blur-xl border border-white/10">
          <div className="mb-8 text-center">
            <Link href="/" className="inline-block">
              <h1 className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500 mb-2">
                MOVEO
              </h1>
            </Link>
            <h2 className="text-2xl font-bold text-white mt-4">{t.auth.welcomeBack}</h2>
            <p className="mt-2 text-sm text-gray-400">
              {t.auth.loginSubtitle}
            </p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="rounded-lg bg-red-500/10 p-4 text-sm text-red-400 border border-red-500/20 flex items-center gap-2"
              >
                <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
                {error}
              </motion.div>
            )}

            <div className="space-y-4">
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

              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-red-500 transition-colors">
                  <Lock className="h-5 w-5" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="block w-full rounded-xl border-0 bg-white/5 py-3.5 pl-10 pr-4 text-white shadow-sm ring-1 ring-inset ring-white/10 placeholder:text-gray-500 focus:ring-2 focus:ring-inset focus:ring-red-500 focus:bg-white/10 sm:text-sm sm:leading-6 transition-all duration-200"
                  placeholder={t.auth.passwordPlaceholder}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-600 bg-white/5 text-red-600 focus:ring-red-500 focus:ring-offset-black"
                />
                <label htmlFor="remember-me" className="ml-2 block text-gray-400">
                  {t.auth.rememberMe}
                </label>
              </div>
              <div className="text-sm">
                <Link href="/forgot-password" className="font-medium text-red-500 hover:text-red-400 transition-colors">
                  {t.auth.forgotPassword}
                </Link>
              </div>
            </div>

            <div className="flex justify-center">
              <HCaptcha
                sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || '81cabbe0-0f18-4588-9850-8e7209d69ae2'}
                onVerify={(token) => setCaptchaToken(token)}
                onExpire={() => setCaptchaToken('')}
                ref={captchaRef}
                theme="dark"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !captchaToken}
              className="group relative flex w-full justify-center items-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 py-3.5 px-4 text-sm font-bold text-white hover:from-red-500 hover:to-orange-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-black disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-red-600/20 hover:shadow-red-600/40 hover:scale-[1.02] active:scale-[0.98]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {t.auth.signingIn}
                </>
              ) : (
                <>
                  {t.auth.signIn}
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-4">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-sm text-gray-400">
                {t.auth.orContinueWith}
              </span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                disabled={!captchaToken}
                onClick={handleGoogleLogin}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-inset ring-white/10 hover:bg-white/10 hover:ring-white/20 cursor-pointer active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Google
              </button>
            </div>

            <div className="text-center text-sm text-gray-400 mt-6">
              {t.auth.noAccount}{' '}
              <Link href="/register" className="font-semibold text-red-500 hover:text-red-400 transition-colors hover:underline decoration-2 underline-offset-4">
                {t.auth.signUpNow}
              </Link>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
