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
const ok = (data:any, code=200)=>cors(new Response(JSON.stringify(data),{status:code,headers:{'Content-Type':'application/json'}}));
const bad = (m:string,code=400)=>ok({error:m},code);

serve(async (req) => {
  if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return bad("Missing Authorization", 401);
  const jwt = authHeader.replace("Bearer ","");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { global: { headers: { Authorization: `Bearer ${jwt}` }}});

  const { data: { user } } = await supabase.auth.getUser(jwt);
  if (!user) return bad("Unauthorized", 401);

  const body = await req.json().catch(()=>({}));
  const page_id = (body.page_id||'').trim();
  const page_name = (body.page_name||null);

  if (!page_id) return bad("Missing page_id");

  // ensure account exists
  const { data: acc } = await supabase
    .from("social_accounts")
    .select("page_ids")
    .eq("user_id", user.id).eq("provider","facebook").maybeSingle();
  if (!acc) return bad("Not connected", 400);
  if (Array.isArray(acc.page_ids) && acc.page_ids.length && !acc.page_ids.includes(page_id)) {
    return bad("Page not available for this user", 400);
  }

  const { error } = await supabase
    .from("social_accounts")
    .update({ selected_page_id: page_id, selected_page_name: page_name, updated_at: new Date().toISOString() })
    .eq("user_id", user.id).eq("provider","facebook");
  if (error) return bad(error.message);

  return ok({ ok:true, selected_page_id: page_id, selected_page_name: page_name });
});
