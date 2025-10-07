import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

export const runtime = "nodejs";
const FB_OAUTH_VERSION = "v23.0";
const APP_SECRET = process.env.FACEBOOK_APP_SECRET!;

function appSecretProof(token: string) {
  return crypto.createHmac("sha256", APP_SECRET).update(token).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const pageId = (body?.pageId || "").toString().trim();
    if (!pageId) {
      return NextResponse.json({ ok: false, error: "Missing pageId" }, { status: 400 });
    }

    // Get the long-lived USER token from our HttpOnly cookie (set in callback)
    const userToken = cookies().get("fb_user_token")?.value;
    if (!userToken) {
      return NextResponse.json({ ok: false, error: "Not connected to Facebook" }, { status: 401 });
    }

    // Ask Graph for the PAGE access token for this page
    // Requires scopes: pages_show_list + (recommended) pages_manage_metadata
    const url = new URL(`https://graph.facebook.com/${FB_OAUTH_VERSION}/${pageId}`);
    url.searchParams.set("fields", "id,name,access_token");
    url.searchParams.set("access_token", userToken);
    url.searchParams.set("appsecret_proof", appSecretProof(userToken));

    const res = await fetch(url.toString());
    const json = await res.json();
    if (!res.ok || !json?.access_token) {
      const msg = json?.error?.message || "Failed to fetch Page access token";
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }

    const pageToken: string = json.access_token;
    const pageName: string = json.name || pageId;

    // Store PAGE selection + token in HttpOnly cookies (dev only).
    // In production, store encrypted in your DB.
    const maxAge = 60 * 24 * 60 * 60; // ~60 days
    cookies().set("fb_page_id", pageId, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge });
    cookies().set("fb_page_token", pageToken, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge });

    return NextResponse.json({ ok: true, page: { id: pageId, name: pageName } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
