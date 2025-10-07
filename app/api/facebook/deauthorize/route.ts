// /app/api/facebook/deauthorize/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseService } from "@/lib/supabase";

const APP_SECRET = process.env.FACEBOOK_APP_SECRET!;

function parseSignedRequest(sr: string) {
  const [sigB64, payloadB64] = sr.split(".");
  const b64 = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const expected = crypto.createHmac("sha256", APP_SECRET).update(payloadB64).digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  if (sigB64 !== expected) throw new Error("bad signature");
  return JSON.parse(b64(payloadB64).toString("utf8"));
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const sr = String(form.get("signed_request") || "");
  if (!sr) return NextResponse.json({ error: "missing signed_request" }, { status: 400 });

  try {
    const payload = parseSignedRequest(sr); // { user_id, ... }
    const svc = supabaseService();
    await svc.from("social_accounts").delete().eq("provider", "facebook").eq("fb_user_id", payload.user_id);
    return NextResponse.json({ url: "https://yourapp.example.com/legal/facebook-data-deletion", confirmation_code: crypto.randomUUID() });
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
}

export async function GET() { // for setup checks
  return new Response("ok");
}
