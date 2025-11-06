// app/api/track/click/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const c = url.searchParams.get("c"); // campaign_id
  const t = url.searchParams.get("t"); // tracking_token
  const u = url.searchParams.get("u"); // encoded target URL

  const fallback = process.env.APP_URL || "https://example.com";
  const target = safeTarget(u) ?? fallback;

  if (c && t) {
    try {
      // Atomic: sets clicked_at on first click, increments clicks_count, touches last_event_at
      await supabaseAdmin.rpc("cr_mark_click", { p_campaign: c, p_token: t });
    } catch (e) {
      console.error("cr_mark_click error", e);
    }
  }

  return NextResponse.redirect(target, { status: 302 });
}

function safeTarget(u: string | null) {
  if (!u) return null;
  try {
    const decoded = decodeURIComponent(u);
    if (!/^https?:\/\//i.test(decoded)) return null; // allow only http(s)
    return decoded;
  } catch {
    return null;
  }
}
