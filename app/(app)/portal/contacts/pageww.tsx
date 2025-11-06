"use client";

import { useEffect, useMemo, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import Table from "@/components/Table";
import {
  Facebook,
  Instagram,
  Linkedin,
  Search as SearchIcon,
  SortAsc,
  SortDesc,
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
};

export default function ContactsPage() {
  const headers = ["Name", "Email", "Title", "Company", "Location", "Phone", "Social"];

  const [allRows, setAllRows] = useState<Row[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<15 | 30 | 50>(15);
  const startIdx = (page - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, rows.length);

  // search + sort
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "title" | "company" | "location">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // ─────────────── data load (no auth, no credits) ───────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch("/api/contacts/public", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load contacts");
        setAllRows(json.rows || []);
      } catch (e: any) {
        setErrorMsg(e?.message || "Failed to load contacts");
        setAllRows([]);
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // derive filtered/sorted rows
  useEffect(() => {
    let filtered = allRows.filter((r) =>
      [r.name, r.title, r.company, r.location]
        .map((s) => (s || "").toString().toLowerCase())
        .join(" ")
        .includes(search.toLowerCase())
    );

    filtered.sort((a, b) => {
      const av = (a[sortKey] ?? "").toLowerCase();
      const bv = (b[sortKey] ?? "").toLowerCase();
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });

    setRows(filtered);
    setPage(1);
  }, [allRows, search, sortKey, sortDir]);

  const currentRows = useMemo(() => rows.slice(startIdx, endIdx), [rows, startIdx, endIdx]);
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const SocialCell = ({ r }: { r: Row }) => {
    const linkCls =
      "inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-gray-700 transition-colors";
    return (
      <div className="flex items-center gap-1">
        {r.linkedin_url ? (
          <a href={r.linkedin_url} target="_blank" rel="noopener noreferrer" className={linkCls}>
            <Linkedin className="w-4 h-4" />
          </a>
        ) : null}
        {r.facebook_url ? (
          <a href={r.facebook_url} target="_blank" rel="noopener noreferrer" className={linkCls}>
            <Facebook className="w-4 h-4" />
          </a>
        ) : null}
        {r.instagram_url ? (
          <a href={r.instagram_url} target="_blank" rel="noopener noreferrer" className={linkCls}>
            <Instagram className="w-4 h-4" />
          </a>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <SectionHeader title="Contacts" description="Browse the entire contact database" />

      {/* Search + Sort */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
        <div className="grid md:grid-cols-12 gap-3">
          <div className="md:col-span-6">
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

          <div className="md:col-span-6 flex items-end gap-2">
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
        </div>
      </div>

      {/* Table */}
      {errorMsg ? (
        <div className="rounded-lg border border-red-700 bg-red-900/20 p-4 text-sm text-red-200">
          {errorMsg}
        </div>
      ) : loading ? (
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-10 text-center">
          <p className="text-gray-300">Loading…</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-10 text-center">
          <p className="text-gray-300">No contacts yet.</p>
        </div>
      ) : (
        <>
          <Table
            headers={headers}
            data={currentRows.map((r) => ({
              name: <span className="font-medium">{r.name}</span>,
              email: r.email || "—",
              title: r.title || "—",
              company: r.company || "—",
              location: r.location || "—",
              phone: r.phone || "—",
              Social: <SocialCell r={r} />,
            }))}
          />

          {/* Pagination */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 py-4">
            <div className="text-sm text-gray-400">
              Showing <b>{rows.length === 0 ? 0 : startIdx + 1}</b>–
              <b>{endIdx}</b> of <b>{rows.length}</b>
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
    </div>
  );
}
