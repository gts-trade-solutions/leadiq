// supabase/functions/linkedin-oauth-start/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LI_CLIENT_ID = Deno.env.get("LINKEDIN_CLIENT_ID")!;
const LI_REDIRECT = Deno.env.get("LINKEDIN_REDIRECT_URI")!;
const LI_SCOPES = (Deno.env.get("LINKEDIN_SCOPES") || "openid profile w_member_social").trim();

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user ?? null;
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type":"application/json" } });

    // Usage check
    const { data: usage } = await supabase
      .from("social_connection_usage")
      .select("changes_used")
      .eq("user_id", user.id)
      .eq("provider","linkedin")
      .maybeSingle();
    const used = usage?.changes_used ?? 0;
    const left = Math.max(0, 2 - used);
    if (left <= 0) {
      return new Response(JSON.stringify({ error: "CHANGE_LIMIT", changes_left: 0 }), {
        status: 403, headers: { ...cors, "Content-Type":"application/json" }
      });
    }

    const state = crypto.randomUUID();
    await supabase.from("social_oauth_states").insert({ state, user_id: user.id, provider: "linkedin" });

    const params = new URLSearchParams({
      response_type: "code",
      client_id: LI_CLIENT_ID,
      redirect_uri: LI_REDIRECT,
      state,
      scope: LI_SCOPES,
    });

    return new Response(JSON.stringify({
      authUrl: `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`,
      redirectUri: LI_REDIRECT,
      scopes: LI_SCOPES,
      changes_left: left
    }), { status: 200, headers: { ...cors, "Content-Type":"application/json" } });

  } catch (e:any) {
    return new Response(JSON.stringify({ error: e?.message || "Unexpected error" }), { status: 500, headers: { ...cors, "Content-Type":"application/json" } });
  }
});
