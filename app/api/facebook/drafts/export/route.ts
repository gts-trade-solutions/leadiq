import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const user = await requireUser();
  const r = await supabaseService()
    .from("content_drafts")
    .select("id,title,body,media_urls,share_url,status,scheduled_at,updated_at,created_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  if (r.error) return NextResponse.json({ ok: false, error: r.error.message }, { status: 400 });

  const blob = JSON.stringify({ exported_at: new Date().toISOString(), drafts: r.data }, null, 2);
  return new NextResponse(blob, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="facebook-drafts-${Date.now()}.json"`,
    },
  });
}
