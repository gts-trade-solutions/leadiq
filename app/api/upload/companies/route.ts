// app/api/upload/companies/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // server-only
  { auth: { persistSession: false } }
);

const normalizeKey = (k: string) =>
  k
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

const emptyToNull = (v: unknown) => {
  const s = (v ?? "").toString().trim();
  return s.length ? s : null;
};

const headerAliases: Record<string, string> = {
  // core
  company_id: "company_id",
  company_name: "company_name",
  legal_name: "legal_name",
  trading_name: "trading_name",
  company_type: "company_type",
  size: "size",
  head_office_address: "head_office_address",
  city_regency: "city_regency",
  country: "country",
  postal_code: "postal_code",
  website: "website",
  phone_main: "phone_main",
  email_general: "email_general",
  linkedin: "linkedin",
  notes: "notes",
  // NEW
  company_profile: "company_profile",
  financial_reports: "financial_reports",
  forecast_value: "forecast_value",
};

function aliasRow(row: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    const nk = normalizeKey(k);
    out[headerAliases[nk] ?? nk] = v;
  }
  return out;
}

function readSheet(buf: ArrayBuffer) {
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
}

function chunk<T>(arr: T[], size = 500) {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") === "true";

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file)
      return NextResponse.json({ error: "file is required" }, { status: 400 });

    const buf = await file.arrayBuffer();
    const rows = readSheet(buf);

    const valid: any[] = [];
    const errors: { row: number; error: string }[] = [];

    rows.forEach((raw, i) => {
      const r0 = aliasRow(raw);
      const row = {
        company_id: (r0.company_id ?? "").toString().trim(),
        company_name: emptyToNull(r0.company_name),
        legal_name: emptyToNull(r0.legal_name),
        trading_name: emptyToNull(r0.trading_name),
        company_type: emptyToNull(r0.company_type),
        size: emptyToNull(r0.size),
        head_office_address: emptyToNull(r0.head_office_address),
        city_regency: emptyToNull(r0.city_regency),
        country: emptyToNull(r0.country),
        postal_code: emptyToNull(r0.postal_code),
        website: emptyToNull(r0.website),
        phone_main: emptyToNull(r0.phone_main),
        email_general: emptyToNull(r0.email_general),
        linkedin: emptyToNull(r0.linkedin),
        notes: emptyToNull(r0.notes),
        // NEW:
        company_profile: emptyToNull(r0.company_profile),
        financial_reports: emptyToNull(r0.financial_reports),
        forecast_value:
          r0.forecast_value === "" || r0.forecast_value == null
            ? null
            : Number(r0.forecast_value),
      };

      if (!row.company_id) {
        errors.push({ row: i + 2, error: "company_id is required" });
        return;
      }
      if (!row.company_name) {
        errors.push({ row: i + 2, error: "company_name is required" });
        return;
      }
      if (row.forecast_value != null && !Number.isFinite(row.forecast_value)) {
        errors.push({ row: i + 2, error: "forecast_value must be numeric" });
        return;
      }

      valid.push(row);
    });

    let inserted = 0;
    if (!dryRun && valid.length) {
      for (const group of chunk(valid, 500)) {
        const { data, error } = await supabase
          .from("companies")
          .upsert(group, { onConflict: "company_id" })
          .select("id");

        if (error) {
          errors.push({
            row: -1,
            error: `batch upsert failed: ${error.message}`,
          });
        } else {
          inserted += data?.length ?? 0;
        }
      }
    }

    const parsed = valid.length + errors.length;
    return NextResponse.json({
      dryRun,
      parsed,
      valid: valid.length,
      inserted,
      errors,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Upload failed" },
      { status: 500 }
    );
  }
}
