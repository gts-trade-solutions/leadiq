"use client";
export const dynamic = 'force-dynamic'
import { useEffect, useMemo, useRef, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import Table from "@/components/Table";
import {
  Plus,
  Upload,
  RefreshCcw,
  Linkedin,
  Facebook,
  Instagram,
  Shield,
  Download,
  SortAsc,
  SortDesc,
  Lock,
  CheckCircle2,
} from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type Row = {
  company_id: string;
  name: string; // trading_name || legal_name
  companyType: string; // replaces "industry"
  size: string;
  location: string; // City, Country
  contacts: number; // display count
};

type CompanyFull = {
  company_id: string;
  company_name?: string | null;
  legal_name?: string | null;
  trading_name?: string | null;
  company_type?: string | null;
  size?: string | null;
  website?: string | null;
  head_office_address?: string | null;
  city_regency?: string | null;
  country?: string | null;
  postal_code?: string | null;
  phone_main?: string | null;
  email_general?: string | null;
  linkedin?: string | null;
  notes?: string | null;

  // NEW fields
  company_profile?: string | null;
  financial_reports?: string | null; // link or text
  forecast_value?: number | null; // numeric forecast
};

type ContactMini = {
  id: string;
  contact_name: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  department?: string | null;
  linkedin_url?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  notes?: string | null;
};

type AssetsState = {
  financials: boolean;
  forecast: boolean;
  mgmt_pack: boolean;
};

export default function CompaniesPage() {
  const supabase = createClientComponentClient();

  const headers = [
    "Company Name",
    "Company Type",
    "Size",
    "Location",
    "Contacts",
  ];

  // auth/admin
  const [isAdmin, setIsAdmin] = useState(false);

  // data
  const [allRows, setAllRows] = useState<Row[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  // search / filters / sort / pagination
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState<{
    companyType: string;
    size: string;
    location: string;
  }>({
    companyType: "",
    size: "",
    location: "",
  });
  const [sortKey, setSortKey] = useState<
    "name" | "companyType" | "size" | "location"
  >("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<15 | 30 | 50>(15);

  // upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    dryRun?: boolean;
    parsed?: number;
    valid?: number;
    inserted?: number;
    errors?: { row: number; error: string }[];
  } | null>(null);

  // modals
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [companyFull, setCompanyFull] = useState<CompanyFull | null>(null);
  const [assets, setAssets] = useState<AssetsState>({
    financials: false,
    forecast: false,
    mgmt_pack: false,
  });

  const [contactsModalOpen, setContactsModalOpen] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [companyContacts, setCompanyContacts] = useState<ContactMini[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(
    null
  );
  const [selectedCompanyName, setSelectedCompanyName] = useState<string>("");
  const [unlockedCount, setUnlockedCount] = useState<number>(0);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    company_id: "",
    company_name: "",
    legal_name: "",
    trading_name: "",
    company_type: "",
    size: "",
    head_office_address: "",
    city_regency: "",
    country: "",
    postal_code: "",
    website: "",
    phone_main: "",
    email_general: "",
    linkedin: "",
    notes: "",
    // NEW fields (free text / URL / number)
    company_profile: "",
    financial_reports: "",
    forecast_value: "",
  });
  // NEW: credit balance + confirm dialog
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [confirmUnlock, setConfirmUnlock] = useState<{
    open: boolean;
    type: null | "financials" | "forecast" | "mgmt_pack";
    price: number;
    msg?: string;
  }>({ open: false, type: null, price: 10 });

  // NEW: fetch wallet balance
  async function fetchWalletBalance() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setWalletBalance(null);
      return;
    }
    const { data, error } = await supabase
      .from("wallet")
      .select("balance")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!error) setWalletBalance(data?.balance ?? 0);
  }

  useEffect(() => {
    detectAdmin();
    load();
    fetchWalletBalance();
  }, []);

  // helpers
  const norm = (v?: string | null) => (v ?? "").toString().trim();
  const includesI = (hay: string, needle: string) =>
    hay.toLowerCase().includes(needle.toLowerCase());

  // detect admin via app_metadata.roles OR profiles.role = 'admin'
  async function detectAdmin() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let viaAppMeta = false;
    if (user?.app_metadata) {
      const roles = (user.app_metadata as any).roles;
      viaAppMeta = Array.isArray(roles) && roles.includes("admin");
    }
    let viaProfiles = false;
    if (user?.id) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      viaProfiles = prof?.role === "admin";
    }
    setIsAdmin(viaAppMeta || viaProfiles);
  }

  // load companies list
  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/companies", { cache: "no-store" });
      const json = await res.json();

      if (Array.isArray(json?.data)) {
        const pruned = json.data.map((r: any) => {
          const parts = (r?.location ?? "")
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean);
          const city = parts[0] ?? "";
          const country = parts.length > 1 ? parts[parts.length - 1] : "";
          return { ...r, location: [city, country].filter(Boolean).join(", ") };
        });
        setAllRows(pruned as Row[]);
      } else {
        setAllRows([]);
      }
    } catch (e) {
      console.error(e);
      setAllRows([]);
    } finally {
      setLoading(false);
    }
  }

  // effects
  useEffect(() => {
    detectAdmin();
    load();
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // search + filter + sort
  useEffect(() => {
    let filtered = allRows.filter((r) => {
      if (
        filters.companyType &&
        norm(r.companyType) !== norm(filters.companyType)
      )
        return false;
      if (filters.size && norm(r.size) !== norm(filters.size)) return false;
      if (filters.location && norm(r.location) !== norm(filters.location))
        return false;

      const s = norm(debouncedSearch);
      if (!s) return true;
      const hay = [r.name, r.companyType, r.size, r.location]
        .map(norm)
        .join("|");
      return includesI(hay, s);
    });

    filtered.sort((a, b) => {
      const av = norm(a[sortKey]).toLowerCase();
      const bv = norm(b[sortKey]).toLowerCase();
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });

    setRows(filtered);
    setPage(1);
  }, [allRows, debouncedSearch, filters, sortKey, sortDir]);

  // options for select boxes (respect other filters/search)
  const uniqueSorted = (arr: string[]) =>
    Array.from(new Set(arr.filter(Boolean).map(norm))).sort((a, b) =>
      a.localeCompare(b)
    );

  const companyTypeOptions = useMemo(() => {
    const base = allRows.filter(
      (r) =>
        (filters.size ? norm(r.size) === norm(filters.size) : true) &&
        (filters.location
          ? norm(r.location) === norm(filters.location)
          : true) &&
        (debouncedSearch
          ? includesI(
              [r.name, r.companyType, r.size, r.location].map(norm).join("|"),
              debouncedSearch
            )
          : true)
    );
    return uniqueSorted(base.map((r) => r.companyType));
  }, [allRows, filters.size, filters.location, debouncedSearch]);

  const sizeOptions = useMemo(() => {
    const base = allRows.filter(
      (r) =>
        (filters.companyType
          ? norm(r.companyType) === norm(filters.companyType)
          : true) &&
        (filters.location
          ? norm(r.location) === norm(filters.location)
          : true) &&
        (debouncedSearch
          ? includesI(
              [r.name, r.companyType, r.size, r.location].map(norm).join("|"),
              debouncedSearch
            )
          : true)
    );
    return uniqueSorted(base.map((r) => r.size));
  }, [allRows, filters.companyType, filters.location, debouncedSearch]);

  const locationOptions = useMemo(() => {
    const base = allRows.filter(
      (r) =>
        (filters.companyType
          ? norm(r.companyType) === norm(filters.companyType)
          : true) &&
        (filters.size ? norm(r.size) === norm(filters.size) : true) &&
        (debouncedSearch
          ? includesI(
              [r.name, r.companyType, r.size, r.location].map(norm).join("|"),
              debouncedSearch
            )
          : true)
    );
    return uniqueSorted(base.map((r) => r.location));
  }, [allRows, filters.companyType, filters.size, debouncedSearch]);

  function clearFilters() {
    setSearch("");
    setFilters({ companyType: "", size: "", location: "" });
    setSortKey("name");
    setSortDir("asc");
  }

  // pagination
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIdx = (page - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);
  const currentRows = useMemo(
    () => rows.slice(startIdx, endIdx),
    [rows, startIdx, endIdx]
  );

  // upload
  const onUploadClick = () => fileRef.current?.click();
  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload/companies", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      setUploadResult(json);
      if (!json?.dryRun) await load();
    } catch (err) {
      console.error(err);
      setUploadResult({
        inserted: 0,
        errors: [{ row: -1, error: "Upload failed" }],
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // open company details
  const openCompanyModal = async (company_id: string) => {
    setSelectedCompanyId(company_id);
    setCompanyModalOpen(true);
    setCompanyLoading(true);
    setCompanyError(null);
    setCompanyFull(null);
    setAssets({ financials: false, forecast: false, mgmt_pack: false });

    try {
      const res = await fetch(
        `/api/companies/${encodeURIComponent(company_id)}/full`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to fetch company");

      const c = json.company as CompanyFull;
      setCompanyFull(c);
      setAssets({
        financials: !!json?.assets?.financials_unlocked,
        forecast: !!json?.assets?.forecast_unlocked,
        mgmt_pack: !!json?.assets?.mgmt_pack_unlocked,
      });

      const display =
        c.trading_name || c.legal_name || c.company_name || c.company_id;
      setSelectedCompanyName(display ?? company_id);
      await fetchWalletBalance();
    } catch (e: any) {
      console.error(e);
      setCompanyError(e?.message || "Failed to load company details");
    } finally {
      setCompanyLoading(false);
    }
  };

  // open contacts modal (ONLY unlocked contacts)
  const openContactsModal = async (company_id: string) => {
    setSelectedCompanyId(company_id);
    setContactsModalOpen(true);
    setContactsLoading(true);
    setContactsError(null);
    setCompanyContacts([]);
    setSelectedCompanyName("");

    try {
      const res = await fetch(
        `/api/companies/${encodeURIComponent(company_id)}/full`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to fetch contacts");

      const list: ContactMini[] = Array.isArray(json.contacts)
        ? json.contacts
        : [];
      setCompanyContacts(list);
      setUnlockedCount(list.length);

      const c = json.company as CompanyFull;
      const display =
        c?.trading_name ||
        c?.legal_name ||
        c?.company_name ||
        c?.company_id ||
        "";
      setSelectedCompanyName(display);
    } catch (e: any) {
      console.error(e);
      setContactsError(e?.message || "Failed to load contacts");
    } finally {
      setContactsLoading(false);
    }
  };

  // table data mapping
  const tableData = currentRows.map((r) => ({
    name: (
      <button
        onClick={() => openCompanyModal(r.company_id)}
        className="text-emerald-400 hover:underline"
        title="View company details"
      >
        {r.name}
      </button>
    ),
    companyType: r.companyType || "—",
    size: r.size || "—",
    location: r.location || "—",
    contacts: (
      <button
        onClick={() => openContactsModal(r.company_id)}
        className="inline-flex items-center justify-center rounded-md px-2.5 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs"
        title="View unlocked contacts"
      >
        View ({r.contacts})
      </button>
    ),
  }));

  // admin: template CSV (now with new columns)
  function downloadCompaniesTemplateCsv() {
    const cols = [
      "company_id",
      "company_name",
      "legal_name",
      "trading_name",
      "company_type",
      "size",
      "head_office_address",
      "city_regency",
      "country",
      "postal_code",
      "website",
      "phone_main",
      "email_general",
      "linkedin",
      "notes",
      // NEW columns
      "company_profile",
      "financial_reports",
      "forecast_value",
    ];
    const csv = cols.join(",") + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "companies_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // admin: export current view to CSV
  function exportCurrentViewCsv() {
    const cols = [
      "company_id",
      "name",
      "companyType",
      "size",
      "location",
      "contacts",
    ];
    const lines = [cols.join(",")].concat(
      rows.map((r) =>
        [
          r.company_id,
          r.name?.replaceAll(",", " "),
          r.companyType?.replaceAll(",", " "),
          r.size?.replaceAll(",", " "),
          r.location?.replaceAll(",", " "),
          String(r.contacts ?? ""),
        ].join(",")
      )
    );
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "companies_export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // unlock a paid company asset
  async function unlockAsset(type: "financials" | "forecast" | "mgmt_pack") {
    if (!selectedCompanyId) return;
    try {
      const res = await fetch("/api/company-assets/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: selectedCompanyId, type }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to unlock");

      // Refresh modal data
      await openCompanyModal(selectedCompanyId);
      if (type === "mgmt_pack") {
        // also refresh contacts count if they were unlocked by the pack
        await openContactsModal(selectedCompanyId);
        setContactsModalOpen(false); // don't leave it open
      }
      alert(json?.message || "Unlocked successfully");
    } catch (e: any) {
      alert(e?.message || "Unlock failed");
    }
  }

  // quick stats
  const statCompanies = allRows.length;
  const statTypes = useMemo(
    () => new Set(allRows.map((r) => norm(r.companyType))).size,
    [allRows]
  );
  const statLocations = useMemo(
    () => new Set(allRows.map((r) => norm(r.location))).size,
    [allRows]
  );

function requiredPriceFor(type: "financials" | "forecast" | "mgmt_pack") {
  return 10; // all are 10 credits per your spec
}

async function handleUnlockClick(type: "financials" | "forecast" | "mgmt_pack") {
  // always refresh balance before deciding
  await fetchWalletBalance();
  setConfirmUnlock({ open: true, type, price: requiredPriceFor(type) });
}

async function confirmUnlockNow() {
  if (!selectedCompanyId || !confirmUnlock.type) return;

  const price = confirmUnlock.price;
  const balance = walletBalance ?? 0;

  // Client-side guard
  if (balance < price) {
    setConfirmUnlock((s) => ({ ...s, msg: "Insufficient credits. Please add credits to proceed." }));
    return;
  }

  // Server-side purchase (also guarded on backend)
  const res = await fetch("/api/company-assets/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ company_id: selectedCompanyId, type: confirmUnlock.type }),
  });
  const json = await res.json();

  if (!res.ok) {
    setConfirmUnlock((s) => ({ ...s, msg: json?.error || "Unlock failed" }));
    await fetchWalletBalance();
    return;
  }

  // success
  setConfirmUnlock({ open: false, type: null, price: 10 });
  await fetchWalletBalance();
  await openCompanyModal(selectedCompanyId);
  if (confirmUnlock.type === "mgmt_pack") {
    await openContactsModal(selectedCompanyId);
    setContactsModalOpen(false);
  }
  alert(json?.message || "Unlocked successfully");
}


  return (
    <div className="space-y-6">
      <SectionHeader
        title="Companies"
        description="Manage your company database and discover new prospects"
      >
        {/* Admin badge */}
        {isAdmin && (
          <span className="hidden md:inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-emerald-900/40 text-emerald-200 border border-emerald-700">
            <Shield className="w-3 h-3" /> Admin
          </span>
        )}

        {/* Admin-only buttons */}
        {isAdmin && (
          <>
            <button
              onClick={downloadCompaniesTemplateCsv}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Template
            </button>

            <button
              onClick={onUploadClick}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
              disabled={uploading}
            >
              <Upload className="w-4 h-4" />
              {uploading ? "Uploading…" : "Upload"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={onFileChange}
            />

            <button
              onClick={() => {
                setAddModalOpen(true);
                setSaveErr(null);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Company
            </button>

            <button
              onClick={exportCurrentViewCsv}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
              title="Export current view to CSV"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </>
        )}

        {/* Available for everyone */}
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
          disabled={loading}
        >
          <RefreshCcw className="w-4 h-4" />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </SectionHeader>

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Companies" value={statCompanies} />
        <Stat label="Company Types" value={statTypes} />
        <Stat label="Locations" value={statLocations} />
      </div>

      {/* Search, filters, sort */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
        <div className="grid md:grid-cols-12 gap-3">
          {/* search */}
          <div className="md:col-span-5">
            <label className="text-xs text-gray-400 block mb-1">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search company, type, size, or location…"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 hover:border-gray-600 transition-colors"
            />
          </div>

          {/* type */}
          <div className="md:col-span-2">
            <label className="text-xs text-gray-400 block mb-1">
              Company Type
            </label>
            <select
              value={filters.companyType}
              onChange={(e) =>
                setFilters((f) => ({ ...f, companyType: e.target.value }))
              }
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 hover:border-gray-600 transition-colors"
            >
              <option value="">All</option>
              {companyTypeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          {/* size */}
          <div className="md:col-span-2">
            <label className="text-xs text-gray-400 block mb-1">Size</label>
            <select
              value={filters.size}
              onChange={(e) =>
                setFilters((f) => ({ ...f, size: e.target.value }))
              }
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 hover:border-gray-600 transition-colors"
            >
              <option value="">All</option>
              {sizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          {/* location */}
          <div className="md:col-span-2">
            <label className="text-xs text-gray-400 block mb-1">Location</label>
            <select
              value={filters.location}
              onChange={(e) =>
                setFilters((f) => ({ ...f, location: e.target.value }))
              }
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 hover:border-gray-600 transition-colors"
            >
              <option value="">All</option>
              {locationOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          {/* sort controls */}
          <div className="md:col-span-1">
            <label className="text-xs text-gray-400 block mb-1">Sort</label>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as any)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 hover:border-gray-600 transition-colors"
            >
              <option value="name">Name</option>
              <option value="companyType">Type</option>
              <option value="size">Size</option>
              <option value="location">Location</option>
            </select>
          </div>
          <div className="md:col-span-1 flex items-end">
            <button
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 hover:border-gray-600 flex items-center justify-center gap-2"
              title={sortDir === "asc" ? "Ascending (A→Z)" : "Descending (Z→A)"}
            >
              {sortDir === "asc" ? (
                <SortAsc className="w-4 h-4" />
              ) : (
                <SortDesc className="w-4 h-4" />
              )}
              {sortDir === "asc" ? "A→Z" : "Z→A"}
            </button>
          </div>

          {/* clear & count */}
          <div className="md:col-span-12 flex items-center justify-between">
            <button
              onClick={clearFilters}
              className="px-3 py-2 bg-gray-800 border border-gray-700 hover:border-gray-600 rounded-lg text-sm"
            >
              Clear
            </button>
            <div className="text-xs text-gray-400">
              Showing <b>{rows.length}</b> of <b>{allRows.length}</b>
            </div>
          </div>
        </div>
      </div>

      {/* Upload result summary (admin) */}
      {isAdmin && uploadResult && (
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-4 text-sm">
          <div className="font-medium">Upload summary</div>
          <div className="mt-1">
            Parsed: <b>{uploadResult.parsed ?? 0}</b> • Valid:{" "}
            <b>{uploadResult.valid ?? 0}</b> • Inserted/updated:{" "}
            <b>{uploadResult.inserted ?? 0}</b>
            {uploadResult.dryRun ? (
              <span className="ml-2 italic text-gray-400">(dry run)</span>
            ) : null}
          </div>
          {Array.isArray(uploadResult.errors) &&
            uploadResult.errors.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer">
                  Errors ({uploadResult.errors.length})
                </summary>
                <ul className="list-disc pl-5 mt-2">
                  {uploadResult.errors.map((e, i) => (
                    <li key={i}>
                      Row {e.row}: {e.error}
                    </li>
                  ))}
                </ul>
              </details>
            )}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-sm text-gray-400">
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-10 text-center text-gray-300">
          No companies found.
        </div>
      ) : (
        <>
          <Table headers={headers} data={tableData} />

          {/* Pagination */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 py-4">
            <div className="text-sm text-gray-400">
              Showing <b>{total === 0 ? 0 : startIdx + 1}</b>–<b>{endIdx}</b> of{" "}
              <b>{total}</b>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-300">
                Rows per page:{" "}
                <select
                  className="ml-2 bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-sm"
                  value={pageSize}
                  onChange={(e) =>
                    setPageSize(Number(e.target.value) as 15 | 30 | 50)
                  }
                >
                  <option value={15}>15</option>
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                </select>
              </label>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="px-2 py-1 rounded-md bg-gray-800 border border-gray-700 text-sm disabled:opacity-50"
                >
                  « First
                </button>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2 py-1 rounded-md bg-gray-800 border border-gray-700 text-sm disabled:opacity-50"
                >
                  ‹ Prev
                </button>
                {Array.from({ length: Math.min(7, totalPages) }).map((_, i) => {
                  const n = i + Math.max(1, Math.min(page - 3, totalPages - 6));
                  return (
                    <button
                      key={n}
                      onClick={() => setPage(n)}
                      className={`px-2 py-1 rounded-md border text-sm ${
                        n === page
                          ? "bg-emerald-600 border-emerald-600 text-white"
                          : "bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700"
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-2 py-1 rounded-md bg-gray-800 border border-gray-700 text-sm disabled:opacity-50"
                >
                  Next ›
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  className="px-2 py-1 rounded-md bg-gray-800 border border-gray-700 text-sm disabled:opacity-50"
                >
                  Last »
                </button>
              </div>
              <div className="text-sm text-gray-400">
                Page <b>{page}</b> of <b>{totalPages}</b>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Company Modal */}
      {companyModalOpen && (
        <Modal
          onClose={() => setCompanyModalOpen(false)}
          title="Company Details"
        >
          {companyLoading ? (
            <div className="text-sm text-gray-300">Loading…</div>
          ) : companyError ? (
            <div className="text-sm text-red-300">{companyError}</div>
          ) : companyFull ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <Info label="Company ID" value={companyFull.company_id} />
                <Info
                  label="Display Name"
                  value={
                    companyFull.trading_name ||
                    companyFull.legal_name ||
                    companyFull.company_name ||
                    companyFull.company_id
                  }
                />
                <Info label="Company Type" value={companyFull.company_type} />
                <Info label="Size" value={companyFull.size} />
                <Info
                  label="Website"
                  value={
                    companyFull.website ? (
                      <a
                        className="text-emerald-400 hover:underline"
                        href={companyFull.website}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {companyFull.website}
                      </a>
                    ) : (
                      ""
                    )
                  }
                />
                <Info label="Email" value={companyFull.email_general} />
                <Info label="Phone" value={companyFull.phone_main} />
                <Info label="Address" value={companyFull.head_office_address} />
                <Info label="City/Regency" value={companyFull.city_regency} />
                <Info label="Country" value={companyFull.country} />
                <Info label="Postal Code" value={companyFull.postal_code} />
                <Info
                  label="LinkedIn"
                  value={
                    companyFull.linkedin ? (
                      <a
                        className="inline-flex items-center gap-1 text-emerald-400 hover:underline"
                        href={companyFull.linkedin}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Linkedin className="w-4 h-4" />
                      </a>
                    ) : (
                      ""
                    )
                  }
                />
                <div className="md:col-span-2">
                  <Info
                    label="Company Profile"
                    value={companyFull.company_profile}
                  />
                </div>
              </div>

              {/* Unlockables */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Financials */}
                <UnlockCard
                  title="Company Financials"
                  price={10}
                  unlocked={assets.financials}
                  onUnlock={() => handleUnlockClick("financials")}
                >
                  {assets.financials ? (
                    companyFull.financial_reports ? (
                      /^https?:\/\//i.test(companyFull.financial_reports) ? (
                        <a
                          href={companyFull.financial_reports}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-400 hover:underline"
                        >
                          Open financial report
                        </a>
                      ) : (
                        <span className="text-gray-200">
                          {companyFull.financial_reports}
                        </span>
                      )
                    ) : (
                      <span className="text-gray-400">
                        No financial report stored.
                      </span>
                    )
                  ) : (
                    <span className="text-gray-400">
                      Unlock to view financial reports.
                    </span>
                  )}
                </UnlockCard>

                {/* Forecast */}
                <UnlockCard
                  title="Company Forecast"
                  price={10}
                  unlocked={assets.forecast}
                  onUnlock={() => handleUnlockClick("forecast")}
                >
                  {assets.forecast ? (
                    companyFull.forecast_value != null ? (
                      <span className="text-gray-200">
                        Forecast value: <b>{companyFull.forecast_value}</b>
                      </span>
                    ) : (
                      <span className="text-gray-400">
                        No forecast value stored.
                      </span>
                    )
                  ) : (
                    <span className="text-gray-400">
                      Unlock to view forecast value.
                    </span>
                  )}
                </UnlockCard>

                {/* Management Pack */}
                <UnlockCard
                  title="Management Pack (3 contacts)"
                  price={10}
                  unlocked={assets.mgmt_pack}
                  onUnlock={() => handleUnlockClick("mgmt_pack")}
                >
                  {assets.mgmt_pack ? (
                    <span className="text-gray-200">
                      Up to 3 management-level contacts for this company have
                      been unlocked and are visible in the Contacts modal.
                    </span>
                  ) : (
                    <span className="text-gray-400">
                      Unlock a curated set of management roles
                      (CEO/Head/Director/Manager/VP).
                    </span>
                  )}
                </UnlockCard>
              </div>
            </>
          ) : null}
        </Modal>
      )}

      {/* Contacts Modal — only unlocked contacts (server already filters) */}
      {contactsModalOpen && (
        <Modal
          onClose={() => setContactsModalOpen(false)}
          title={`Contacts ${
            selectedCompanyName ? `— ${selectedCompanyName}` : ""
          }`}
        >
          {contactsLoading ? (
            <div className="text-sm text-gray-300">Loading…</div>
          ) : contactsError ? (
            <div className="text-sm text-red-300">{contactsError}</div>
          ) : (
            <>
              <div className="text-xs text-gray-400 mb-2">
                Showing <b>{unlockedCount}</b> unlocked contact
                {unlockedCount === 1 ? "" : "s"}.
              </div>
              {companyContacts.length === 0 ? (
                <div className="text-sm text-gray-400">
                  No unlocked contacts for this company yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-gray-700">
                        <th className="py-2 pr-4">Name</th>
                        <th className="py-2 pr-4">Title</th>
                        <th className="py-2 pr-4">Email</th>
                        <th className="py-2 pr-4">Phone</th>
                        <th className="py-2 pr-4">Social</th>
                      </tr>
                    </thead>
                    <tbody>
                      {companyContacts.map((c) => (
                        <tr key={c.id} className="border-b border-gray-800">
                          <td className="py-2 pr-4">{c.contact_name}</td>
                          <td className="py-2 pr-4">{c.title || ""}</td>
                          <td className="py-2 pr-4">
                            {c.email ? (
                              <a
                                className="text-emerald-400 hover:underline"
                                href={`mailto:${c.email}`}
                              >
                                {c.email}
                              </a>
                            ) : (
                              ""
                            )}
                          </td>
                          <td className="py-2 pr-4">{c.phone || ""}</td>
                          <td className="py-2 pr-4">
                            <div className="flex items-center gap-1">
                              <SocialIcon url={c.linkedin_url} label="LinkedIn">
                                <Linkedin className="w-4 h-4" />
                              </SocialIcon>
                              <SocialIcon url={c.facebook_url} label="Facebook">
                                <Facebook className="w-4 h-4" />
                              </SocialIcon>
                              <SocialIcon
                                url={c.instagram_url}
                                label="Instagram"
                              >
                                <Instagram className="w-4 h-4" />
                              </SocialIcon>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Modal>
      )}

      {/* Add Company Modal (admin only) */}

      {isAdmin && addModalOpen && (
        <AddCompanyModal
          form={form}
          setForm={setForm}
          onClose={() => setAddModalOpen(false)}
          saveBusy={saveBusy}
          saveErr={saveErr}
          setSaveBusy={setSaveBusy}
          setSaveErr={setSaveErr}
          reload={load}
        />
      )}
    {confirmUnlock.open && (
  <div className="fixed inset-0 z-50">
    <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmUnlock({ open: false, type: null, price: 10 })} />
    <div className="absolute inset-x-0 top-24 mx-auto w-[min(520px,95%)] rounded-2xl bg-gray-900 border border-gray-700 shadow-xl">
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h3 className="text-lg font-semibold">Confirm Purchase</h3>
        <button onClick={() => setConfirmUnlock({ open: false, type: null, price: 10 })} className="text-gray-300 hover:text-white">✕</button>
      </div>
      <div className="p-4 space-y-3 text-sm">
        <div className="text-gray-300">
          You’re about to unlock:{" "}
          <b className="capitalize">{confirmUnlock.type?.replace("_", " ")}</b>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Current credits</span>
            <b className="text-white">{walletBalance ?? 0}</b>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Cost</span>
            <b className="text-white">-{confirmUnlock.price}</b>
          </div>
          <div className="flex items-center justify-between border-t border-gray-800 mt-2 pt-2">
            <span className="text-gray-400">Balance after</span>
            <b className={(walletBalance ?? 0) - confirmUnlock.price < 0 ? "text-rose-300" : "text-white"}>
              {(walletBalance ?? 0) - confirmUnlock.price}
            </b>
          </div>
        </div>
        {confirmUnlock.msg && (
          <div className="text-rose-300 border border-rose-700/50 bg-rose-950/40 rounded-lg px-3 py-2">
            {confirmUnlock.msg}
          </div>
        )}
      </div>
      <div className="p-4 border-t border-gray-700 flex items-center justify-end gap-2">
        <button
          onClick={() => setConfirmUnlock({ open: false, type: null, price: 10 })}
          className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 hover:border-gray-600 text-sm"
        >
          Cancel
        </button>
        <button
          onClick={confirmUnlockNow}
          disabled={(walletBalance ?? 0) < confirmUnlock.price}
          className={`px-3 py-2 rounded-lg text-sm ${
            (walletBalance ?? 0) < confirmUnlock.price
              ? "bg-gray-700 text-gray-300 cursor-not-allowed"
              : "bg-emerald-600 hover:bg-emerald-700 text-white"
          }`}
        >
          {(walletBalance ?? 0) < confirmUnlock.price ? "Insufficient credits" : "Confirm"}
        </button>
      </div>
    </div>
  </div>
)}


    </div>
  );
}

/* ------- Small UI helpers ------- */

function Modal({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-x-0 top-10 mx-auto w-[min(1000px,95%)] rounded-2xl bg-gray-900 border border-gray-700 shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-300 hover:text-white">
            ✕
          </button>
        </div>
        <div className="p-4 space-y-6 max-h-[70vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: any }) {
  const v = value ?? "";
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="text-gray-400">{label}</div>
      <div className="col-span-2 text-gray-200 break-words">
        {v || <span className="text-gray-500">—</span>}
      </div>
    </div>
  );
}

function SocialIcon({
  url,
  label,
  children,
}: {
  url?: string | null;
  label: string;
  children: React.ReactNode;
}) {
  const cls =
    "inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-gray-700 transition-colors";
  const disabled =
    "inline-flex items-center justify-center w-8 h-8 rounded-md opacity-40 cursor-not-allowed";
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cls}
      title={`Open ${label}`}
    >
      {children}
    </a>
  ) : (
    <span className={disabled} title={`No ${label}`}>
      {children}
    </span>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs text-gray-400 block mb-1">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-2xl font-semibold text-white mt-1">{value}</div>
    </div>
  );
}

function UnlockCard({
  title,
  price,
  unlocked,
  onUnlock,
  children,
}: {
  title: string;
  price: number;
  unlocked: boolean;
  onUnlock: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="font-medium">{title}</div>
        {unlocked ? (
          <span className="inline-flex items-center gap-1 text-emerald-300 text-xs">
            <CheckCircle2 className="w-4 h-4" /> Unlocked
          </span>
        ) : (
          <button
            onClick={onUnlock}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
          >
            <Lock className="w-4 h-4" /> Unlock • {price} credits
          </button>
        )}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

/* tiny utility classes for consistency */
const inputBase =
  "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 hover:border-gray-600 transition-colors";
const taBase =
  "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 hover:border-gray-600 transition-colors";
const btnBase = "px-3 py-2 rounded-lg text-sm";
const btnPri =
  "bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60";
const btnSec = "bg-gray-800 border border-gray-700 hover:border-gray-600";
Object.assign(globalThis, {
  input: inputBase,
  textarea: taBase,
  "btn-primary": `${btnBase} ${btnPri}`,
  "btn-secondary": `${btnBase} ${btnSec}`,
});

function AddCompanyModal({
  form,
  setForm,
  onClose,
  saveBusy,
  saveErr,
  setSaveBusy,
  setSaveErr,
  reload,
}: {
  form: {
    company_id: string;
    company_name: string;
    legal_name: string;
    trading_name: string;
    company_type: string;
    size: string;
    head_office_address: string;
    city_regency: string;
    country: string;
    postal_code: string;
    website: string;
    phone_main: string;
    email_general: string;
    linkedin: string;
    notes: string;
    company_profile: string;
    financial_reports: string;
    forecast_value: string;
  };
  setForm: (f: any) => void;
  onClose: () => void;
  saveBusy: boolean;
  saveErr: string | null;
  setSaveBusy: (b: boolean) => void;
  setSaveErr: (s: string | null) => void;
  reload: () => Promise<void>;
}) {
  const [tab, setTab] = useState<"basics" | "contact" | "profile">("basics");
  const [touched, setTouched] = useState<{ id?: boolean; name?: boolean }>({});

  const requiredMissing = !form.company_id.trim() || !form.company_name.trim();

  async function onSave() {
    try {
      setSaveBusy(true);
      setSaveErr(null);
      if (requiredMissing) {
        setTouched({ id: true, name: true });
        throw new Error("Company ID and Company Name are required");
      }
      const payload = {
        ...form,
        forecast_value: form.forecast_value
          ? Number(form.forecast_value)
          : null,
      };
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to create company");

      // reset and close
      setForm({
        company_id: "",
        company_name: "",
        legal_name: "",
        trading_name: "",
        company_type: "",
        size: "",
        head_office_address: "",
        city_regency: "",
        country: "",
        postal_code: "",
        website: "",
        phone_main: "",
        email_general: "",
        linkedin: "",
        notes: "",
        company_profile: "",
        financial_reports: "",
        forecast_value: "",
      });
      await reload();
      onClose();
    } catch (e: any) {
      setSaveErr(e?.message || "Failed to add company");
    } finally {
      setSaveBusy(false);
    }
  }

  // Keyboard: Ctrl/Cmd + Enter to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "enter") {
        e.preventDefault();
        if (!saveBusy) onSave();
      }
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveBusy, onSave]);

  const fieldCls =
    "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 hover:border-gray-600 transition-colors";
  const danger = "text-rose-300 text-xs mt-1";
  const labelCls = "text-xs text-gray-400 block mb-1";

  const profileLen = form.company_profile?.length ?? 0;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-x-0 top-6 mx-auto w-[min(1200px,96%)] rounded-2xl bg-gray-900 border border-gray-700 shadow-xl flex flex-col max-h-[75vh]">
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur border-b border-gray-700 px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Add Company</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Fill required fields, then press{" "}
              <kbd className="px-1 py-0.5 bg-gray-800 border border-gray-700 rounded">
                Ctrl/Cmd + Enter
              </kbd>{" "}
              to save.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-white">
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-3">
          <div className="inline-flex items-center gap-2 p-1 rounded-lg bg-gray-800 border border-gray-700">
            {[
              { id: "basics", label: "Basics" },
              { id: "contact", label: "Contacts & Links" },
              { id: "profile", label: "Profile & Financials" },
            ].map((t: any) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-md text-sm ${
                  tab === t.id
                    ? "bg-emerald-600 text-white"
                    : "text-gray-300 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content (scrollable) */}
        <div className="px-5 py-4 overflow-y-auto">
          {saveErr && (
            <div className="mb-3 text-sm text-rose-300 border border-rose-700/50 bg-rose-950/40 rounded-lg px-3 py-2">
              {saveErr}
            </div>
          )}

          {tab === "basics" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block">
                <span className={labelCls}>
                  Company ID <span className="text-rose-400">*</span>
                </span>
                <input
                  className={`${fieldCls} ${
                    touched.id && !form.company_id.trim()
                      ? "border-rose-700 focus:ring-rose-500"
                      : ""
                  }`}
                  placeholder="ACME-001"
                  value={form.company_id}
                  onBlur={() => setTouched((t) => ({ ...t, id: true }))}
                  onChange={(e) =>
                    setForm({ ...form, company_id: e.target.value })
                  }
                />
                {touched.id && !form.company_id.trim() && (
                  <div className={danger}>Company ID is required.</div>
                )}
              </label>

              <label className="block">
                <span className={labelCls}>
                  Company Name <span className="text-rose-400">*</span>
                </span>
                <input
                  className={`${fieldCls} ${
                    touched.name && !form.company_name.trim()
                      ? "border-rose-700 focus:ring-rose-500"
                      : ""
                  }`}
                  placeholder="Acme Inc."
                  value={form.company_name}
                  onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                  onChange={(e) =>
                    setForm({ ...form, company_name: e.target.value })
                  }
                />
                {touched.name && !form.company_name.trim() && (
                  <div className={danger}>Company Name is required.</div>
                )}
              </label>

              <label className="block">
                <span className={labelCls}>Legal Name</span>
                <input
                  className={fieldCls}
                  value={form.legal_name}
                  onChange={(e) =>
                    setForm({ ...form, legal_name: e.target.value })
                  }
                />
              </label>

              <label className="block">
                <span className={labelCls}>Trading Name</span>
                <input
                  className={fieldCls}
                  value={form.trading_name}
                  onChange={(e) =>
                    setForm({ ...form, trading_name: e.target.value })
                  }
                />
              </label>

              <label className="block">
                <span className={labelCls}>Company Type</span>
                <input
                  className={fieldCls}
                  placeholder="Private / Public / LLC…"
                  value={form.company_type}
                  onChange={(e) =>
                    setForm({ ...form, company_type: e.target.value })
                  }
                />
              </label>

              <label className="block">
                <span className={labelCls}>Size</span>
                <input
                  className={fieldCls}
                  placeholder="1–10, 11–50, 51–200…"
                  value={form.size}
                  onChange={(e) => setForm({ ...form, size: e.target.value })}
                />
              </label>
            </div>
          )}

          {tab === "contact" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block">
                <span className={labelCls}>Website</span>
                <input
                  className={fieldCls}
                  placeholder="https://…"
                  value={form.website}
                  onChange={(e) =>
                    setForm({ ...form, website: e.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className={labelCls}>LinkedIn</span>
                <input
                  className={fieldCls}
                  placeholder="https://linkedin.com/company/…"
                  value={form.linkedin}
                  onChange={(e) =>
                    setForm({ ...form, linkedin: e.target.value })
                  }
                />
              </label>

              <label className="block md:col-span-2">
                <span className={labelCls}>Head Office Address</span>
                <input
                  className={fieldCls}
                  value={form.head_office_address}
                  onChange={(e) =>
                    setForm({ ...form, head_office_address: e.target.value })
                  }
                />
              </label>

              <label className="block">
                <span className={labelCls}>City/Regency</span>
                <input
                  className={fieldCls}
                  value={form.city_regency}
                  onChange={(e) =>
                    setForm({ ...form, city_regency: e.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className={labelCls}>Country</span>
                <input
                  className={fieldCls}
                  value={form.country}
                  onChange={(e) =>
                    setForm({ ...form, country: e.target.value })
                  }
                />
              </label>

              <label className="block">
                <span className={labelCls}>Postal Code</span>
                <input
                  className={fieldCls}
                  value={form.postal_code}
                  onChange={(e) =>
                    setForm({ ...form, postal_code: e.target.value })
                  }
                />
              </label>

              <label className="block">
                <span className={labelCls}>Main Phone</span>
                <input
                  className={fieldCls}
                  value={form.phone_main}
                  onChange={(e) =>
                    setForm({ ...form, phone_main: e.target.value })
                  }
                />
              </label>

              <label className="block">
                <span className={labelCls}>General Email</span>
                <input
                  className={fieldCls}
                  placeholder="hello@company.com"
                  value={form.email_general}
                  onChange={(e) =>
                    setForm({ ...form, email_general: e.target.value })
                  }
                />
              </label>
            </div>
          )}

          {tab === "profile" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block md:col-span-2">
                <span className={labelCls}>Company Profile</span>
                <textarea
                  rows={5}
                  className={fieldCls}
                  value={form.company_profile}
                  onChange={(e) =>
                    setForm({ ...form, company_profile: e.target.value })
                  }
                  placeholder="Short description, market, products, etc."
                />
                <div className="text-[11px] text-gray-500 mt-1">
                  {profileLen} characters
                </div>
              </label>

              <label className="block">
                <span className={labelCls}>
                  Financial Reports (URL or text)
                </span>
                <input
                  className={fieldCls}
                  placeholder="https://… or free text"
                  value={form.financial_reports}
                  onChange={(e) =>
                    setForm({ ...form, financial_reports: e.target.value })
                  }
                />
              </label>

              <label className="block">
                <span className={labelCls}>Forecast Value (number)</span>
                <input
                  className={fieldCls}
                  inputMode="numeric"
                  placeholder="e.g. 1250000"
                  value={form.forecast_value}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      forecast_value: e.target.value.replace(/[^\d.]/g, ""),
                    })
                  }
                />
              </label>

              <label className="block md:col-span-2">
                <span className={labelCls}>Internal Notes</span>
                <textarea
                  rows={3}
                  className={fieldCls}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </label>
            </div>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="sticky bottom-0 z-10 bg-gray-900/95 backdrop-blur border-t border-gray-700 px-5 py-3 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 hover:border-gray-600 text-sm"
          >
            Cancel
          </button>
          <button
            disabled={saveBusy}
            onClick={onSave}
            className="px-3 py-2 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
          >
            {saveBusy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
