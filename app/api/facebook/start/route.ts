// app/api/facebook/start/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { supabaseService } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";
import { getBaseUrl } from "@/lib/baseUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FB_V = "v23.0";
const APP_ID = process.env.FACEBOOK_APP_ID!;

export async function GET(req: NextRequest) {
  // 1) Require a signed-in user (same as your callback)
  const user = await requireUser();

  // 2) Build redirect URI *exactly* the same way as in callback
  const base = getBaseUrl(req); // e.g. http://localhost:3000
  const redirectUri = `${base}/api/facebook/callback`;

  // 3) Scopes (include the extra user_* if you want DOB/gender/etc.)
  const scope = [
    "public_profile",
    "email",
    "user_posts",
    "user_likes",
    "user_link",
    "user_location",
    "user_photos",
    "user_videos",
    "user_gender",
    "user_hometown",
    "user_birthday",
  ].join(",");

  // 4) Create a fresh state
  const state = crypto.randomUUID();

  // 4a) Set the state cookie (Lax works on localhost)
  cookies().set("fb_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: base.startsWith("https"),
    path: "/",
    maxAge: 600, // 10 minutes
  });

  // 4b) Insert a matching state row for this user
  const svc = supabaseService();
  // prune stray old rows (best-effort; ignore error)
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  await svc.from("social_oauth_states").delete().lt("created_at", cutoff);
  await svc.from("social_oauth_states").insert({
    state,
    user_id: user.id,
    provider: "facebook",
  });

  // 5) Build the Facebook auth URL
  const url = new URL(`https://www.facebook.com/${FB_V}/dialog/oauth`);
  url.searchParams.set("client_id", APP_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", scope);
  url.searchParams.set("auth_type", "rerequest"); // forces re-consent if you added scopes
  url.searchParams.set("display", "popup");

  return NextResponse.redirect(url.toString());
}
