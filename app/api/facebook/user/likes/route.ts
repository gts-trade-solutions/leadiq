import { NextRequest, NextResponse } from "next/server";
import { FB_VER, appsecret_proof, requireUserAndFbToken } from "../../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const after = new URL(req.url).searchParams.get("after") || undefined;
    const { accessToken } = await requireUserAndFbToken();
    const u = new URL(`https://graph.facebook.com/${FB_VER}/me/likes`);
    u.searchParams.set("fields", "id,name,category");
    u.searchParams.set("limit", "25");
    if (after) u.searchParams.set("after", after);
    u.searchParams.set("access_token", accessToken);
    u.searchParams.set("appsecret_proof", appsecret_proof(accessToken));
    const r = await fetch(u); const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "Graph error");
    return NextResponse.json({ ok: true, data: j.data || [], paging: j.paging || null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 400 });
  }
}
