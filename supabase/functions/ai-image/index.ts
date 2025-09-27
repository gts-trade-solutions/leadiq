// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
} as const;

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SRK  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const COST = Number(Deno.env.get("PER_AI_IMAGE_CREDITS") ?? "5");
const BUCKET = "li-assets";

async function ensureBucket(srv: ReturnType<typeof createClient>) {
  try { await srv.storage.createBucket(BUCKET, { public: true }); } catch { /* exists */ }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const sb = createClient(URL, ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return new Response(JSON.stringify({ error:"Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type":"application/json" } });

    const { prompt, size = "1792x1024" } = await req.json().catch(()=>({}));
    if (!prompt) return new Response(JSON.stringify({ error:"MISSING_PROMPT" }), { status: 400, headers: { ...cors, "Content-Type":"application/json" } });

    const admin = createClient(URL, SRK);
    const { data: wal } = await admin.from("wallet").select("balance").eq("user_id", u.user.id).maybeSingle();
    const balance = wal?.balance ?? 0;
    if (balance < COST) return new Response(JSON.stringify({ error:"INSUFFICIENT_CREDITS", balance }), { status: 402, headers: { ...cors, "Content-Type":"application/json" } });

    // Generate via DALL·E 3 (images/generations)
    const gen = await fetch("https://api.openai.com/v1/images/generations", {
      method:"POST",
      headers:{ "Authorization":`Bearer ${OPENAI_API_KEY}`, "Content-Type":"application/json" },
      body: JSON.stringify({ model:"dall-e-3", prompt:String(prompt), size })
    });
    const gj = await gen.json();
    if (!gen.ok) return new Response(JSON.stringify({ error:"OPENAI_IMAGE_ERROR", detail: gj }), { status: 500, headers: { ...cors, "Content-Type":"application/json" } });

    const b64 = gj.data?.[0]?.b64_json;
    if (!b64) return new Response(JSON.stringify({ error:"NO_IMAGE" }), { status: 500, headers: { ...cors, "Content-Type":"application/json" } });
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));

    const path = `${u.user.id}/generated/${Date.now()}.png`;
    await ensureBucket(admin);
    const up = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: "image/png", upsert: false });
    if (up.error) return new Response(JSON.stringify({ error:"UPLOAD_FAILED", detail: up.error.message }), { status: 500, headers: { ...cors, "Content-Type":"application/json" } });

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);

    // Debit
    const correlation_id = `ai-image-${crypto.randomUUID()}`;
    await admin.from("credits_ledger").insert({
      user_id: u.user.id, delta: -COST, kind: "debit",
      correlation_id, note: "ai.image", metadata: { size }
    });

    const { data: w2 } = await admin.from("wallet").select("balance").eq("user_id", u.user.id).maybeSingle();
    return new Response(JSON.stringify({ ok:true, image:{ path, publicUrl: pub.publicUrl }, balance: w2?.balance ?? (balance - COST) }), {
      status: 200, headers: { ...cors, "Content-Type":"application/json" }
    });

  } catch (e:any) {
    return new Response(JSON.stringify({ error:e?.message || "Unexpected" }), { status: 500, headers: { ...cors, "Content-Type":"application/json" } });
  }
});
