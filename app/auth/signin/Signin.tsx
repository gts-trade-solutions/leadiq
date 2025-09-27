'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSupabase } from '@/integrations/supabase/client';

const DEFAULT_NEXT = '/admin/campaigns';

export default function SignInPage() {
  const supabase = useSupabase(); // your existing client (browser)
  const router = useRouter();
  const search = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // If already signed in, bounce to next
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (data.session) {
        const next = search.get('next') || DEFAULT_NEXT;
        router.replace(next);
      }
    });
    return () => {
      alive = false;
    };
  }, [router, search, supabase]);

  // Optional: sync the session to /auth/callback if you created that route
  async function syncAuthToServer() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch('/auth/callback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: 'SIGNED_IN', session }),
        credentials: 'same-origin',
      });
    } catch {
      // ignore if you haven't added /auth/callback (no-op)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // Ensure the session exists in the browser (fixes "not_authenticated" from RPCs)
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data } = await supabase.auth.refreshSession();
        session = data.session ?? null;
      }
      if (!session) {
        throw new Error('Login succeeded but no session was created. Please try again.');
      }

      // (Optional) sync cookies for server routes (only if you added /auth/callback)
      await syncAuthToServer();

      // Redirect
      const next = search.get('next') || DEFAULT_NEXT;
      router.replace(next);
      router.refresh(); // make sure server components pick up the new session
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Unable to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center bg-gray-950 px-4">
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl">
        <h1 className="text-2xl font-semibold text-white">Sign in</h1>
        <p className="text-gray-400 mt-1 text-sm">
          Welcome back. Use your email and password to continue.
        </p>

        {errorMsg && (
          <div className="mt-4 text-sm border border-red-600 bg-red-900/20 text-red-200 rounded-lg p-3">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="you@company.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-sm text-gray-400">
          Don’t have an account?{' '}
          <Link href="/auth/signup" className="text-emerald-400 hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
