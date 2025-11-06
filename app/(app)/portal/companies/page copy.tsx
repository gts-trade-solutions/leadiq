"use client";

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
  company_name?: string | null;
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

export default function CompaniesPage() {
  const supabase = createClientComponentClient();

  const headers = [
    "Company Name",
    "Company Type",
    "Size",
    "Location",
    "Contacts",
  ];

  // auth/portal
  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

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
  });

  // helpers
  const norm = (v?: string | null) => (v ?? "").toString().trim();
  const includesI = (hay: string, needle: string) =>
    hay.toLowerCase().includes(needle.toLowerCase());

  // detect admin via app_metadata.roles OR profiles.role = 'admin'
  async function detectAdmin() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setUserId(user?.id ?? null);

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

  // load companies
  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/companies", { cache: "no-store" });
      const json = await res.json();

      if (Array.isArray(json?.data)) {
        const pruned = json.data.map((r: any) => {
          // normalize "City, Country"
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

  // filter + search + sort
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

    try {
      const res = await fetch(
        `/api/companies/${encodeURIComponent(company_id)}/full`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to fetch company");

      const c = json.company as CompanyFull;
      setCompanyFull(c);
      const display =
        c.trading_name || c.legal_name || c.company_name || c.company_id;
      setSelectedCompanyName(display ?? company_id);
    } catch (e: any) {
      console.error(e);
      setCompanyError(e?.message || "Failed to load company details");
    } finally {
      setCompanyLoading(false);
    }
  };

  // open contacts modal (show ONLY this user's unlocked contacts)
  const openContactsModal = async (company_id: string) => {
    setSelectedCompanyId(company_id);
    setContactsModalOpen(true);
    setContactsLoading(true);
    setContactsError(null);
    setCompanyContacts([]);
    setSelectedCompanyName("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const res = await fetch(
        `/api/companies/${encodeURIComponent(company_id)}/full`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to fetch contacts");

      const list: ContactMini[] = Array.isArray(json.contacts)
        ? json.contacts
        : [];
      const ids = list.map((c) => c.id).filter(Boolean);

      let unlockedSet = new Set<string>();
      if (ids.length > 0) {
        const { data: unlockedRows, error } = await supabase
          .from("contacts_unlocks")
          .select("contact_id")
          .eq("user_id", user.id)
          .in("contact_id", ids);

        if (error) throw error;
        unlockedSet = new Set(
          (unlockedRows ?? []).map((r: any) => r.contact_id as string)
        );
      }

      const unlocked = list.filter((c) => unlockedSet.has(c.id));
      setCompanyContacts(unlocked);
      setUnlockedCount(unlocked.length);

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

  // admin: download template CSV
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
                <Info label="Notes" value={companyFull.notes} />
              </div>
            </div>
          ) : null}
        </Modal>
      )}

      {/* Contacts Modal — only unlocked contacts are shown */}
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
        <Modal onClose={() => setAddModalOpen(false)} title="Add Company">
          {saveErr && <div className="text-sm text-red-300">{saveErr}</div>}

          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Company ID *">
              <input
                value={form.company_id}
                onChange={(e) =>
                  setForm({ ...form, company_id: e.target.value })
                }
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 hover:border-gray-600 transition-colors"
                placeholder="ACME-001"
              />
            </Field>
            <Field label="Company Name *">
              <input
                value={form.company_name}
                onChange={(e) =>
                  setForm({ ...form, company_name: e.target.value })
                }
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 hover:border-gray-600 transition-colors"
                placeholder="Acme Inc."
              />
            </Field>
            <Field label="Legal Name">
              <input
                value={form.legal_name}
                onChange={(e) =>
                  setForm({ ...form, legal_name: e.target.value })
                }
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300"
              />
            </Field>
            <Field label="Trading Name">
              <input
                value={form.trading_name}
                onChange={(e) =>
                  setForm({ ...form, trading_name: e.target.value })
                }
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300"
              />
            </Field>
            <Field label="Company Type">
              <input
                value={form.company_type}
                onChange={(e) =>
                  setForm({ ...form, company_type: e.target.value })
                }
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300"
                placeholder="Private / Public / LLC…"
              />
            </Field>
            <Field label="Size">
              <input
                value={form.size}
                onChange={(e) => setForm({ ...form, size: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300"
                placeholder="1–10, 11–50, 51–200…"
              />
            </Field>
            <Field label="Website">
              <input
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300"
                placeholder="https://…"
              />
            </Field>
            <Field label="Head Office Address">
              <input
                value={form.head_office_address}
                onChange={(e) =>
                  setForm({ ...form, head_office_address: e.target.value })
                }
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300"
              />
            </Field>
            <Field label="City/Regency">
              <input
                value={form.city_regency}
                onChange={(e) =>
                  setForm({ ...form, city_regency: e.target.value })
                }
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300"
              />
            </Field>
            <Field label="Country">
              <input
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300"
              />
            </Field>
            <Field label="Postal Code">
              <input
                value={form.postal_code}
                onChange={(e) =>
                  setForm({ ...form, postal_code: e.target.value })
                }
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300"
              />
            </Field>
            <Field label="Main Phone">
              <input
                value={form.phone_main}
                onChange={(e) =>
                  setForm({ ...form, phone_main: e.target.value })
                }
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300"
              />
            </Field>
            <Field label="General Email">
              <input
                value={form.email_general}
                onChange={(e) =>
                  setForm({ ...form, email_general: e.target.value })
                }
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300"
                placeholder="hello@company.com"
              />
            </Field>
            <Field label="LinkedIn">
              <input
                value={form.linkedin}
                onChange={(e) => setForm({ ...form, linkedin: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300"
                placeholder="https://linkedin.com/company/…"
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Notes">
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300"
                  rows={3}
                />
              </Field>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setAddModalOpen(false)}
              className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm hover:border-gray-600"
            >
              Cancel
            </button>
            <button
              disabled={saveBusy}
              onClick={async () => {
                try {
                  setSaveBusy(true);
                  setSaveErr(null);
                  if (!form.company_id.trim() || !form.company_name.trim()) {
                    throw new Error("Company ID and Company Name are required");
                  }
                  const payload = { ...form };
                  const res = await fetch("/api/companies", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                  });
                  const json = await res.json();
                  if (!res.ok)
                    throw new Error(json?.error || "Failed to create company");
                  setAddModalOpen(false);
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
                  });
                  await load();
                } catch (e: any) {
                  setSaveErr(e?.message || "Failed to add company");
                } finally {
                  setSaveBusy(false);
                }
              }}
              className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm disabled:opacity-60"
            >
              {saveBusy ? "Saving…" : "Save"}
            </button>
          </div>
        </Modal>
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
