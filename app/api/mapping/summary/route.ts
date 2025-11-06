import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

export async function GET() {
  const [counts, unmapped] = await Promise.all([
    supabaseAdmin.from('company_contact_counts').select('*'),
    supabaseAdmin.from('unmapped_contacts').select('*'),
  ]);

  if (counts.error) return NextResponse.json({ error: counts.error.message }, { status: 500 });
  if (unmapped.error) return NextResponse.json({ error: unmapped.error.message }, { status: 500 });

  return NextResponse.json({ companies: counts.data, unmapped_contacts: unmapped.data });
}
