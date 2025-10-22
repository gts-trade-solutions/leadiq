'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSupabase } from '@/integrations/supabase/client';

export default function SignUpPage() {
  const supabase = useSupabase();
  const router = useRouter();
  const search = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // If already signed in, bounce to next or /campaigns
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        const next = search.get('next') || '/companies';
        router.replace(next);
      }
    });
  }, [router, search, supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setNotice(null);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        // If email confirmations are enabled, Supabase will email a link that redirects here:
        options: { emailRedirectTo: `${origin}/auth/signin` },
      });
      if (error) throw error;

      // If confirmations are ON, session will be null and the user must check inbox.
      if (!data.session) {
        setNotice('Account created. Please check your inbox to confirm your email before signing in.');
        return;
      }

      // If confirmations are OFF, we’ll have a session — redirect now.
      const next = search.get('next') || '/';
      router.replace(next);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Unable to sign up. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center bg-gray-950 px-4">
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl">
        <h1 className="text-2xl font-semibold text-white">Create account</h1>
        <p className="text-gray-400 mt-1 text-sm">
          Start sending campaigns with your verified sender.
        </p>

        {errorMsg && (
          <div className="mt-4 text-sm border border-red-600 bg-red-900/20 text-red-200 rounded-lg p-3">
            {errorMsg}
          </div>
        )}

        {notice && (
          <div className="mt-4 text-sm border border-emerald-600 bg-emerald-900/20 text-emerald-200 rounded-lg p-3">
            {notice}
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
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium transition-colors"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-4 text-sm text-gray-400">
          Already have an account?{' '}
          <Link href="/auth/signin" className="text-emerald-400 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
