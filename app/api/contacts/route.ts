// import { NextResponse } from 'next/server';
// import { createClient } from '@supabase/supabase-js';

// const supabaseAdmin = createClient(
//   process.env.NEXT_PUBLIC_SUPABASE_URL!,
//   process.env.SUPABASE_SERVICE_ROLE_KEY!,
//   { auth: { persistSession: false } }
// );


// export async function GET() {
//   // pull contacts + company display name
//   const { data, error } = await supabaseAdmin
//     .from('contacts')
//     .select(`
//       id,
//       contact_name,
//       email,
//       phone,
//       title,
//       department,
//       company_id,
//       linkedin_url,
//       facebook_url,
//       instagram_url,
//       companies!inner(company_id, trading_name, legal_name, company_name)
//     `);

//   if (error) return NextResponse.json({ error: error.message }, { status: 500 });

//   const rows = (data ?? []).map((r: any) => {
//     const comp = r.companies?.[0] || r.companies; // supabase may return object/array depending on relationship
//     const company =
//       comp?.trading_name || comp?.legal_name || comp?.company_name || r.company_id;

//     return {
//       id: r.id,
//       name: r.contact_name,
//       email: r.email,
//       title: r.title,
//       company,
//       phone: r.phone,
//       lastContact: '', // placeholder if you don't track yet
//       linkedin_url: r.linkedin_url,
//       facebook_url: r.facebook_url,
//       instagram_url: r.instagram_url,
//     };
//   });

//   return NextResponse.json({ data: rows });
// }


// app/api/contacts/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  // const { data: { user } } = await supabase.auth.getUser();
  // if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase.rpc('contacts_list');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}
