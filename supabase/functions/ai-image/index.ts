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

const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";
const IMAGE_MODEL = "dall-e-3"; // ✅ alternative to gpt-image-1
const COST = Number(Deno.env.get("PER_CREDIT_IMAGE") ?? "5");

// Helpers
async function hashHex(input: string) {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buf);
  return Array.from(bytes).slice(0, 12).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function corrId(userId: string, prompt: string) {
  return `li-image-${await hashHex(`${userId}|linkedin|image|${COST}|${prompt}`)}`;
}

type ImgReq = { prompt: string; size?: string };

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405, headers: { ...cors, "Content-Type": "application/json" }
    });
  }

  try {
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userRes } = await anon.auth.getUser();
    const user = userRes?.user ?? null;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    let body: ImgReq;
    try { body = await req.json(); }
    catch {
      return new Response(JSON.stringify({ error: "BAD_JSON" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    const prompt = (body?.prompt ?? "").trim();
    if (!prompt) {
      return new Response(JSON.stringify({ error: "MISSING_PROMPT" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    // Force 1:1 image ratio regardless of what the client sends
    const finalSize = "1024x1024";

    // Wallet check
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: wal } = await admin
      .from("wallet").select("balance").eq("user_id", user.id).maybeSingle();
    const balance = wal?.balance ?? 0;
    if (balance < COST) {
      return new Response(JSON.stringify({ error: "INSUFFICIENT_CREDITS", balance }), {
        status: 402, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    // --- OpenAI Images API: try requesting b64_json first
    const commonHeaders = {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    };

    async function callImages(withB64Param: boolean) {
      const body: any = { model: IMAGE_MODEL, prompt, size: finalSize };
      if (withB64Param) body.response_format = "b64_json";
      const res = await fetch(OPENAI_IMAGES_URL, {
        method: "POST",
        headers: commonHeaders,
        body: JSON.stringify(body),
      });
      return res;
    }

    // First attempt: ask for b64_json
    let oa = await callImages(true);

    // If API complains about unknown parameter, retry without response_format
    if (!oa.ok) {
      const firstText = await oa.text();
      const unknownParam =
        firstText.includes("Unknown parameter: 'response_format'") ||
        firstText.includes("unknown parameter") ||
        firstText.includes("unsupported");
      if (unknownParam) {
        oa = await callImages(false);
      } else {
        return new Response(JSON.stringify({ error: "OPENAI_ERROR", detail: firstText }), {
          status: 500, headers: { ...cors, "Content-Type": "application/json" }
        });
      }
    }

    const payload = await oa.json();

    // Prefer b64_json; if absent but a URL is provided, fetch it to bytes
    let bytes: Uint8Array | null = null;
    const b64 = payload?.data?.[0]?.b64_json as string | undefined;
    if (b64) {
      bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    } else {
      const url = payload?.data?.[0]?.url as string | undefined;
      if (url) {
        const imgRes = await fetch(url);
        if (imgRes.ok) {
          const buf = new Uint8Array(await imgRes.arrayBuffer());
          bytes = buf;
        }
      }
    }

    if (!bytes) {
      return new Response(JSON.stringify({ error: "NO_IMAGE", detail: payload }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    // Upload PNG to Supabase Storage
    const path = `${user.id}/gen/${Date.now()}-${crypto.randomUUID()}.png`;
    const upload = await admin.storage
      .from("li-assets")
      .upload(path, new Blob([bytes], { type: "image/png" }), {
        contentType: "image/png",
        upsert: false,
      });

    if (upload.error) {
      return new Response(JSON.stringify({ error: "UPLOAD_ERROR", detail: upload.error.message }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    const { data: pub } = admin.storage.from("li-assets").getPublicUrl(path);
    const publicUrl = pub.publicUrl;

    // Debit credits
    const correlation_id = await corrId(user.id, prompt);
    await admin.from("credits_ledger").insert({
      user_id: user.id,
      delta: -COST,
      kind: "debit",
      correlation_id,
      note: "linkedin.ai_image",
      metadata: { channel: "linkedin", action: "ai_image", size: finalSize, model: IMAGE_MODEL },
    });

    // Updated balance
    const { data: wal2 } = await admin
      .from("wallet").select("balance").eq("user_id", user.id).maybeSingle();

    return new Response(JSON.stringify({
      ok: true,
      image: { publicUrl },
      balance: wal2?.balance ?? (balance - COST),
    }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Unexpected error" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" }
    });
  }
});
