import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);


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
