import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BUCKET = "fb-private";

export async function POST(req: NextRequest) {
  const user = await requireUser();
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ ok: false, error: "Missing file" }, { status: 400 });

  const safe = (file.name || "upload").replace(/[^a-zA-Z0-9_.-]/g, "_");
  const path = `${user.id}/${Date.now()}-${safe}`;
  const arrayBuf = await file.arrayBuffer();

  const s = supabaseService();
  const { data, error } = await s.storage.from(BUCKET).upload(path, Buffer.from(arrayBuf), {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, path: data!.path });
}
