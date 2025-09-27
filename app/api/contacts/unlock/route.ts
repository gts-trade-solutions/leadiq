// app/api/contacts/unlock/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { contact_id } = await req.json();
  if (!contact_id) {
    return NextResponse.json({ error: 'Missing contact_id' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('unlock_contact', { p_contact_id: contact_id, p_price: 5 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const row = Array.isArray(data) ? data[0] : data;
  // row: { status: 'ok'|'INSUFFICIENT_CREDITS', already_unlocked: boolean, new_balance: number }
  if (row?.status === 'INSUFFICIENT_CREDITS') {
    return NextResponse.json(row, { status: 402 });
  }
  return NextResponse.json(row);
}
