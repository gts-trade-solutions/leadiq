// Deno Edge Function: razorpay-webhook (CORS-enabled)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('RAZORPAY_WEBHOOK_SECRET')!;

const sb = createClient(SUPABASE_URL, SERVICE);

// --- CORS helpers (same as payments) ---
const ALLOWED = (Deno.env.get('ALLOWED_ORIGINS') || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null) {
  const allowOrigin =
    ALLOWED.length === 0 ? '*' :
    (origin && ALLOWED.includes(origin) ? origin : ALLOWED[0]);

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type,x-razorpay-signature'
  };
}

function json(res: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(res), { status, headers: { 'content-type': 'application/json', ...corsHeaders(origin) } });
}

async function hmacHex(secret: string, data: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);

  const signature = req.headers.get('x-razorpay-signature') || '';
  const bodyText = await req.text();

  // verify webhook signature
  const expected = await hmacHex(WEBHOOK_SECRET, bodyText);
  if (expected !== signature) return json({ error: 'Invalid signature' }, 400, origin);

  const payload = JSON.parse(bodyText);
  const payment = payload?.payload?.payment?.entity;
  const order_id = payment?.order_id as string | undefined;
  const payment_id = payment?.id as string | undefined;

  if (!order_id || !payment_id) return json({ ok: true }, 200, origin);

  const { data: pay, error } = await sb.from('payments')
    .select('id,user_id,status,credits')
    .eq('razorpay_order_id', order_id).single();
  if (error || !pay) return json({ ok: true }, 200, origin);

  if (pay.status === 'paid') return json({ ok: true, idempotent: true }, 200, origin);

  await sb.from('payments').update({
    status: 'paid',
    razorpay_payment_id: payment_id,
    updated_at: new Date().toISOString(),
    meta: { webhook: payload, webhook_verified_at: new Date().toISOString() }
  }).eq('razorpay_order_id', order_id);

  const correlation_id = `rzp_${payment_id}`;
  await sb.from('credits_ledger').insert({
    user_id: pay.user_id,
    delta: pay.credits,
    kind: 'purchase', // change if your enum differs
    correlation_id,
    note: 'Razorpay webhook purchase',
    metadata: { order_id, payment_id }
  } as any);

  return json({ ok: true }, 200, origin);
});
