import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { CompanyRow, type CompanyRowT } from '@/lib/schemas';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // server-only
  { auth: { persistSession: false } }
);


const headerAliases: Record<string, string> = {
  'Legal Name': 'legal_name',
  'Trading Name': 'trading_name',
  'Company Type': 'company_type',
  'Website': 'website',
  'Head Office Address': 'head_office_address',
  'City/Regency': 'city_regency',
  'Province (ID)': 'province_id',
  'Postal Code': 'postal_code',
  'Country': 'country',
  'Phone (Main)': 'phone_main',
  'Email (General)': 'email_general',
  'LinkedIn': 'linkedin',
  // snake_case keys accepted as-is (company_id, size, notes, etc.)
};

function readFirstSheetToJson(buffer: ArrayBuffer) {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
}

function normalizeUrl(s: string) {
  const v = (s || '').trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function toSnakeCaseIfAliased(row: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) out[headerAliases[k] ?? k] = v;
  return out;
}

function trimOrEmpty(v: any) {
  return (v ?? '').toString().trim();
}
function displayName(trading: string, legal: string, id: string) {
  return (trading || '').trim() || (legal || '').trim() || id;
}
function chunk<T>(arr: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry_run') === 'true';

  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 });

  const buf = await file.arrayBuffer();
  const rowsRaw = readFirstSheetToJson(buf);

  // keep two arrays: validated rows (schema fields) and rows to upsert (schema + company_name)
  const valid: CompanyRowT[] = [];
  const toUpsert: Record<string, any>[] = [];
  const errors: { row: number; error: string }[] = [];

  rowsRaw.forEach((raw, i) => {
    const r = toSnakeCaseIfAliased(raw);

    const normalized = {
      company_id: trimOrEmpty(r.company_id),

      legal_name: trimOrEmpty(r.legal_name),
      trading_name: trimOrEmpty(r.trading_name),

      company_type: trimOrEmpty(r.company_type),
      size: trimOrEmpty(r.size),

      website: normalizeUrl(trimOrEmpty(r.website)),
      head_office_address: trimOrEmpty(r.head_office_address),
      city_regency: trimOrEmpty(r.city_regency),
      province_id: trimOrEmpty(r.province_id),
      postal_code: trimOrEmpty(r.postal_code),
      country: trimOrEmpty(r.country),

      phone_main: trimOrEmpty(r.phone_main),
      email_general: trimOrEmpty(r.email_general),
      linkedin: normalizeUrl(trimOrEmpty(r.linkedin)),

      notes: trimOrEmpty(r.notes),
    };

    const parsed = CompanyRow.safeParse(normalized);
    if (parsed.success) {
      valid.push(parsed.data);
      // 🔑 ensure NOT NULL column is set
      const company_name = displayName(parsed.data.trading_name, parsed.data.legal_name, parsed.data.company_id);
      toUpsert.push({ ...parsed.data, company_name }); // add extra column for DB
    } else {
      errors.push({
        row: i + 2,
        error: parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')
      });
    }
  });

  let inserted = 0;
  if (!dryRun && toUpsert.length) {
    for (const group of chunk(toUpsert, 500)) {
      const { data, error } = await supabaseAdmin
        .from('companies')
        .upsert(group, { onConflict: 'company_id' })
        .select('company_id');

      if (error) errors.push({ row: -1, error: `batch insert failed: ${error.message}` });
      else inserted += data?.length ?? 0;
    }
  }

  return NextResponse.json({
    dryRun,
    parsed: valid.length + errors.length,
    valid: valid.length,
    inserted: dryRun ? 0 : inserted,
    errors,
  });
}
