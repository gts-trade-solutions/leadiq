import { NextRequest, NextResponse } from "next/server";
import { FB_VER, appsecret_proof, requireUserAndFbToken } from "../../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const after = searchParams.get("after") || undefined;
    const limit = Math.min(
      25,
      Math.max(1, parseInt(searchParams.get("limit") || "10", 10))
    );
    const { accessToken } = await requireUserAndFbToken();

    const url = new URL(`https://graph.facebook.com/${FB_VER}/me/posts`);
    url.searchParams.set(
      "fields",
      "id,created_time,message,permalink_url,attachments{media_type,media,url,media_url,subattachments{media}}"
    );
    url.searchParams.set("limit", String(limit));
    if (after) url.searchParams.set("after", after);
    url.searchParams.set("access_token", accessToken);
    url.searchParams.set("appsecret_proof", appsecret_proof(accessToken));

    const res = await fetch(url.toString());
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || "Graph error");

    return NextResponse.json({
      ok: true,
      data: json.data || [],
      paging: json.paging || null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: e.status || 400 }
    );
  }
}
