import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BUCKET = "fb-private";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  const path = new URL(req.url).searchParams.get("path") || "";
  if (!path.startsWith(`${user.id}/`)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseService().storage.from(BUCKET).createSignedUrl(path, 600);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, url: data.signedUrl });
}
