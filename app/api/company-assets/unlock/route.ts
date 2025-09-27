import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { company_id, type } = await req.json();
  if (!company_id || !type) {
    return NextResponse.json({ error: "Missing company_id or type" }, { status: 400 });
  }

  try {
    if (type === "financials" || type === "forecast") {
      const { data, error } = await supabase.rpc("unlock_company_asset", {
        p_company_id: company_id, p_asset: type, p_price: 10
      });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : null;
      if (!row || row.status === "INSUFFICIENT_CREDITS") {
        return NextResponse.json(
          { error: "INSUFFICIENT_CREDITS", required: 10, balance: row?.balance ?? 0 },
          { status: 400 }
        );
      }
      return NextResponse.json({ ok: true, message: `Unlocked ${type}`, balance: row.balance });
    }

    if (type === "mgmt_pack") {
      const { data, error } = await supabase.rpc("unlock_company_mgmt_pack", {
        p_company_id: company_id, p_price: 10
      });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : null;
      if (!row || row.status === "INSUFFICIENT_CREDITS") {
        return NextResponse.json(
          { error: "INSUFFICIENT_CREDITS", required: 10, balance: row?.balance ?? 0 },
          { status: 400 }
        );
      }
      return NextResponse.json({
        ok: true,
        message: `Unlocked management pack (${row.unlocked_count} contacts)`,
        balance: row.balance
      });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unlock failed" }, { status: 400 });
  }
}
