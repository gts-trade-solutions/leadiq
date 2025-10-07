// app/api/facebook/user/permissions/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  FB_VER,
  appsecret_proof,
  requireUserAndFbToken,
} from "@/app/api/facebook/_helpers";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    const { accessToken } = await requireUserAndFbToken();
    const u = new URL(`https://graph.facebook.com/${FB_VER}/me/permissions`);
    u.searchParams.set("access_token", accessToken);
    u.searchParams.set("appsecret_proof", appsecret_proof(accessToken));
    const r = await fetch(u.toString());
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "Graph error");
    // return only granted ones
    const granted = (j.data || [])
      .filter((p: any) => p.status === "granted")
      .map((p: any) => p.permission);
    return NextResponse.json({ ok: true, granted });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
