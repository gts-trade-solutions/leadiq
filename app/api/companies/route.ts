import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from 'next/headers';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const normStr = (v: unknown) =>
  typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v ?? null;
const toNumberOrNull = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function isAdmin(supabase: ReturnType<typeof createRouteHandlerClient>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  // app_metadata.roles OR profiles.role === 'admin'
  const metaRoles = (user.app_metadata as any)?.roles;
  if (Array.isArray(metaRoles) && metaRoles.includes("admin")) return true;

  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return prof?.role === "admin";
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Authorization: admin only
    if (!(await isAdmin(supabase))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();

    // Required
    const company_id = normStr(body.company_id);
    const company_name = normStr(body.company_name);
    if (!company_id || !company_name) {
      return NextResponse.json(
        { error: "company_id and company_name are required" },
        { status: 400 }
      );
    }

    // Normalize all fields you send from the form
    const payload = {
      company_id: String(company_id), // conflict key
      company_name: company_name as string,
      legal_name: normStr(body.legal_name),
      trading_name: normStr(body.trading_name),
      company_type: normStr(body.company_type),
      size: normStr(body.size),
      head_office_address: normStr(body.head_office_address),
      city_regency: normStr(body.city_regency),
      country: normStr(body.country),
      postal_code: normStr(body.postal_code),
      website: normStr(body.website),
      phone_main: normStr(body.phone_main),
      email_general: normStr(body.email_general),
      linkedin: normStr(body.linkedin),
      notes: normStr(body.notes),
      company_profile: normStr(body.company_profile),
      financial_reports: normStr(body.financial_reports),
      forecast_value: toNumberOrNull(body.forecast_value),
      // If your table has updated_at, uncomment:
      // updated_at: new Date().toISOString(),
    };

    // Upsert by company_id
    const { data, error } = await supabase
      .from("companies")
      .upsert(payload, { onConflict: "company_id" })
      .select()
      .single();

    if (error) {
      // Surface RLS or constraint issues clearly
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ company: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}


export async function GET() {
  const companies = await supabaseAdmin
    .from('companies')
    .select(`
      company_id,
      legal_name,
      trading_name,
      company_type,
      size,
      city_regency,
      province_id,
      country
    `);

  if (companies.error) {
    return NextResponse.json({ error: companies.error.message }, { status: 500 });
  }

  const counts = await supabaseAdmin
    .from('company_contact_counts')
    .select('company_id, contact_count');

  const countMap = new Map<string, number>(
    (counts.data ?? []).map(r => [r.company_id, r.contact_count])
  );

  const data = (companies.data ?? []).map(row => ({
    company_id: row.company_id,
    name: row.trading_name || row.legal_name || row.company_id, // display name
    companyType: row.company_type ?? '',
    size: row.size ?? '',
    location: [row.city_regency, row.province_id, row.country].filter(Boolean).join(', '),
    contacts: countMap.get(row.company_id) ?? 0
  }));

  return NextResponse.json({ data });
}
