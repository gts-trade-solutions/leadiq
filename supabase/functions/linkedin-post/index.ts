// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
} as const;

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SRK  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const COST = Number(Deno.env.get("PER_CREDIT_PUBLISH") ?? "1");

async function fetchJSON(url: string, init: RequestInit) {
  const r = await fetch(url, init);
  const t = await r.text();
  if (!r.ok) throw new Error(t);
  try { return JSON.parse(t); } catch { return t; }
}

type Body = { text:string; target?: "member"|string; visibility?: "PUBLIC"|"CONNECTIONS"; imageUrl?: string };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error:"Method Not Allowed" }), { status: 405, headers: { ...cors, "Content-Type":"application/json" } });

  try {
    const authed = createClient(URL, ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: u } = await authed.auth.getUser();
    if (!u?.user) return new Response(JSON.stringify({ error:"Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type":"application/json" } });

    const body: Body = await req.json().catch(()=>({} as any));
    const text = (body?.text ?? "").trim();
    if (!text) return new Response(JSON.stringify({ error:"MISSING_TEXT" }), { status: 400, headers: { ...cors, "Content-Type":"application/json" } });
    const visibility = body?.visibility ?? "PUBLIC";

    const admin = createClient(URL, SRK);
    const { data: sa } = await admin.from("social_accounts")
      .select("access_token, member_urn, org_urns")
      .eq("user_id", u.user.id).eq("provider","linkedin").maybeSingle();

    if (!sa?.access_token) return new Response(JSON.stringify({ error:"NOT_CONNECTED" }), { status: 400, headers: { ...cors, "Content-Type":"application/json" } });
    if (!sa?.member_urn)   return new Response(JSON.stringify({ error:"NEED_IDENTITY_SCOPE", message:"Enable r_liteprofile and reconnect." }), { status: 400, headers: { ...cors, "Content-Type":"application/json" } });

    const owner = (body?.target && body.target !== "member") ? body.target : sa.member_urn;

    // wallet check
    const { data: wal } = await admin.from("wallet").select("balance").eq("user_id", u.user.id).maybeSingle();
    const balance = wal?.balance ?? 0;
    if (balance < COST) return new Response(JSON.stringify({ error:"INSUFFICIENT_CREDITS", balance }), { status: 402, headers: { ...cors, "Content-Type":"application/json" } });

    const token = sa.access_token;

    // Optional image -> register + upload
    let imageAssetUrn: string | undefined;
    if (body?.imageUrl) {
      const imgRes = await fetch(body.imageUrl);
      if (!imgRes.ok) return new Response(JSON.stringify({ error:"IMAGE_FETCH_FAILED" }), { status: 400, headers: { ...cors, "Content-Type":"application/json" } });
      const imgBytes = new Uint8Array(await imgRes.arrayBuffer());

      const register = await fetchJSON("https://api.linkedin.com/v2/assets?action=registerUpload", {
        method:"POST",
        headers:{
          "Authorization":`Bearer ${token}`,
          "Content-Type":"application/json",
          "X-Restli-Protocol-Version":"2.0.0"
        },
        body: JSON.stringify({
          registerUploadRequest: {
            owner, recipes:["urn:li:digitalmediaRecipe:feedshare-image"],
            serviceRelationships:[{ relationshipType:"OWNER", identifier:"urn:li:userGeneratedContent" }],
            supportedUploadMechanism:["SYNCHRONOUS_UPLOAD"]
          }
        })
      });

      const uploadUrl = register?.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
      imageAssetUrn = register?.value?.asset;
      if (!uploadUrl || !imageAssetUrn) throw new Error("REGISTER_UPLOAD_FAILED");

      const up = await fetch(uploadUrl, { method:"PUT", headers:{ "Content-Type":"image/png" }, body: imgBytes });
      if (!up.ok) throw new Error("UPLOAD_TO_LINKEDIN_FAILED");
    }

    // Create UGC post
    const ugc = await fetchJSON("https://api.linkedin.com/v2/ugcPosts", {
      method:"POST",
      headers:{
        "Authorization":`Bearer ${token}`,
        "Content-Type":"application/json",
        "X-Restli-Protocol-Version":"2.0.0"
      },
      body: JSON.stringify({
        author: owner,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text },
            shareMediaCategory: imageAssetUrn ? "IMAGE" : "NONE",
            media: imageAssetUrn ? [{ status:"READY", media:imageAssetUrn }] : []
          }
        },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": visibility }
      })
    });
    const postUrn = ugc?.id || ugc?.urn || null;

    // Debit credits
    const correlation_id = `li-publish-${crypto.randomUUID()}`;
    await admin.from("credits_ledger").insert({
      user_id: u.user.id, delta: -COST, kind:"debit", correlation_id,
      note:"linkedin.publish_post", metadata:{ owner, image: !!imageAssetUrn }
    });

    await admin.from("linkedin_posts").insert({
      user_id: u.user.id, target_urn: owner, text,
      image_asset_urn: imageAssetUrn ?? null, li_post_urn: postUrn,
      status:"sent", metadata:{ visibility }
    });

    const { data: w2 } = await admin.from("wallet").select("balance").eq("user_id", u.user.id).maybeSingle();
    return new Response(JSON.stringify({ ok:true, postUrn, balance: w2?.balance ?? (balance - COST) }), { status: 200, headers: { ...cors, "Content-Type":"application/json" } });

  } catch (e:any) {
    return new Response(JSON.stringify({ error:e?.message || "Unexpected" }), { status: 500, headers: { ...cors, "Content-Type":"application/json" } });
  }
});
