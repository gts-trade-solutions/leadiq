// supabase/functions/facebook-post/index.ts
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
const ok = (d:any,s=200)=>cors(new Response(JSON.stringify(d),{status:s,headers:{'Content-Type':'application/json'}}));
const bad = (m:string,s=400,extra?:any)=>ok({error:m,...(extra||{})},s);

serve(async (req) => {
  if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const API_VER = Deno.env.get("FB_API_VERSION") || "v19.0";
  const PER_CREDIT = Number(Deno.env.get("PER_FACEBOOK_PUBLISH_CREDITS") ?? Deno.env.get("PER_CREDIT_PUBLISH") ?? 1);

  const auth = req.headers.get("authorization");
  if (!auth) return bad("Missing Authorization", 401);
  const jwt = auth.replace("Bearer ","");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { global:{ headers:{ Authorization:`Bearer ${jwt}` }}});

  const { data:{ user } } = await supabase.auth.getUser(jwt);
  if (!user) return bad("Unauthorized", 401);

  const body = await req.json().catch(()=>({}));
  const message: string = (body.message ?? "").trim();
  let pageId: string | null = body.page_id ?? null;
  const imageUrl: string | null = (body.image_url ?? "").trim() || null;

  if (!message && !imageUrl) return bad("Provide message or image_url");
  if (!pageId) {
    const { data: acc } = await supabase
      .from("social_accounts")
      .select("selected_page_id")
      .eq("user_id", user.id).eq("provider","facebook").maybeSingle();
    pageId = acc?.selected_page_id ?? null;
  }
  if (!pageId) return bad("No page selected", 400);

  // Wallet check
  const { data: wallet } = await supabase.from("wallet").select("balance").eq("user_id", user.id).maybeSingle();
  const balance = wallet?.balance ?? 0;
  if (balance < PER_CREDIT) return bad("INSUFFICIENT_CREDITS", 402, { code:"INSUFFICIENT_CREDITS", needed: PER_CREDIT, balance });

  // Get stored long-lived user token
  const { data: acc2 } = await supabase
    .from("social_accounts").select("access_token")
    .eq("user_id", user.id).eq("provider","facebook").maybeSingle();
  if (!acc2?.access_token) return bad("Not connected", 400);

  // Page access token
  const pageTokenRes = await fetch(`https://graph.facebook.com/${API_VER}/${pageId}?fields=access_token&access_token=${acc2.access_token}`);
  const pageTokenJson = await pageTokenRes.json();
  const pageToken = pageTokenJson?.access_token;
  if (!pageToken) return bad("Failed to get page access token", 400);

  // ---- Publish ----
  let postId: string | null = null;
  let fbResp: any = null;

  if (imageUrl) {
    // Photo post (image + caption). This creates a photo AND a post_id we can show.
    const form = new URLSearchParams({
      url: imageUrl,
      caption: message || "",
      published: "true",
      access_token: pageToken
    });
    const r = await fetch(`https://graph.facebook.com/${API_VER}/${pageId}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form
    });
    fbResp = await r.json();
    if (!r.ok) return bad("Facebook photo post failed", 400, { fb: fbResp });
    postId = (fbResp.post_id as string) || (fbResp.id as string) || null;
  } else {
    // Text-only post to /feed
    const r = await fetch(`https://graph.facebook.com/${API_VER}/${pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ message, access_token: pageToken })
    });
    fbResp = await r.json();
    if (!r.ok || !fbResp.id) return bad("Facebook feed post failed", 400, { fb: fbResp });
    postId = fbResp.id as string;
  }

  // Permalink (nice to have)
  let permalink: string | null = null;
  if (postId) {
    const pr = await fetch(`https://graph.facebook.com/${API_VER}/${postId}?fields=permalink_url&access_token=${pageToken}`);
    const pj = await pr.json();
    if (pr.ok && pj?.permalink_url) permalink = pj.permalink_url as string;
  }

  // Debit credits (idempotent by correlation_id)
  const correlation_id = `fb-post-${user.id}-${postId ?? crypto.randomUUID()}`;
  await supabase.from("credits_ledger").insert({
    user_id: user.id,
    delta: -PER_CREDIT,
    kind: "debit",
    correlation_id,
    note: "Facebook publish"
  }).select().maybeSingle();

  // Log
  await supabase.from("facebook_posts").insert({
    user_id: user.id,
    page_id: pageId!,
    fb_post_id: postId ?? undefined,
    text: message || "",
    image_url: imageUrl || undefined,
    status: "sent",
    metadata: fbResp
  });

  return ok({ ok: true, id: postId, permalink });
});
