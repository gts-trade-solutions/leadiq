// app/api/auth/signout/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST() {
  const supabase = createRouteHandlerClient({ cookies });
  await supabase.auth.signOut();          // clears server cookies
  return NextResponse.json({ ok: true }); // no redirect here
}
