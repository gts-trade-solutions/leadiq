import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { ContactRow, type ContactRowT } from '@/lib/schemas';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // server-only
  { auth: { persistSession: false } }
);


const headerAliases: Record<string, string> = {
  // pretty headers -> snake_case
  'Company ID': 'company_id',
  'Contact Name': 'contact_name',
  'Email': 'email',
  'Phone': 'phone',
  'Title': 'title',
  'Department': 'department',
  'LinkedIn': 'linkedin_url',
  'LinkedIn URL': 'linkedin_url',
  'Facebook': 'facebook_url',
  'Facebook URL': 'facebook_url',
  'Instagram': 'instagram_url',
  'Instagram URL': 'instagram_url',
  'Notes': 'notes',
  // snake_case keys accepted as-is
};

function readSheet(buffer: ArrayBuffer) {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
}

const trim = (v: any) => (v ?? '').toString().trim();
const normalizeUrl = (s: string) => {
  const v = trim(s);
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
};
const aliasKeys = (row: Record<string, any>) =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [headerAliases[k] ?? k, v]));

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
  const rawRows = readSheet(buf);

  const valid: ContactRowT[] = [];
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const r0 = aliasKeys(rawRows[i]);
    const normalized = {
      company_id: trim(r0.company_id),
      contact_name: trim(r0.contact_name),
      email: trim(r0.email),
      phone: trim(r0.phone),
      title: trim(r0.title),
      department: trim(r0.department),
      linkedin_url: normalizeUrl(r0.linkedin_url),
      facebook_url: normalizeUrl(r0.facebook_url),
      instagram_url: normalizeUrl(r0.instagram_url),
      notes: trim(r0.notes),
    };

    const parsed = ContactRow.safeParse(normalized);
    if (parsed.success) valid.push(parsed.data);
    else errors.push({
      row: i + 2,
      error: parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')
    });
  }

  let inserted = 0;
  if (!dryRun && valid.length) {
    for (const group of chunk(valid, 500)) {
      const { data, error } = await supabaseAdmin
        .from('contacts')
        .upsert(group) // if you add a unique key later, set onConflict accordingly
        .select('id');

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
