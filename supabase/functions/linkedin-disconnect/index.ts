// supabase/functions/linkedin-disconnect/index.ts
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
} as const;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user ?? null;
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type":"application/json" } });

    // Enforce limit
    const { data: usage0 } = await supabase
      .from("social_connection_usage")
      .select("changes_used")
      .eq("user_id", user.id)
      .eq("provider","linkedin")
      .maybeSingle();
    const used0 = usage0?.changes_used ?? 0;
    const left0 = Math.max(0, 2 - used0);
    if (left0 <= 0) {
      return new Response(JSON.stringify({ error: "CHANGE_LIMIT", changes_left: 0 }), {
        status: 403, headers: { ...cors, "Content-Type":"application/json" }
      });
    }

    // Delete account row
    await supabase.from("social_accounts")
      .delete()
      .eq("user_id", user.id)
      .eq("provider","linkedin");

    // Increment usage
    await supabase.from("social_connection_usage").upsert({
      user_id: user.id, provider: "linkedin",
      changes_used: used0 + 1, updated_at: new Date().toISOString()
    });

    const changes_left = Math.max(0, 2 - (used0 + 1));
    return new Response(JSON.stringify({ ok: true, changes_left }), { status: 200, headers: { ...cors, "Content-Type":"application/json" } });

  } catch (e:any) {
    return new Response(JSON.stringify({ error: e?.message || "Unexpected error" }), { status: 500, headers: { ...cors, "Content-Type":"application/json" } });
  }
});
