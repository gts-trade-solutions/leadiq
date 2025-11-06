// app/api/contacts/public/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // server-only

  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "Missing Supabase server envs" },
      { status: 500 }
    );
  }

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // pull contacts (up to a reasonable limit for demo)
  const { data: contacts, error: cErr } = await sb
    .from("contacts")
    .select(
      [
        "id",
        "company_id",
        "contact_name",
        "title",
        "email",
        "phone",
        "location",
        "linkedin_url",
        "facebook_url",
        "instagram_url",
      ].join(",")
    )
    .limit(5000);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  // optional: enrich with company names if you have a companies table
  const { data: companies, error: coErr } = await sb
    .from("companies")
    .select("company_id, company_name");
  if (coErr) return NextResponse.json({ error: coErr.message }, { status: 500 });

  const nameById = new Map<string, string>();
  (companies || []).forEach((c: any) =>
    nameById.set(String(c.company_id), String(c.company_name || ""))
  );

  const rows = (contacts || []).map((c: any) => ({
    id: c.id,
    name: c.contact_name ?? "",
    title: c.title ?? "",
    company: nameById.get(String(c.company_id)) || String(c.company_id || ""),
    email: c.email ?? null,
    phone: c.phone ?? null,
    location: c.location ?? null,
    linkedin_url: c.linkedin_url ?? null,
    facebook_url: c.facebook_url ?? null,
    instagram_url: c.instagram_url ?? null,
  }));

  return NextResponse.json({ rows });
}
