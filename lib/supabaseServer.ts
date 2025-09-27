import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server-side admin client (bypasses RLS via service_role)
export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});
