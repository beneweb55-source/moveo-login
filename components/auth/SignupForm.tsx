'use client';

import { useActionState } from 'react';
import { signup } from '@/app/actions/auth';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

export default function SignupForm() {
  const [state, formAction, isPending] = useActionState(signup, undefined);

  return (
    <form action={formAction} className="space-y-4 w-full max-w-md mx-auto p-6 bg-zinc-900/50 rounded-xl border border-zinc-800 backdrop-blur-sm">
      <div className="space-y-2 text-center mb-6">
        <h1 className="text-2xl font-bold text-white">Inscription</h1>
        <p className="text-zinc-400 text-sm">Créez un compte pour commencer</p>
      </div>

      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium text-zinc-300">Nom</label>
        <input
          id="name"
          name="name"
          placeholder="Votre nom"
          className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent transition-all"
        />
        {state?.errors?.name && <p className="text-red-500 text-xs">{state.errors.name}</p>}
      </div>

      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium text-zinc-300">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="exemple@email.com"
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
          placeholder="Minimum 8 caractères"
          className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent transition-all"
        />
        {state?.errors?.password && (
          <div className="text-red-500 text-xs">
            <p>Le mot de passe doit :</p>
            <ul className="list-disc list-inside">
              {state.errors.password.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}
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
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "S'inscrire"}
      </button>

      <div className="text-center text-sm text-zinc-500 mt-4">
        Déjà un compte ?{' '}
        <Link href="/login" className="text-red-500 hover:text-red-400 font-medium hover:underline">
          Se connecter
        </Link>
      </div>
    </form>
  );
}
