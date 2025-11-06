// supabase/functions/facebook-oauth-start/index.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const cors = (res: Response) =>
  new Response(res.body, {
    ...res,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      ...(res.headers || {}),
    },
  });

export const ok = (data: any, init: number = 200) =>
  cors(
    new Response(JSON.stringify(data), {
      status: init,
      headers: { "Content-Type": "application/json" },
    })
  );
export const bad = (msg: string, code = 400, extra?: any) =>
  ok({ error: msg, ...extra }, code);

serve(async (req) => {
  if (req.method === "OPTIONS")
    return cors(new Response(null, { status: 204 }));

  const FACEBOOK_APP_ID = (Deno.env.get("FACEBOOK_APP_ID") || "").trim();
  if (!/^\d{5,20}$/.test(FACEBOOK_APP_ID)) {
    return bad("FACEBOOK_APP_ID env missing or malformed", 500, {
      hint: "Set a numeric App ID in Supabase → Functions → Variables and redeploy.",
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const FACEBOOK_SCOPES = Deno.env.get("FACEBOOK_SCOPES")!;
  const FACEBOOK_REDIRECT_URI = Deno.env.get("FACEBOOK_REDIRECT_URI")!;
  const FB_API_VERSION = Deno.env.get("FB_API_VERSION") || "v19.0";

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return bad("Missing Authorization", 401);
  const jwt = authHeader.replace("Bearer ", "");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const {
    data: { user },
    error: uerr,
  } = await supabase.auth.getUser(jwt);
  if (uerr || !user) return bad("Unauthorized", 401);

  // Enforce change limit before starting (optional soft-check)
  const { data: lim } = await supabase
    .from("social_account_limits")
    .select("changes_used, changes_limit")
    .eq("user_id", user.id)
    .eq("provider", "facebook")
    .maybeSingle();

  if (lim && lim.changes_used >= lim.changes_limit) {
    return bad("Change limit reached", 429, { code: "CHANGE_LIMIT" });
  }

  const state = crypto.randomUUID();

  // Save oauth state
  await supabase.from("social_oauth_states").insert({
    state,
    user_id: user.id,
    provider: "facebook",
  });

  const url = new URL(
    `https://www.facebook.com/${FB_API_VERSION}/dialog/oauth`
  );
  url.searchParams.set("client_id", FACEBOOK_APP_ID);
  url.searchParams.set("redirect_uri", FACEBOOK_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", FACEBOOK_SCOPES);

  return ok({ url: url.toString() });
});
