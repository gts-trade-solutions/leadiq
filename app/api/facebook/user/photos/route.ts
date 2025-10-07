import { NextRequest, NextResponse } from "next/server";
import { FB_VER, appsecret_proof, requireUserAndFbToken } from "../../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    const { accessToken } = await requireUserAndFbToken();
    const u = new URL(`https://graph.facebook.com/${FB_VER}/me/photos`);
    u.searchParams.set("type", "uploaded");
    u.searchParams.set("fields", "id,link,permalink_url,picture,images");
    u.searchParams.set("limit", "24");
    u.searchParams.set("access_token", accessToken);
    u.searchParams.set("appsecret_proof", appsecret_proof(accessToken));
    const r = await fetch(u); const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "Graph error");
    return NextResponse.json({ ok: true, data: j.data || [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 400 });
  }
}
