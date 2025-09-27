import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(
  _req: Request,
  { params }: { params: { company_id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const company_id = decodeURIComponent(params.company_id);

  const { data: company } = await supabase
    .from("companies")
    .select(
      `
      company_id, company_name, legal_name, trading_name, company_type, size, website,
      head_office_address, city_regency, country, postal_code, phone_main, email_general,
      linkedin, notes, company_profile, financial_reports, forecast_value
    `
    )
    .eq("company_id", company_id)
    .maybeSingle();

  const { data: contacts } = await supabase
    .from("contacts")
    .select(
      "id, contact_name, title, department, email, phone, linkedin_url, facebook_url, instagram_url, notes"
    )
    .eq("company_id", company_id);

  const ids = (contacts ?? []).map((c) => c.id);

  let unlockedIds = new Set<string>();
  if (ids.length > 0) {
    const { data: unlockedRows } = await supabase
      .from("contacts_unlocks")
      .select("contact_id")
      .eq("user_id", user.id)
      .in("contact_id", ids);
    unlockedIds = new Set(
      (unlockedRows ?? []).map((r) => r.contact_id as string)
    );
  }

  // company asset unlock flags
  const { data: assetsRows } = await supabase
    .from("company_assets_unlocks")
    .select("asset")
    .eq("user_id", user.id)
    .eq("company_id", company_id);

  const assets = {
    financials_unlocked: !!assetsRows?.find((a) => a.asset === "financials"),
    forecast_unlocked: !!assetsRows?.find((a) => a.asset === "forecast"),
    mgmt_pack_unlocked: !!assetsRows?.find((a) => a.asset === "mgmt_pack"),
  };

  // Contacts: only return unlocked ones
  const contacts_unlocked = (contacts ?? []).filter((c) =>
    unlockedIds.has(c.id)
  );
  // Mask company sensitive fields if not unlocked
  const company_out = company
    ? {
        ...company,
        financial_reports: assets.financials_unlocked
          ? company.financial_reports
          : null,
        forecast_value: assets.forecast_unlocked
          ? company.forecast_value
          : null,
      }
    : null;

  return NextResponse.json({
    company: company_out,
    assets,
    contacts: contacts_unlocked,
    counts: {
      total: contacts?.length ?? 0,
      unlocked: contacts_unlocked.length,
    },
  });
}
