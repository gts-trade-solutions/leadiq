import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const r = await supabaseService()
    .from("content_drafts")
    .select("*")
    .eq("user_id", user.id)
    .eq("id", params.id)
    .single();
  if (r.error) return NextResponse.json({ ok: false, error: r.error.message }, { status: 404 });
  return NextResponse.json({ ok: true, data: r.data });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const payload = await req.json();
  payload.updated_at = new Date().toISOString();
  const r = await supabaseService()
    .from("content_drafts")
    .update(payload)
    .eq("user_id", user.id)
    .eq("id", params.id)
    .select()
    .single();
  if (r.error) return NextResponse.json({ ok: false, error: r.error.message }, { status: 400 });
  return NextResponse.json({ ok: true, data: r.data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const r = await supabaseService()
    .from("content_drafts")
    .delete()
    .eq("user_id", user.id)
    .eq("id", params.id);
  if (r.error) return NextResponse.json({ ok: false, error: r.error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
