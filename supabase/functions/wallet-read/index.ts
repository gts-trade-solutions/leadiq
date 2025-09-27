// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
} as const;

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const sb = createClient(URL, ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type":"application/json" } });

    const { data } = await sb.from("wallet").select("balance").eq("user_id", u.user.id).maybeSingle();
    return new Response(JSON.stringify({ balance: data?.balance ?? 0 }), { status: 200, headers: { ...cors, "Content-Type":"application/json" } });
  } catch (e:any) {
    return new Response(JSON.stringify({ error: e?.message || "Unexpected" }), { status: 500, headers: { ...cors, "Content-Type":"application/json" } });
  }
});
