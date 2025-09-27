// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
} as const;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL = "gpt-4o-mini";
const COST = Number(Deno.env.get("PER_CREDIT_DRAFT") ?? "1");

// async SHA-256 → short hex
async function hashHex(input: string) {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buf);
  return Array.from(bytes).slice(0, 12).map(b => b.toString(16).padStart(2,"0")).join("");
}

async function corrId(userId: string, prompt: string) {
  return `li-draft-${await hashHex(`${userId}|linkedin|draft|${COST}|${prompt}`)}`;
}

type DraftReq = {
  prompt: string;
  tone?: "neutral"|"friendly"|"persuasive"|"technical";
  length?: "short"|"medium"|"long";
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405, headers: { ...cors, "Content-Type":"application/json" }
    });
  }

  try {
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userRes } = await anon.auth.getUser();
    const user = userRes?.user ?? null;
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...cors, "Content-Type":"application/json" }
    });

    let body: DraftReq;
    try { body = await req.json(); }
    catch { return new Response(JSON.stringify({ error: "BAD_JSON" }), { status: 400, headers: { ...cors, "Content-Type":"application/json" } }); }

    const prompt = (body?.prompt ?? "").trim();
    if (!prompt) return new Response(JSON.stringify({ error: "MISSING_PROMPT" }), { status: 400, headers: { ...cors, "Content-Type":"application/json" } });
    const tone = body?.tone ?? "neutral";
    const length = body?.length ?? "medium";

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: wal } = await admin.from("wallet").select("balance").eq("user_id", user.id).maybeSingle();
    const balance = wal?.balance ?? 0;
    if (balance < COST) {
      return new Response(JSON.stringify({ error: "INSUFFICIENT_CREDITS", balance }), {
        status: 402, headers: { ...cors, "Content-Type":"application/json" }
      });
    }

    const system = [
      "You are a LinkedIn copy assistant.",
      'Output strict JSON: {"headline": string, "body": string, "hashtags": string[]}',
      `Tone: ${tone}. Length: ${length}. Keep body 140–260 words. No markdown.`
    ].join("\n");

    const oa = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        input: [
          { role: "system", content: system },
          { role: "user", content: `Brief: ${prompt}\nRespond ONLY with valid JSON.` }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!oa.ok) {
      return new Response(JSON.stringify({ error: "OPENAI_ERROR", detail: await oa.text() }), {
        status: 500, headers: { ...cors, "Content-Type":"application/json" }
      });
    }

    const payload = await oa.json();
    const text = payload?.output_text || payload?.response?.output_text || payload?.choices?.[0]?.message?.content || "{}";

    let draft: any;
    try { draft = JSON.parse(text); } catch { draft = { headline: "", body: text, hashtags: [] }; }

    const correlation_id = await corrId(user.id, prompt);
    await admin.from("credits_ledger").insert({
      user_id: user.id,
      delta: -COST,
      kind: "debit",
      correlation_id,
      note: "linkedin.draft_text",
      metadata: { channel: "linkedin", action: "draft_text", tone, length },
    });

    const { data: wal2 } = await admin.from("wallet").select("balance").eq("user_id", user.id).maybeSingle();
    return new Response(JSON.stringify({ ok: true, draft, balance: wal2?.balance ?? balance - COST }), {
      status: 200, headers: { ...cors, "Content-Type":"application/json" }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Unexpected error" }), {
      status: 500, headers: { ...cors, "Content-Type":"application/json" }
    });
  }
});
