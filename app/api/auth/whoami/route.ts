// app/api/auth/whoami/route.ts
import { NextResponse } from "next/server";
import { getAuthClient } from "@/lib/auth";
export const dynamic = "force-dynamic";
export async function GET() {
  const supabase = getAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  return NextResponse.json({ user });
}
