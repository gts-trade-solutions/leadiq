// app/api/facebook/callback/route.ts
import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { supabaseService } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";
import { getBaseUrl } from "@/lib/baseUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FB_V = "v23.0";
const APP_ID = process.env.FACEBOOK_APP_ID!;
const APP_SECRET = process.env.FACEBOOK_APP_SECRET!;
const hmac = (t: string) => crypto.createHmac("sha256", APP_SECRET).update(t).digest("hex");

function html(payload: any) {
  const safe = JSON.stringify(payload);
  const ok = payload?.status === "ok";
  return new Response(
    `<!doctype html><meta charset="utf-8"/><title>${ok ? "Facebook Connected" : "Facebook Connect Failed"}</title>
     <style>body{margin:0;background:#0b1220;color:#d6e3ff;font:16px system-ui;display:grid;place-items:center;min-height:100vh}
     .c{width:min(560px,92vw);background:#0e1629;border:1px solid #1e2a44;border-radius:16px;padding:28px}</style>
     <script>(function(){var d=${safe};try{if(window.opener&&!window.opener.closed){window.opener.postMessage(Object.assign({source:'fb_oauth'},d),'*')}}catch(e){}})()</script>
     <body><div class="c"><h2>${ok ? "Connected ✔" : "Error ✖"}</h2><p>${ok ? ("Connected as <b>"+(payload?.user?.name||payload?.user?.id)+"</b>") : (payload?.error||"Unknown error")}</p>
     <p><a href="/" style="color:#8ab4ff">Return to app</a></p></div></body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET(req: NextRequest) {
  // Read signed-in user from cookies via the helper
  const user = await requireUser();

  const qp = new URL(req.url).searchParams;
  const code = qp.get("code");
  const returnedState = qp.get("state");
  const fbErr = qp.get("error");
  if (fbErr) return html({ status: "error", error: fbErr });
  if (!code) return html({ status: "error", error: "Missing code" });

  // Validate state cookie
  const cookieState = cookies().get("fb_oauth_state")?.value;
  cookies().delete("fb_oauth_state");
  if (!cookieState || cookieState !== returnedState) {
    return html({ status: "error", error: "Invalid state" });
  }

  // ✅ Consume state row atomically and WITHOUT .catch chaining
  const svc = supabaseService();
  const resp = await svc
    .from("social_oauth_states")
    .delete()
    .eq("state", returnedState)
    .select("state,user_id,provider")
    .single();

  if (resp.error || !resp.data || resp.data.user_id !== user.id) {
    return html({ status: "error", error: "State mismatch or missing" });
  }

  const base = getBaseUrl(req);
  const redirectUri = `${base}/api/facebook/callback`;

  // Exchange short-lived token
  const url1 = new URL(`https://graph.facebook.com/${FB_V}/oauth/access_token`);
  url1.searchParams.set("client_id", APP_ID);
  url1.searchParams.set("client_secret", APP_SECRET);
  url1.searchParams.set("redirect_uri", redirectUri);
  url1.searchParams.set("code", code);
  const r1 = await fetch(url1);
  const j1 = await r1.json();
  if (!r1.ok || !j1.access_token) {
    return html({ status: "error", error: j1?.error?.message || "Token exchange failed" });
  }

  // Upgrade to long-lived token
  const url2 = new URL(`https://graph.facebook.com/${FB_V}/oauth/access_token`);
  url2.searchParams.set("grant_type", "fb_exchange_token");
  url2.searchParams.set("client_id", APP_ID);
  url2.searchParams.set("client_secret", APP_SECRET);
  url2.searchParams.set("fb_exchange_token", j1.access_token);
  const r2 = await fetch(url2);
  const j2 = await r2.json();

  const accessToken: string = j2.access_token || j1.access_token;
  const expiresIn = j2.expires_in || j1.expires_in || 60 * 24 * 60 * 60;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  // Fetch basic profile
  const meUrl = new URL(`https://graph.facebook.com/${FB_V}/me`);
  meUrl.searchParams.set("fields", "id,name,email,link,location");
  meUrl.searchParams.set("access_token", accessToken);
  meUrl.searchParams.set("appsecret_proof", hmac(accessToken));
  const meRes = await fetch(meUrl);
  const me = await meRes.json();
  if (!meRes.ok || !me?.id) {
    return html({ status: "error", error: me?.error?.message || "Failed to fetch /me" });
  }

  // Upsert into social_accounts (no .catch chaining)
  const up = await svc.from("social_accounts").upsert(
    {
      user_id: user.id,
      provider: "facebook",
      scope: [
        "public_profile",
        "email",
        "user_posts",
        "user_likes",
        "user_link",
        "user_location",
        "user_photos",
        "user_videos",
      ],
      access_token: accessToken,
      refresh_token: null,
      expires_at: expiresAt,
      fb_user_id: me.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" }
  );
  if (up.error) return html({ status: "error", error: up.error.message || "Save failed" });

  return html({ status: "ok", user: { id: me.id, name: me.name, email: me.email || null } });
}
