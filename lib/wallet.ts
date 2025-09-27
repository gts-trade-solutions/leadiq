import type { SupabaseClient } from '@supabase/supabase-js';

export async function getWalletBalance(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from('wallet')
    .select('balance')
    .limit(1)
    .maybeSingle();
  if (error && (error as any).code !== 'PGRST116') throw new Error(error.message);
  return data?.balance ?? 0;
}