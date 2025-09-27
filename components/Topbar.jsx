'use client';

import { useEffect, useState } from 'react';
import { User, LogOut, Wallet as WalletIcon, RefreshCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

const LOGIN_ROUTE = '/auth/signin'; // ← change if your login path is different

export default function Topbar() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);
  const [profile, setProfile] = useState({ id: '', name: '', email: '' });

  const [wallet, setWallet] = useState(null);
  const [loadingWallet, setLoadingWallet] = useState(true);

  // --- boot user + session
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        const u = session?.user;
        if (u) {
          const name =
            u.user_metadata?.full_name ||
            u.user_metadata?.name ||
            (u.email ? u.email.split('@')[0] : 'User');
          setProfile({ id: u.id, name, email: u.email ?? '' });
          setLoadingUser(false);
          await refreshWallet(u.id);
          subscribeToCredits(u.id);
        } else {
          setLoadingUser(false);
          setWallet(null);
        }
      } catch (e) {
        console.error('Auth bootstrap error:', e);
        setLoadingUser(false);
        setWallet(null);
      }
    };
    init();

    // Keep server cookie in sync + react to changes
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        // Sync cookie (works if you have /auth/callback; harmless if not)
        await fetch('/auth/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ event, session }),
        });
      } catch { /* ignore if route not present */ }

      const u = session?.user;
      if (u) {
        const name =
          u.user_metadata?.full_name ||
          u.user_metadata?.name ||
          (u.email ? u.email.split('@')[0] : 'User');
        setProfile({ id: u.id, name, email: u.email ?? '' });
        refreshWallet(u.id);
        subscribeToCredits(u.id);
      } else {
        setProfile({ id: '', name: '', email: '' });
        setWallet(null);
      }
    });

    return () => {
      sub.subscription.unsubscribe();
      supabase.getChannels().forEach((ch) => supabase.removeChannel(ch));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  // --- wallet loader with safe fallback to edge function
  async function refreshWallet(userId) {
    const uid = userId || profile.id;
    if (!uid) return;
    setLoadingWallet(true);
    try {
      const { data, error } = await supabase
        .from('wallet')
        .select('balance')
        .eq('user_id', uid)
        .maybeSingle();
      if (!error && data) {
        setWallet(data.balance ?? 0);
      } else {
        const res = await supabase.functions.invoke('wallet-read', { body: {} });
        const bal = res?.data?.balance ?? res?.data ?? null;
        setWallet(typeof bal === 'number' ? bal : null);
      }
    } catch (e) {
      console.warn('wallet load failed:', e);
      try {
        const res = await supabase.functions.invoke('wallet-read', { body: {} });
        const bal = res?.data?.balance ?? res?.data ?? null;
        setWallet(typeof bal === 'number' ? bal : null);
      } catch (e2) {
        console.error('wallet-read failed:', e2);
        setWallet(null);
      }
    } finally {
      setLoadingWallet(false);
    }
  }

  // --- realtime: update when credits_ledger changes for this user
  function subscribeToCredits(userId) {
    const existing = supabase.getChannels().find((c) => c.topic === 'realtime:wallet');
    if (existing) return;
    supabase
      .channel('realtime:wallet')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'credits_ledger', filter: `user_id=eq.${userId}` },
        () => refreshWallet(userId)
      )
      .subscribe();
  }

  // --- sign out (client + server cookies + redirect)
  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut(); // clear browser session
      // clear server cookie so server routes/pages see you as signed out
      try {
        await fetch('/auth/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ event: 'SIGNED_OUT', session: null }),
        });
      } catch {/* ignore if callback route not present */}
    } finally {
      // close realtime
      supabase.getChannels().forEach((ch) => supabase.removeChannel(ch));
      // navigate to login
      router.replace(LOGIN_ROUTE);
      router.refresh();
    }
  };

  return (
    <div className="h-16 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <div className="text-sm font-semibold text-white">Dashboard</div>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => refreshWallet()}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-sm hover:border-gray-600"
          title="Click to refresh"
        >
          <WalletIcon className="w-4 h-4" />
          <span className="font-medium">Credits:</span>
          <span className="tabular-nums">{loadingWallet ? '…' : (wallet ?? '--')}</span>
          <RefreshCcw className="w-3 h-3 opacity-70" />
        </button>

        <div className="relative">
          <button
            onClick={() => setShowUserMenu((v) => !v)}
            className="flex items-center gap-3 p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="text-left hidden md:block">
              <div className="text-sm font-medium text-white">
                {loadingUser ? 'Loading…' : (profile.name || 'Guest')}
              </div>
              <div className="text-xs text-gray-400">
                {loadingUser ? '' : (profile.email || '')}
              </div>
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-lg py-1 z-50">
              <div className="px-4 py-2 border-b border-gray-700">
                <div className="text-sm font-medium text-white">{profile.name || 'Guest'}</div>
                {profile.email ? <div className="text-xs text-gray-400">{profile.email}</div> : null}
              </div>

              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700 w-full text-left"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
