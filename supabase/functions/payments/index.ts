// Deno Edge Function: payments (CORS-enabled)
// Actions: create_order, verify_payment

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type CreateOrderBody = {
  action: "create_order";
  credits: number;
  profile: {
    full_name: string;
    email: string;
    phone?: string;
    company?: string;
    gstin?: string;
    address?: Record<string, string | undefined> | null;
  };
};
type VerifyBody = {
  action: "verify_payment";
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

function buildReceipt(userId: string) {
  const uid = userId.replace(/-/g, '').slice(0, 8);
  const t = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6); // 4 chars
  return `rcpt_${uid}_${t}_${rand}`.slice(0, 40);
}


const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RZP_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID")!;
const RZP_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;

// Pricing constants
const USD_PER_CREDIT = 0.10;
const FX_INR_PER_USD = 88;
const PRO_QTY = 3000,
  PREMIUM_QTY = 7200;
const PRO_DISCOUNT = 0.15,
  PREMIUM_DISCOUNT = 0.25;

// ---------- CORS helpers ----------
const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null) {
  // reflect a whitelisted origin; if none matched and allowlist exists, fall back to first allowed
  const allowOrigin =
    ALLOWED.length === 0
      ? "*"
      : origin && ALLOWED.includes(origin)
      ? origin
      : ALLOWED[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    Vary: "Origin",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    // include headers commonly sent by Supabase client + our webhook verification
    "Access-Control-Allow-Headers":
      "authorization,content-type,apikey,x-client-info,x-razorpay-signature",
  };
}

function json(
  res: unknown,
  init: ResponseInit = {},
  origin: string | null = null
) {
  return new Response(JSON.stringify(res), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...corsHeaders(origin),
      ...(init.headers || {}),
    },
  });
}

async function hmacSHA256Hex(secret: string, data: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  // Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }

  if (req.method !== "POST")
    return json({ error: "Method not allowed" }, { status: 405 }, origin);

  const authHeader = req.headers.get("Authorization") ?? "";

  // user-scoped client (RLS on)
  const sbUser = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  // admin client (bypass RLS for deterministic updates/ledger)
  const sbAdmin = createClient(SUPABASE_URL, SERVICE);

  const body = await req.json();
  const action = body?.action as "create_order" | "verify_payment";

  // ---- current user ----
  const token = authHeader.replace("Bearer ", "");
  const { data: u, error: ue } = await sbUser.auth.getUser(token);
  if (ue || !u?.user)
    return json({ error: "Unauthorized" }, { status: 401 }, origin);
  const user = u.user;

  if (action === "create_order") {
    const { credits, profile } = body as CreateOrderBody;

    // upsert billing
    const { error: upErr } = await sbUser
      .from("billing_profiles")
      .upsert({
        user_id: user.id,
        full_name: profile.full_name,
        email: profile.email,
        phone: profile.phone ?? null,
        company: profile.company ?? null,
        gstin: profile.gstin ?? null,
        address: profile.address ?? null,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (upErr)
      return json(
        { error: "Failed to save billing profile", detail: upErr.message },
        { status: 500 },
        origin
      );

    // price (discount only when exactly at tiers)
    let discount = 0;
    if (credits === PRO_QTY) discount = PRO_DISCOUNT;
    if (credits === PREMIUM_QTY) discount = PREMIUM_DISCOUNT;

    const totalInr = credits * USD_PER_CREDIT * (1 - discount) * FX_INR_PER_USD;
    const amountPaise = Math.max(1000, Math.round(totalInr * 100)); // >= ₹10

    // create Razorpay order
    const auth = "Basic " + btoa(`${RZP_KEY_ID}:${RZP_KEY_SECRET}`);
    const receipt = buildReceipt(user.id);

    const r = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: auth },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt, // ≤ 40 chars now
        notes: { user_id: user.id, credits }, // Put extra info in notes, not receipt
      }),
    });

    if (!r.ok)
      return json(
        { error: "Razorpay order create failed", detail: await r.text() },
        { status: 500 },
        origin
      );
    const order = await r.json();

    // record 'created'
    const { error: payErr } = await sbUser.from("payments").insert({
      user_id: user.id,
      razorpay_order_id: order.id,
      razorpay_payment_id: null,
      credits,
      amount: amountPaise,
      currency: "INR",
      status: "created",
      meta: order,
    });
    if (payErr)
      return json(
        { error: "DB insert failed", detail: payErr.message },
        { status: 500 },
        origin
      );

    return json(
      {
        key_id: RZP_KEY_ID,
        order_id: order.id,
        amount: amountPaise,
        currency: "INR",
        credits,
      },
      {},
      origin
    );
  }

  if (action === "verify_payment") {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } =
      body as VerifyBody;

    // ensure order belongs to current user
    const { data: payRow, error: qErr } = await sbUser
      .from("payments")
      .select(
        "id,user_id,status,credits,amount,razorpay_order_id,razorpay_payment_id"
      )
      .eq("razorpay_order_id", razorpay_order_id)
      .single();
    if (qErr || !payRow)
      return json({ error: "Payment not found" }, { status: 404 }, origin);

    // verify signature
    const expected = await hmacSHA256Hex(
      RZP_KEY_SECRET,
      `${razorpay_order_id}|${razorpay_payment_id}`
    );
    const ok = expected === String(razorpay_signature).toLowerCase();
    if (!ok) {
      await sbAdmin
        .from("payments")
        .update({
          status: "failed",
          razorpay_payment_id,
          updated_at: new Date().toISOString(),
        })
        .eq("razorpay_order_id", razorpay_order_id);
      return json(
        { verified: false, error: "Signature verification failed" },
        { status: 400 },
        origin
      );
    }

    // idempotent: already paid?
    if (payRow.status === "paid") {
      const { data: allRows } = await sbAdmin
        .from("credits_ledger")
        .select("delta")
        .eq("user_id", user.id);
      const balance = (allRows || []).reduce(
        (a, r: any) => a + Number(r.delta || 0),
        0
      );
      return json({ verified: true, credited: 0, balance }, {}, origin);
    }

    // mark paid + credit
    const now = new Date().toISOString();
    await sbAdmin
      .from("payments")
      .update({
        status: "paid",
        razorpay_payment_id,
        updated_at: now,
        meta: { verified_at: now },
      })
      .eq("razorpay_order_id", razorpay_order_id);

    const correlation_id = `rzp_${razorpay_payment_id}`;
    const { error: ledErr } = await sbAdmin.from("credits_ledger").insert({
      user_id: user.id,
      delta: payRow.credits,
      kind: "purchase", // change if your enum differs
      correlation_id,
      note: "Razorpay purchase",
      metadata: { razorpay_payment_id, razorpay_order_id },
    } as any);
    if (ledErr && !String(ledErr.message).includes("duplicate")) {
      return json(
        {
          verified: true,
          credited: 0,
          warning: "Ledger insert failed: " + ledErr.message,
        },
        {},
        origin
      );
    }

    const { data: allRows } = await sbAdmin
      .from("credits_ledger")
      .select("delta")
      .eq("user_id", user.id);
    const balance = (allRows || []).reduce(
      (a, r: any) => a + Number(r.delta || 0),
      0
    );

    return json(
      { verified: true, credited: payRow.credits, balance },
      {},
      origin
    );
  }

  return json({ error: "Unknown action" }, { status: 400 }, origin);
});
