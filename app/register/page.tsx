"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'motion/react';
import { Mail, Lock, User, ArrowRight, Loader2 } from 'lucide-react';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { fetchDataFromApi } from '../../utils/api';
import Img from '../../components/Img';
import { useLanguage } from '@/context/LanguageContext';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [background, setBackground] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string>('');
  const captchaRef = useRef<HCaptcha>(null);
  const router = useRouter();
  const { t } = useLanguage();

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
    setSuccessMessage('');

    if (!captchaToken) {
      setError('Please complete the captcha');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, captchaToken }),
      });

      if (res.ok) {
        const data = await res.json();
        setSuccessMessage('Registration successful. You can now sign in.');
        // Clear form
        setName('');
        setEmail('');
        setPassword('');
        setCaptchaToken('');
        
        // Redirect to login after 2 seconds
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      } else {
        const data = await res.json();
        if (data.error === 'ACCOUNT_BANNED') {
          setError(`${t.auth.bannedRegisterMessage} ${t.auth.banReason} : ${data.ban_reason}`);
        } else {
          setError(data.error || 'Failed to register');
        }
        captchaRef.current?.resetCaptcha();
        setCaptchaToken('');
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
    <div className="relative flex min-h-screen items-center justify-center bg-moveo-bg px-4 py-12 sm:px-6 lg:px-8 selection:bg-white/20">
      {/* Dynamic Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {background && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.5 }}
            className="h-full w-full grayscale opacity-20 blur-xl"
          >
            <Img
              src={background}
              className="h-full w-full object-cover"
            />
          </motion.div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-moveo-bg via-moveo-bg/80 to-transparent" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative w-full max-w-md z-10"
      >
        <div className="relative rounded-3xl bg-moveo-surface/80 p-8 sm:p-12 shadow-2xl backdrop-blur-xl border border-white/5">
          <div className="mb-10 text-center">
            <Link href="/" className="inline-block mb-6 hover:scale-105 transition-transform">
              <h1 className="text-3xl font-serif tracking-tight text-white">
                MOVEO
              </h1>
            </Link>
            <h2 className="text-2xl font-serif text-white">{t.auth.createAccount}</h2>
            <p className="mt-2 text-sm font-sans text-white/50 tracking-wide">
              {t.auth.registerSubtitle}
            </p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="rounded-xl bg-white/5 p-4 text-sm text-red-400 border border-red-500/30 flex items-start gap-3 font-sans"
              >
                <div className="h-1.5 w-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                <p>{error}</p>
              </motion.div>
            )}

            {successMessage && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="rounded-xl bg-white/5 p-4 text-sm text-green-400 border border-green-500/30 flex items-start gap-3 font-sans"
              >
                <div className="h-1.5 w-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                <p>{successMessage}</p>
              </motion.div>
            )}

            <div className="space-y-4">
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/40 group-focus-within:text-white transition-colors">
                  <User className="h-4 w-4" />
                </div>
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  className="block w-full rounded-full border border-white/10 bg-transparent py-4 pl-12 pr-4 text-white placeholder:text-white/30 focus:border-white focus:bg-white/5 sm:text-sm transition-all duration-300 font-sans outline-none"
                  placeholder={t.auth.namePlaceholder}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/40 group-focus-within:text-white transition-colors">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="block w-full rounded-full border border-white/10 bg-transparent py-4 pl-12 pr-4 text-white placeholder:text-white/30 focus:border-white focus:bg-white/5 sm:text-sm transition-all duration-300 font-sans outline-none"
                  placeholder={t.auth.emailPlaceholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/40 group-focus-within:text-white transition-colors">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="block w-full rounded-full border border-white/10 bg-transparent py-4 pl-12 pr-4 text-white placeholder:text-white/30 focus:border-white focus:bg-white/5 sm:text-sm transition-all duration-300 font-sans outline-none"
                  placeholder={t.auth.passwordPlaceholder}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-center scale-90 sm:scale-100 origin-center">
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
              className="group relative flex w-full justify-center items-center gap-3 rounded-full bg-white py-4 px-4 text-sm font-bold font-sans text-moveo-bg hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:scale-105 active:scale-95"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="uppercase tracking-widest">{t.auth.creatingAccount}</span>
                </>
              ) : (
                <>
                  <span className="uppercase tracking-widest">{t.auth.signUp}</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-4 py-2">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs font-sans tracking-widest uppercase text-white/30">
                {t.auth.orContinueWith}
              </span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                disabled={!captchaToken}
                onClick={handleGoogleLogin}
                className="flex w-full items-center justify-center gap-3 rounded-full border border-white/20 bg-transparent px-4 py-4 text-sm font-bold font-sans text-white hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:scale-105 active:scale-95"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
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
                <span className="uppercase tracking-widest">Google</span>
              </button>
            </div>

            <div className="text-center text-xs font-sans text-white/50 pt-4">
              {t.auth.hasAccount}{' '}
              <Link href="/login" className="font-bold text-white hover:text-white/80 transition-colors underline decoration-white/30 underline-offset-4">
                {t.auth.signInLink}
              </Link>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
