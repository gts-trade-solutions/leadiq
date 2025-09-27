"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import Table from "@/components/Table";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import {
  Plus,
  Upload,
  Facebook,
  Instagram,
  Linkedin,
  Search as SearchIcon,
  SortAsc,
  SortDesc,
  Lock,
  LockOpen,
  Shield,
  ShieldAlert,
  Wallet
} from "lucide-react";

type Row = {
  id: string;
  name: string;
  title: string;
  company: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin_url?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  is_unlocked: boolean;
};

type CompanyRef = { company_id: string; company_name: string };

export default function ContactsPage() {
  const supabase = createClientComponentClient();

  const headers = ["Name", "Email", "Title", "Company", "Location", "Phone", "Social", "Actions"];

  // data & ui state
  const [allRows, setAllRows] = useState<Row[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // auth/admin
  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // wallet
  const [wallet, setWallet] = useState<number | null>(null);

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<15 | 30 | 50>(15);
  const startIdx = (page - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, rows.length);

  // search/filters/sort
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<{ title: string; company: string; status: "all" | "locked" | "unlocked" }>({
    title: "",
    company: "",
    status: "all",
  });
  const [sortKey, setSortKey] = useState<"name" | "title" | "company" | "location">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);

  // unlock (single)
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [confirmUnlockId, setConfirmUnlockId] = useState<string | null>(null);

  // bulk unlock
  const [showBulk, setShowBulk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  // add contact modal
  const [showAdd, setShowAdd] = useState(false);
  const [companies, setCompanies] = useState<CompanyRef[]>([]);
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    company_id: "",
    contact_name: "",
    title: "",
    department: "",
    email: "",
    phone: "",
    location: "",
    notes: "",
    linkedin_url: "",
    facebook_url: "",
    instagram_url: "",
  });

  // ─────────────────── helpers ───────────────────
  const norm = (v?: string | null) => (v ?? "").toString().trim();
  const includesI = (hay: string, needle: string) => hay.toLowerCase().includes(needle.toLowerCase());
  function matchesSearch(r: Row, q = search) {
    const s = norm(q);
    if (!s) return true;
    const hay = [r.name, r.title, r.company, r.location].map(norm).join(" | ");
    return includesI(hay, s);
  }

  async function refreshWallet() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setWallet(null); return; }
      const { data } = await supabase.from("wallet").select("balance").eq("user_id", user.id).maybeSingle();
      setWallet(data?.balance ?? 0);
    } catch {
      // leave wallet unchanged
    }
  }

  // detect admin via user/app metadata OR profiles.is_admin (if present)
async function detectAdmin() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { setIsAdmin(false); setUserId(null); return; }

  setUserId(user.id);

  // app_metadata roles (optional extra path)
  const viaAppMeta = Array.isArray((user.app_metadata as any)?.roles) &&
                     (user.app_metadata as any).roles.includes('admin');

  // profiles.role
  const { data: prof } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
console.log(prof)
  const viaProfiles = prof?.role === 'admin';

  setIsAdmin(viaAppMeta || viaProfiles);
}

  // ─────────────────── load contacts ───────────────────
  async function load() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.rpc("contacts_list");
      if (error) throw error;

      const mapped: Row[] = (data ?? []).map((c: any) => ({
        id: c.id,
        name: c.name ?? "",
        title: c.title ?? "",
        company: c.company ?? "",
        email: c.email ?? null,
        phone: c.phone ?? null,
        location: c.location ?? null,
        linkedin_url: c.linkedin_url ?? null,
        facebook_url: c.facebook_url ?? null,
        instagram_url: c.instagram_url ?? null,
        is_unlocked: !!c.is_unlocked,
      }));

      setAllRows(mapped);
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to load contacts");
      setAllRows([]);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await detectAdmin();
      await refreshWallet();
      await load();
    })();
  }, []);

  // refresh wallet whenever the confirm modal opens
  useEffect(() => {
    if (confirmUnlockId) { refreshWallet(); }
  }, [confirmUnlockId]);

  // popular titles → “Others”
  const TITLE_TOP_N = 8;
  const popularTitleSet = useMemo(() => {
    const count = new Map<string, number>();
    allRows.forEach((r) => {
      const t = norm(r.title);
      if (!t) return;
      count.set(t, (count.get(t) ?? 0) + 1);
    });
    return new Set(
      Array.from(count.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, TITLE_TOP_N)
        .map(([t]) => t)
    );
  }, [allRows]);

  const companyOptions = useMemo(() => {
    const base = allRows.filter((r) => {
      const titlePass = !filters.title
        ? true
        : filters.title === "Others"
        ? !popularTitleSet.has(norm(r.title))
        : norm(r.title) === norm(filters.title);
      const statusPass = filters.status === "all" ? true : filters.status === "locked" ? !r.is_unlocked : r.is_unlocked;
      return matchesSearch(r) && titlePass && statusPass;
    });
    return Array.from(new Set(base.map((r) => norm(r.company)).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [allRows, filters.title, filters.status, search, popularTitleSet]);

  const titleOptions = useMemo(() => {
    const base = allRows.filter((r) => {
      const companyPass = !filters.company || norm(r.company) === norm(filters.company);
      const statusPass = filters.status === "all" ? true : filters.status === "locked" ? !r.is_unlocked : r.is_unlocked;
      return matchesSearch(r) && companyPass && statusPass;
    });
    const titles = Array.from(new Set(base.map((r) => norm(r.title)).filter(Boolean)));
    const popular = titles.filter((t) => popularTitleSet.has(t)).sort((a, b) => a.localeCompare(b));
    const hasOthers = titles.some((t) => !popularTitleSet.has(t)) || titles.length === 0;
    return hasOthers ? [...popular, "Others"] : popular;
  }, [allRows, filters.company, filters.status, search, popularTitleSet]);

  // derive filtered/sorted rows
  useEffect(() => {
    let filtered = allRows.filter((r) => matchesSearch(r));
    if (filters.company) filtered = filtered.filter((r) => norm(r.company) === norm(filters.company));
    if (filters.title) {
      filtered =
        filters.title === "Others"
          ? filtered.filter((r) => !popularTitleSet.has(norm(r.title)))
          : filtered.filter((r) => norm(r.title) === norm(filters.title));
    }
    if (filters.status === "locked") filtered = filtered.filter((r) => !r.is_unlocked);
    if (filters.status === "unlocked") filtered = filtered.filter((r) => r.is_unlocked);

    filtered.sort((a, b) => {
      const av = norm(a[sortKey]).toLowerCase();
      const bv = norm(b[sortKey]).toLowerCase();
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });

    setRows(filtered);
    setPage(1);
  }, [allRows, search, filters, sortKey, sortDir, popularTitleSet]);

  function clearFilters() {
    setSearch("");
    setFilters({ title: "", company: "", status: "all" });
    setSortKey("name");
    setSortDir("asc");
  }

  // ─────────────────── unlocks ───────────────────
  const lockedIdsOnFilter = useMemo(() => rows.filter((r) => !r.is_unlocked).map((r) => r.id), [rows]);
  const lockedCount = lockedIdsOnFilter.length;
  const bulkTotal = lockedCount * 5;
  const bulkEnough = wallet == null ? true : wallet >= bulkTotal;

  async function unlockContact(id: string) {
    try {
      setUnlockingId(id);
      // hard stop if not enough credits
      await refreshWallet();
      if ((wallet ?? 0) < 5) {
        alert("Insufficient credit balance. Please add credits to unlock this contact.");
        return;
      }

      // ensure session
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) { const { data } = await supabase.auth.refreshSession(); session = data.session ?? null; }
      if (!session?.access_token) { alert("Please sign in and try again."); return; }

      // existing RPC charge is 5 credits per contact
      const { error } = await supabase.rpc("unlock_contact", { p_contact_id: id, p_price: 5 });
      if (error) { alert(error.message || "Unlock failed"); return; }

      await load();
      await refreshWallet();
    } finally {
      setUnlockingId(null);
      setConfirmUnlockId(null);
    }
  }

  async function openBulkDialog() {
    await refreshWallet();
    setShowBulk(true);
  }

  async function doBulkUnlock() {
    try {
      setBulkBusy(true);
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) { const { data } = await supabase.auth.refreshSession(); session = data.session ?? null; }
      if (!session?.access_token) { alert("Please sign in and try again."); return; }
      const { data, error } = await supabase.rpc("unlock_contacts_bulk", { p_contact_ids: lockedIdsOnFilter, p_price: 5 });
      if (error) { alert(error.message); return; }
      if (data?.insufficient_credits || data?.status === "INSUFFICIENT_CREDITS") {
        alert("Your credits are not enough to unlock all selected contacts.");
        return;
      }
      setShowBulk(false);
      await load();
      await refreshWallet();
    } finally {
      setBulkBusy(false);
    }
  }

  // ─────────────────── upload ───────────────────
  const onUploadClick = () => fileRef.current?.click();
  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload/contacts", { method: "POST", body: fd });
      const json = await res.json();
      setUploadResult(json);
      if (!json?.dryRun) await load();
    } catch (err) {
      setUploadResult({ inserted: 0, errors: [{ row: -1, error: "Upload failed" }] });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // derived for table & counts
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => setPage(1), [pageSize]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);
  const currentRows = useMemo(() => rows.slice(startIdx, endIdx), [rows, startIdx, endIdx]);
  const lockedVisible = rows.filter((r) => !r.is_unlocked).length;
  const unlockedVisible = rows.filter((r) => r.is_unlocked).length;

  const SocialCell = ({ r }: { r: Row }) => {
    const linkCls = "inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-gray-700 transition-colors";
    const disabledCls = "inline-flex items-center justify-center w-8 h-8 rounded-md opacity-40 cursor-not-allowed";
    const Wrap = ({ children }: any) => <div className="flex items-center gap-1">{children}</div>;
    if (!r.is_unlocked) {
      return (
        <Wrap>
          <span className={disabledCls} title="Unlock to view"><Linkedin className="w-4 h-4" /></span>
          <span className={disabledCls} title="Unlock to view"><Facebook className="w-4 h-4" /></span>
          <span className={disabledCls} title="Unlock to view"><Instagram className="w-4 h-4" /></span>
        </Wrap>
      );
    }
    return (
      <Wrap>
        {r.linkedin_url ? <a href={r.linkedin_url} target="_blank" rel="noopener noreferrer" className={linkCls}><Linkedin className="w-4 h-4" /></a> : <span className={disabledCls}><Linkedin className="w-4 h-4" /></span>}
        {r.facebook_url ? <a href={r.facebook_url} target="_blank" rel="noopener noreferrer" className={linkCls}><Facebook className="w-4 h-4" /></a> : <span className={disabledCls}><Facebook className="w-4 h-4" /></span>}
        {r.instagram_url ? <a href={r.instagram_url} target="_blank" rel="noopener noreferrer" className={linkCls}><Instagram className="w-4 h-4" /></a> : <span className={disabledCls}><Instagram className="w-4 h-4" /></span>}
      </Wrap>
    );
  };

  const canAffordSingle = (wallet ?? 0) >= 5;

  return (
    <div className="space-y-6">
      <SectionHeader title="Contacts" description="Manage your contact database and track engagement">
        {/* Admin badge & Wallet */}
        {isAdmin && (
          <span className="hidden md:inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-emerald-900/40 text-emerald-200 border border-emerald-700">
            <Shield className="w-3 h-3" /> Admin
          </span>
        )}
        <span className="inline-flex items-center gap-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200">
          <Wallet className="w-4 h-4" />
          Credits: <b>{wallet ?? "…"}</b>
        </span>

        {/* Admin-only: Template / Upload / Add Contact */}
        {isAdmin && (
          <>
            <button
              onClick={() => {
                const cols = ["company_id","contact_name","title","department","email","phone","location","notes","linkedin_url","facebook_url","instagram_url"];
                const csv = cols.join(",") + "\n";
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = "contacts_template.csv"; a.click(); URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium"
            >
              Template
            </button>

            <button
              onClick={onUploadClick}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium disabled:opacity-60"
              disabled={uploading}
            >
              <Upload className="w-4 h-4" />
              {uploading ? "Uploading…" : "Upload"}
            </button>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onFileChange} />

            <button
              onClick={() => { 
                setShowAdd(true); 
                (async () => {
                  const { data } = await supabase.from("companies").select("company_id, company_name").order("company_name");
                  setCompanies((data || []) as CompanyRef[]);
                })(); 
              }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Add Contact
            </button>
          </>
        )}

        {/* Unlock All (filtered) */}
        <button
          onClick={openBulkDialog}
          disabled={lockedCount === 0}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          title={lockedCount === 0 ? "No locked contacts in current filter" : "Unlock all locked contacts in current filter"}
        >
          <LockOpen className="w-4 h-4" />
          Unlock All ({lockedCount})
        </button>
      </SectionHeader>

      {/* Search + Filters + Sort */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
        <div className="grid md:grid-cols-12 gap-3">
          <div className="md:col-span-4">
            <label className="text-xs text-gray-400 block mb-1">Search</label>
            <div className="relative">
              <SearchIcon className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, title, company or location…"
                className="w-full pl-8 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 hover:border-gray-600 transition-colors"
              />
            </div>
          </div>

          {/* Title filter */}
          <div className="md:col-span-3">
            <label className="text-xs text-gray-400 block mb-1">Title</label>
            <select
              value={filters.title}
              onChange={(e) => setFilters((f) => ({ ...f, title: e.target.value }))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 hover:border-gray-600 transition-colors"
            >
              <option value="">All titles</option>
              {useMemo(() => titleOptions, [titleOptions]).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Company filter */}
          <div className="md:col-span-3">
            <label className="text-xs text-gray-400 block mb-1">Company</label>
            <select
              value={filters.company}
              onChange={(e) => setFilters((f) => ({ ...f, company: e.target.value }))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 hover:border-gray-600 transition-colors"
            >
              <option value="">All companies</option>
              {useMemo(() => companyOptions, [companyOptions]).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className="md:col-span-2">
            <label className="text-xs text-gray-400 block mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as any }))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 hover:border-gray-600 transition-colors"
            >
              <option value="all">All</option>
              <option value="locked">Locked</option>
              <option value="unlocked">Unlocked</option>
            </select>
          </div>

          {/* Sort */}
          <div className="md:col-span-12 flex items-end gap-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400">Sort by</label>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as any)}
                className="px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm"
              >
                <option value="name">Name</option>
                <option value="title">Title</option>
                <option value="company">Company</option>
                <option value="location">Location</option>
              </select>
              <button
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                className="px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm flex items-center gap-1"
                title={sortDir === "asc" ? "Ascending (A→Z)" : "Descending (Z→A)"}
              >
                {sortDir === "asc" ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />}
                {sortDir === "asc" ? "A→Z" : "Z→A"}
              </button>
            </div>

            <div className="ml-auto flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> {lockedVisible} locked</span>
              <span className="flex items-center gap-1"><LockOpen className="w-3 h-3" /> {unlockedVisible} unlocked</span>
              <button onClick={clearFilters} className="px-3 py-2 bg-gray-800 border border-gray-700 hover:border-gray-600 rounded-lg text-sm">Clear</button>
              <span>Showing <b>{rows.length}</b> of <b>{allRows.length}</b></span>
            </div>
          </div>
        </div>
      </div>

      {errorMsg ? (
        <div className="rounded-lg border border-red-700 bg-red-900/20 p-4 text-sm text-red-200">{errorMsg}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-10 text-center">
          <p className="text-gray-300">No contacts yet.</p>
        </div>
      ) : (
        <>
          <Table
            headers={headers}
            data={currentRows.map((r) => ({
              name: (
                <div className="flex flex-col">
                  <span className="font-medium">{r.name}</span>
                </div>
              ),
              email: r.is_unlocked ? (r.email || "—") : <span className="text-gray-400">••••••••••</span>,
              title: r.title || "—",
              company: r.company || "—",
              location: r.is_unlocked ? (r.location || "—") : <span className="text-gray-400">••••••••••</span>,
              phone: r.is_unlocked ? (r.phone || "—") : <span className="text-gray-400">••••••••••</span>,
              Social: <SocialCell r={r} />,
              Actions: r.is_unlocked ? (
                <span className="text-xs text-center text-emerald-400">Unlocked</span>
              ) : (
                <button
                  onClick={() => setConfirmUnlockId(r.id)}
                  className="px-2 py-1 text-xs rounded-md bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
                >
                  Click to Unlock
                </button>
              ),
            }))}
          />

          {/* Pagination */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 py-4">
            <div className="text-sm text-gray-400">
              Showing <b>{rows.length === 0 ? 0 : startIdx + 1}</b>–<b>{endIdx}</b> of <b>{rows.length}</b>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-300">
                Rows per page:{" "}
                <select
                  className="ml-2 bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-sm"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value) as 15 | 30 | 50)}
                >
                  <option value={15}>15</option>
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                </select>
              </label>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 rounded-md bg-gray-800 border border-gray-700 text-sm disabled:opacity-50">« First</button>
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 rounded-md bg-gray-800 border border-gray-700 text-sm disabled:opacity-50">‹ Prev</button>
                {Array.from({ length: Math.min(7, Math.max(1, totalPages)) }).map((_, i) => {
                  const n = i + Math.max(1, Math.min(page - 3, totalPages - 6));
                  return (
                    <button
                      key={n}
                      onClick={() => setPage(n)}
                      className={`px-2 py-1 rounded-md border text-sm ${
                        n === page ? "bg-emerald-600 border-emerald-600 text-white" : "bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700"
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 rounded-md bg-gray-800 border border-gray-700 text-sm disabled:opacity-50">Next ›</button>
                <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-2 py-1 rounded-md bg-gray-800 border border-gray-700 text-sm disabled:opacity-50">Last »</button>
              </div>
              <div className="text-sm text-gray-400">Page <b>{page}</b> of <b>{totalPages}</b></div>
            </div>
          </div>
        </>
      )}

      {/* Confirm Unlock Modal (single) */}
      {confirmUnlockId && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4">
          <div className="w-full max-w-sm rounded-xl border border-gray-700 bg-gray-900 p-5">
            <h3 className="text-lg font-semibold text-white">Unlock contact</h3>

            {(wallet ?? 0) < 5 ? (
              <div className="text-sm text-amber-200 mt-2 space-y-2">
                  You have <b>{wallet ?? 0}</b> credits. You need at least <b>5</b> to unlock this contact.
                <div className="flex items-center justify-end gap-2">
                  <a href="/pricing" className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm">Buy credits</a>
                  <button onClick={() => setConfirmUnlockId(null)} className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm hover:border-gray-600">Close</button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-300 mt-2">
                  Spend <b>5 credits</b> to unlock this contact’s details. You won’t be charged again for this contact.
                </p>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button onClick={() => setConfirmUnlockId(null)} className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm hover:border-gray-600">Cancel</button>
                  <button
                    onClick={() => unlockContact(confirmUnlockId)}
                    disabled={unlockingId === confirmUnlockId}
                    className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm disabled:opacity-60"
                  >
                    {unlockingId === confirmUnlockId ? "Unlocking…" : "Unlock • 5 credits"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Bulk Unlock Modal */}
      {showBulk && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-5">
            <h3 className="text-lg font-semibold text-white">Unlock all filtered contacts</h3>
            <div className="text-sm text-gray-300 mt-2 space-y-1">
              <div>Locked contacts in current filter: <b>{lockedCount}</b></div>
              <div>Price: <b>{lockedCount}</b> × <b>5</b> = <b>{bulkTotal}</b> credits</div>
              <div>Your credits: <b>{wallet ?? "…"}</b></div>
              {!bulkEnough && (
                <div className="mt-1 inline-flex items-center gap-2 text-amber-300">
                  <ShieldAlert className="w-4 h-4" /> Your credits are not enough to unlock all contacts.
                </div>
              )}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              {!bulkEnough && <a href="/pricing" className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm">Buy credits</a>}
              <button onClick={() => setShowBulk(false)} className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm hover:border-gray-600">Cancel</button>
              <button
                onClick={doBulkUnlock}
                disabled={bulkBusy || !bulkEnough || lockedCount === 0}
                className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm disabled:opacity-60"
              >
                {bulkBusy ? "Purchasing…" : `Unlock ${lockedCount}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Contact Modal (Admin only) */}
      {isAdmin && showAdd && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4">
          <div className="w-full max-w-3xl rounded-xl border border-gray-700 bg-gray-900">
            <div className="px-5 pt-5 pb-3 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Add Contact</h3>
              {addErr && <div className="text-sm text-red-300">{addErr}</div>}
            </div>

            <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
              <div className="grid md:grid-cols-3 gap-3">
                <div className="md:col-span-3">
                  <label className="text-xs text-gray-400 block mb-1">Company</label>
                  <select
                    value={form.company_id}
                    onChange={(e) => setForm({ ...form, company_id: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300"
                  >
                    <option value="">Select company…</option>
                    {companies.map((c) => (
                      <option key={c.company_id} value={c.company_id}>
                        {c.company_name} ({c.company_id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-400 block mb-1">Name</label>
                  <input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300" placeholder="Jane Doe" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Title</label>
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300" placeholder="Head of Marketing" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Department</label>
                  <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300" placeholder="Marketing" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Email</label>
                  <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300" placeholder="jane@company.com" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Phone</label>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300" placeholder="+1 555 0100" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Location</label>
                  <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300" placeholder="City, Country" />
                </div>
                <div className="md:col-span-3">
                  <label className="text-xs text-gray-400 block mb-1">Notes</label>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300" rows={3} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">LinkedIn URL</label>
                  <input value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Facebook URL</label>
                  <input value={form.facebook_url} onChange={(e) => setForm({ ...form, facebook_url: e.target.value })} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Instagram URL</label>
                  <input value={form.instagram_url} onChange={(e) => setForm({ ...form, instagram_url: e.target.value })} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300" />
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-800 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setShowAdd(false);
                  setAddErr(null);
                  setForm({ company_id: "", contact_name: "", title: "", department: "", email: "", phone: "", location: "", notes: "", linkedin_url: "", facebook_url: "", instagram_url: "" });
                }}
                className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm hover:border-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    setAddBusy(true);
                    setAddErr(null);
                    if (!form.company_id || !form.contact_name) throw new Error("Company and Name are required");
                    const payload: any = {
                      company_id: form.company_id,
                      contact_name: form.contact_name,
                      title: form.title || null,
                      department: form.department || null,
                      email: form.email || null,
                      phone: form.phone || null,
                      location: form.location || null,
                      notes: form.notes || null,
                      linkedin_url: form.linkedin_url || null,
                      facebook_url: form.facebook_url || null,
                      instagram_url: form.instagram_url || null,
                    };
                    const { error } = await supabase.from("contacts").insert(payload);
                    if (error) throw error;
                    setShowAdd(false);
                    setForm({ company_id: "", contact_name: "", title: "", department: "", email: "", phone: "", location: "", notes: "", linkedin_url: "", facebook_url: "", instagram_url: "" });
                    await load();
                  } catch (e: any) {
                    setAddErr(e?.message || "Failed to add contact");
                  } finally {
                    setAddBusy(false);
                  }
                }}
                disabled={addBusy}
                className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm disabled:opacity-60"
              >
                {addBusy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
