import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  const limit = Math.min(
    50,
    Math.max(
      1,
      parseInt(new URL(req.url).searchParams.get("limit") || "20", 10)
    )
  );
  const r = await supabaseService()
    .from("content_drafts")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (r.error)
    return NextResponse.json(
      { ok: false, error: r.error.message },
      { status: 400 }
    );
  return NextResponse.json({ ok: true, data: r.data });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  const body = await req.json();
  const {
    title = "",
    body: text = "",
    media_urls = [],
    share_url = null,
    status = "draft",
    scheduled_at = null,
  } = body || {};
  const r = await supabaseService()
    .from("content_drafts")
    .insert({
      user_id: user.id,
      title,
      body: text,
      media_urls,
      share_url,
      status,
      scheduled_at,
    })
    .select()
    .single();
  if (r.error)
    return NextResponse.json(
      { ok: false, error: r.error.message },
      { status: 400 }
    );
  return NextResponse.json({ ok: true, data: r.data });
}
