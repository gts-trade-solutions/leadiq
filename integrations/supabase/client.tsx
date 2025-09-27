// src/integrations/supabase/client.tsx
'use client';
import { createContext, useContext, useMemo } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function deriveFunctionsUrl(supabaseUrl: string) {
  const host = new URL(supabaseUrl).host;   // e.g. abcd1234.supabase.co
  const ref = host.split('.')[0];           // abcd1234
  return `https://${ref}.functions.supabase.co`;
}

const Ctx = createContext<SupabaseClient | null>(null);

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const fnUrl = deriveFunctionsUrl(url);

  const supabase = useMemo(
    () =>
      createClient(url, key, {
        auth: { persistSession: true },
        functions: { url: fnUrl },           // 👈 important
      }),
    [url, key, fnUrl]
  );
  return <Ctx.Provider value={supabase}>{children}</Ctx.Provider>;
}
export function useSupabase() {
  const c = useContext(Ctx);
  if (!c) throw new Error('SupabaseProvider missing');
  return c;
}
