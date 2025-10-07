// app/api/analytics/track/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await requireUser();
  const { provider = "app", event_type, payload = null } = await req.json();
  if (!event_type)
    return NextResponse.json(
      { ok: false, error: "event_type required" },
      { status: 400 }
    );

  const r = await supabaseService().from("analytics_events").insert({
    user_id: user.id,
    provider,
    event_type,
    payload,
  });
  if (r.error)
    return NextResponse.json(
      { ok: false, error: r.error.message },
      { status: 400 }
    );
  return NextResponse.json({ ok: true });
}
