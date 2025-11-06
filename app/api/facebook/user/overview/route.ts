// app/api/facebook/user/overview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireUserAndFbToken, FB_VER, appsecret_proof } from "../../_helpers";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    const { accessToken } = await requireUserAndFbToken();
    const fields = [
      "id",
      "name",
      "email",
      "link",
      "location{name}",
      "hometown{name}",
      "birthday",
      "gender",
      "age_range",
    ].join(",");

    const u = new URL(`https://graph.facebook.com/${FB_VER}/me`);
    u.searchParams.set("fields", fields);
    u.searchParams.set("access_token", accessToken);
    u.searchParams.set("appsecret_proof", appsecret_proof(accessToken));
    const r = await fetch(u.toString());
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "Graph error");

    // Normalize for UI
    const data = {
      ...j,
      location: j.location?.name || null,
      hometown: j.hometown?.name || null,
    };
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
