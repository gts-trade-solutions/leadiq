import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { ContactRow, type ContactRowT } from "@/lib/schemas";

// Server-only Supabase client (service role). NEVER expose this key to the client.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ---------- Helpers ----------

// normalize any header to a predictable, safe key: "LinkedIn URL " -> "linkedin_url"
const normalizeKey = (k: string) =>
  k
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

// accepted headers -> canonical field name
// keep city/country separate so we can combine when location is missing
const headerAliases: Record<string, string> = {
  company_id: "company_id",
  contact_name: "contact_name",
  email: "email",
  phone: "phone",
  title: "title",
  department: "department",
  linkedin: "linkedin_url",
  linkedin_url: "linkedin_url",
  facebook: "facebook_url",
  facebook_url: "facebook_url",
  instagram: "instagram_url",
  instagram_url: "instagram_url",
  notes: "notes",
  // location variants
  location: "location",
  loc: "location",
  city: "city",
  country: "country",
};

function aliasKeys(row: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    const nk = normalizeKey(k);
    const mapped = headerAliases[nk] ?? nk; // if not in aliases, keep normalized key
    out[mapped] = v;
  }
  return out;
}

const toStr = (v: any) => (v ?? "").toString().trim();
const normalizeUrl = (s: any) => {
  const v = toStr(s);
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
};

function buildLocation(r: Record<string, any>) {
  const loc = toStr(r.location);
  if (loc) return loc;
  const city = toStr(r.city);
  const country = toStr(r.country);
  const combined = [city, country].filter(Boolean).join(", ");
  return combined || "";
}

function readSheet(buffer: ArrayBuffer) {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // defval: '' so we don't get undefined — easier to trim/transform
  return XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
}

function chunk<T>(arr: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------- Route ----------

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") === "true";

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const buf = await file.arrayBuffer();
    const rawRows = readSheet(buf);

    const valid: ContactRowT[] = [];
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const r0 = aliasKeys(rawRows[i]);

      const normalized = {
        company_id: toStr(r0.company_id),
        contact_name: toStr(r0.contact_name),
        email: toStr(r0.email),
        phone: toStr(r0.phone),
        title: toStr(r0.title),
        department: toStr(r0.department),
        linkedin_url: normalizeUrl(r0.linkedin_url),
        facebook_url: normalizeUrl(r0.facebook_url),
        instagram_url: normalizeUrl(r0.instagram_url),
        notes: toStr(r0.notes),
        // NEW: ensure we always pass a location value (explicit or derived from city/country)
        location: buildLocation(r0),
      };

      const parsed = ContactRow.safeParse(normalized);
      if (parsed.success) {
        valid.push(parsed.data);
      } else {
        errors.push({
          row: i + 2, // +1 header, +1 1-indexed sheet rows
          error: parsed.error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join("; "),
        });
      }
    }

    let inserted = 0;
    if (!dryRun && valid.length) {
      for (const group of chunk(valid, 500)) {
        const { data, error } = await supabaseAdmin
          .from("contacts")
          .upsert(group /*, { onConflict: 'company_id,contact_name,email' } */)
          .select("id");

        if (error) {
          errors.push({
            row: -1,
            error: `batch insert failed: ${error.message}`,
          });
        } else {
          inserted += data?.length ?? 0;
        }
      }
    }

    return NextResponse.json({
      dryRun,
      parsed: valid.length + errors.length,
      valid: valid.length,
      inserted: dryRun ? 0 : inserted,
      errors,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Upload failed" },
      { status: 500 }
    );
  }
}
