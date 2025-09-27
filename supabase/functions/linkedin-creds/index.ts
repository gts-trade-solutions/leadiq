// supabase/functions/linkedin-creds/index.ts
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // Authenticated client using the caller's JWT
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });

    // 1) Who is the caller?
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user ?? null;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    // 2) Read their saved LinkedIn account (may be null)
    const { data: acct, error: acctErr } = await supabase
      .from("social_accounts")
      .select("access_token, expires_at, scope, member_urn, org_urns")
      .eq("user_id", user.id)
      .eq("provider", "linkedin")
      .maybeSingle();

    if (acctErr) throw acctErr;

    // 3) Compute connection flags
    const now = Date.now();
    const expMs = acct?.expires_at ? Date.parse(acct.expires_at) : 0;
    const tokenValid = !!acct?.access_token && (!expMs || expMs - now > 60_000); // 60s buffer

    const connected = !!acct && tokenValid;
    // OIDC path: can_post is true iff we have a member_urn
    const can_post = connected && !!acct?.member_urn;

    // 4) How many “changes” left (disconnects / identity switches)
    const { data: usage } = await supabase
      .from("social_connection_usage")
      .select("changes_used")
      .eq("user_id", user.id)
      .eq("provider", "linkedin")
      .maybeSingle();

    const used = usage?.changes_used ?? 0;
    const changes_left = Math.max(0, 2 - used);

    // 5) Return status
    return new Response(JSON.stringify({
      connected,
      can_post,
      member_urn: acct?.member_urn ?? null,
      org_urns: acct?.org_urns ?? [],
      expires_at: acct?.expires_at ?? null,
      changes_left,
    }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Unexpected error" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" }
    });
  }
});
