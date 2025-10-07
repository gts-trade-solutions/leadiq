import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const FB_V = "v23.0";

export async function POST(req: NextRequest) {
  const user = await requireUser();
  const svc = supabaseService();

  const { data: row } = await svc.from("social_accounts")
    .select("access_token, fb_user_id")
    .eq("user_id", user.id).eq("provider", "facebook").single();

  if (row?.access_token) {
    const u = new URL(`https://graph.facebook.com/${FB_V}/me/permissions`);
    u.searchParams.set("access_token", row.access_token);
    try { await fetch(u.toString(), { method: "DELETE" }); } catch {}
  }

  await svc.from("social_accounts").delete().eq("user_id", user.id).eq("provider", "facebook");
  return NextResponse.json({ ok: true });
}
