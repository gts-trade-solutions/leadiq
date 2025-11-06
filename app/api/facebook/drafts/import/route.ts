import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await requireUser();
  const body = await req.json().catch(() => null);
  const items = (body?.drafts || body) as any[];
  if (!Array.isArray(items) || !items.length) {
    return NextResponse.json({ ok: false, error: "No drafts to import" }, { status: 400 });
  }

  const rows = items.map(d => ({
    user_id: user.id,
    title: d.title || "",
    body: d.body || "",
    media_urls: Array.isArray(d.media_urls) ? d.media_urls : [],
    share_url: d.share_url || null,
    status: d.status || "draft",
    scheduled_at: d.scheduled_at || null,
  }));

  const r = await supabaseService().from("content_drafts").insert(rows).select("id");
  if (r.error) return NextResponse.json({ ok: false, error: r.error.message }, { status: 400 });

  return NextResponse.json({ ok: true, imported: r.data.length });
}
