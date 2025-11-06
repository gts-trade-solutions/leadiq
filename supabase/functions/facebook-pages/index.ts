import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function cors(res: Response) {
  return new Response(res.body, {
    ...res,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      ...(res.headers || {})
    }
  });
}
const ok = (d:any, s=200)=>cors(new Response(JSON.stringify(d),{status:s,headers:{'Content-Type':'application/json'}}));
const bad = (m:string,s=400)=>ok({error:m},s);

serve(async (req) => {
  if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const API_VER = Deno.env.get("FB_API_VERSION") || "v19.0";

  const auth = req.headers.get("authorization");
  if (!auth) return bad("Missing Authorization", 401);
  const jwt = auth.replace("Bearer ","");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { global:{ headers:{ Authorization:`Bearer ${jwt}` }}});

  const { data: { user } } = await supabase.auth.getUser(jwt);
  if (!user) return bad("Unauthorized", 401);

  const { data: acc } = await supabase
    .from("social_accounts")
    .select("access_token")
    .eq("user_id", user.id).eq("provider","facebook").maybeSingle();
  if (!acc?.access_token) return bad("Not connected", 400);

  // Fetch id, name, and page access token (needed to show names reliably)
  const r = await fetch(`https://graph.facebook.com/${API_VER}/me/accounts?fields=id,name,category&access_token=${acc.access_token}`);
  const j = await r.json();
  if (!r.ok) return bad("Failed to list pages", 400);

  // Return compact structure; UI can show names and IDs
  const pages = Array.isArray(j.data) ? j.data.map((p:any)=>({ id:p.id, name:p.name, category:p.category })) : [];

  // Optionally keep IDs in social_accounts.page_ids in sync
  await supabase.from("social_accounts").update({ page_ids: pages.map(p=>p.id) })
    .eq("user_id", user.id).eq("provider","facebook");

  return ok({ pages });
});
