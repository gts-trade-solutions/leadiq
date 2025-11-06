import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const user = await requireUser();
  const { data } = await supabaseService()
    .from("social_accounts")
    .select("fb_page_id, page_name, page_access_token")
    .eq("user_id", user.id).eq("provider","facebook").single();
  return NextResponse.json({ ok: true, page: data?.fb_page_id ? { id: data.fb_page_id, name: data.page_name || "", hasToken: !!data.page_access_token } : null });
}
