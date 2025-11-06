// supabase/functions/facebook-disconnect/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


export const cors = (res: Response) =>
  new Response(res.body, {
    ...res,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      ...(res.headers || {})
    }
  });

export const ok = (data: any, init: number = 200) => cors(new Response(JSON.stringify(data), { status: init, headers: { "Content-Type": "application/json" }}));
export const bad = (msg: string, code = 400, extra?: any) => ok({error: msg, ...extra}, code);

serve(async (req) => {
  if (req.method === "OPTIONS")
    return cors(new Response(null, { status: 204 }));

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return bad("Missing Authorization", 401);
  const jwt = authHeader.replace("Bearer ", "");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser(jwt);
  if (!user) return bad("Unauthorized", 401);

  // Check and increment limit
  const { data: lim } = await supabase
    .from("social_account_limits")
    .select("changes_used, changes_limit")
    .eq("user_id", user.id)
    .eq("provider", "facebook")
    .maybeSingle();

  if (lim && lim.changes_used >= lim.changes_limit) {
    return bad("Change limit reached", 429, { code: "CHANGE_LIMIT" });
  }

  await supabase.from("social_account_limits").upsert({
    user_id: user.id,
    provider: "facebook",
    changes_used: (lim?.changes_used ?? 0) + 1,
  });

  // Remove account row
  await supabase
    .from("social_accounts")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", "facebook");

  return ok({ ok: true });
});
