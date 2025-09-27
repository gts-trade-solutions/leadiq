import type { SupabaseClient } from '@supabase/supabase-js';

export type EmailIdentityRow = {
  id: string;
  email: string;
  status: 'pending' | 'verified' | 'failed';
  verified_at: string | null;
  changes_used: number | null;
};

export function changesLeft(row?: EmailIdentityRow | null, limit = 2) {
  const used = row?.changes_used ?? 0;
  return Math.max(0, limit - used);
}

export async function getMySender(supabase: SupabaseClient): Promise<EmailIdentityRow | null> {
  const { data, error } = await supabase
    .from('email_identities')
    .select('id,email,status,verified_at,changes_used')
    .limit(1)
    .maybeSingle();
  if (error && (error as any).code !== 'PGRST116') throw new Error(error.message);
  return (data ?? null) as EmailIdentityRow | null;
}

/** startEmailVerify and checkEmailStatus should just return the JSON from functions */
export async function startEmailVerify(supabase: SupabaseClient, email: string): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${(supabase as any).functionsUrl}/email-start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: session?.access_token ? `Bearer ${session.access_token}` : '',
    },
    body: JSON.stringify({ email }),
  });
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(json?.error || 'startEmailVerify failed'), { status: res.status, json });
  return json;
}

export async function checkEmailStatus(supabase: SupabaseClient, args: { identityId?: string; email?: string }): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${(supabase as any).functionsUrl}/email-status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: session?.access_token ? `Bearer ${session.access_token}` : '',
    },
    body: JSON.stringify(args),
  });
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(json?.error || 'checkEmailStatus failed'), { status: res.status, json });
  return json;
}
