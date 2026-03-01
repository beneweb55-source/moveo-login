'use client';

import { useActionState } from 'react';
import { login } from '@/app/actions/auth';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

export default function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, undefined);

  return (
    <form action={formAction} className="space-y-4 w-full max-w-md mx-auto p-6 bg-zinc-900/50 rounded-xl border border-zinc-800 backdrop-blur-sm">
      <div className="space-y-2 text-center mb-6">
        <h1 className="text-2xl font-bold text-white">Connexion</h1>
        <p className="text-zinc-400 text-sm">Entrez vos identifiants pour accéder à votre compte</p>
      </div>

      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium text-zinc-300">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="exemple@email.com"
          required
          className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent transition-all"
        />
        {state?.errors?.email && <p className="text-red-500 text-xs">{state.errors.email}</p>}
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-zinc-300">Mot de passe</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent transition-all"
        />
        {state?.errors?.password && <p className="text-red-500 text-xs">{state.errors.password}</p>}
      </div>

      {state?.message && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-500 text-sm text-center">{state.message}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Se connecter'}
      </button>

      <div className="text-center text-sm text-zinc-500 mt-4">
        Pas encore de compte ?{' '}
        <Link href="/signup" className="text-red-500 hover:text-red-400 font-medium hover:underline">
          S'inscrire
        </Link>
      </div>
    </form>
  );
}
