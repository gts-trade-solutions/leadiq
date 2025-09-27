// supabase/functions/facebook-creds/index.ts
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

  const { data: acc } = await supabase
    .from("social_accounts")
    .select("fb_user_id, page_ids, selected_page_id, selected_page_name")
    .eq("user_id", user.id)
    .eq("provider", "facebook")
    .maybeSingle();

  const { data: lim } = await supabase
    .from("social_account_limits")
    .select("changes_used, changes_limit")
    .eq("user_id", user.id)
    .eq("provider", "facebook")
    .maybeSingle();

  const connected = !!acc?.fb_user_id;
  const can_post =
    connected && (acc?.selected_page_id || (acc?.page_ids?.length ?? 0) > 0);

  return ok({
    connected,
    can_post,
    fb_user_id: acc?.fb_user_id ?? null,
    page_ids: acc?.page_ids ?? [],
    selected_page_id: acc?.selected_page_id ?? null,
    selected_page_name: acc?.selected_page_name ?? null,
    changes: { used: lim?.changes_used ?? 0, limit: lim?.changes_limit ?? 2 },
  });
});
