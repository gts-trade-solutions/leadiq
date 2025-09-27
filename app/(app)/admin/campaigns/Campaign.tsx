// app/campaigns/page.tsx

"use client";
export const dynamic = 'force-dynamic'
import { useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import SectionHeader from "@/components/SectionHeader";
import Table from "@/components/Table";
import StatCard from "@/components/StatCard";
import WalletBadge from "@/components/WalletBadge";
import { useSupabase } from "@/integrations/supabase/client";
import {
  getMySender,
  startEmailVerify,
  checkEmailStatus,
  changesLeft,
  type EmailIdentityRow,
} from "@/lib/sender";
import { Plus, Filter, Mail, Info, RefreshCcw, ShieldCheck } from "lucide-react";

type CampaignRow = { id: string; name: string; status: string; created_at: string };
type SimpleMetric = { campaign_id: string; recipients: number; queued: number };
type RecipientRecord = { contact_id: string; contact_name: string | null; email: string };
type SelectionMode = "all" | "filtered" | "selected";

const CHANGE_LIMIT = 2;

export default function CampaignsPage() {
  const supabase = useSupabase();

  // page
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<null | { kind: "success" | "error" | "info" | "warn"; msg: string }>(null);

  // sender
  const [fromEmail, setFromEmail] = useState("");
  const [identityId, setIdentityId] = useState<string | null>(null);
  const [verStatus, setVerStatus] = useState<"idle" | "pending" | "verified" | "failed" | "error">("idle");
  const [mySender, setMySender] = useState<EmailIdentityRow | null>(null);
  const latestStatus: "idle" | "pending" | "verified" | "failed" | "error" =
    verStatus !== "idle" ? verStatus : (mySender?.status as any) ?? "idle";
  const isVerified = latestStatus === "verified";
  const left = changesLeft(mySender, CHANGE_LIMIT);
  const [editingSender, setEditingSender] = useState(false);

  // campaigns
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [campMetrics, setCampMetrics] = useState<Record<string, SimpleMetric>>({});
  const [campaignName, setCampaignName] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");

  // credits + test send
  const [availableCredits, setAvailableCredits] = useState<number | null>(null);
  const [testTo, setTestTo] = useState("");

  // recipients (no company/title facets — only search + selection)
  const [showRecipients, setShowRecipients] = useState(false);
  const [recLoading, setRecLoading] = useState(false);
  const [allUnlocked, setAllUnlocked] = useState<RecipientRecord[]>([]);
  const [visible, setVisible] = useState<RecipientRecord[]>([]);
  const [unlockedCount, setUnlockedCount] = useState<number>(0);
  const [recSearch, setRecSearch] = useState("");
  const [mode, setMode] = useState<SelectionMode>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filteredCount, setFilteredCount] = useState<number>(0);

  // derived
  const recipientsToSend =
    mode === "selected" ? selectedIds.size : mode === "filtered" ? filteredCount : allUnlocked.length;
  const canAfford = (availableCredits ?? 0) >= recipientsToSend;

  // headers / table (Sent only)
  const headers = ["Campaign Name", "Status", "Sent"];

  // ---- lifecycle ----
  useEffect(() => {
    refreshMySender(true);
    void loadCampaigns();
  }, []);

  useEffect(() => {
    setEditingSender(!isVerified);
  }, [isVerified]);

  useEffect(() => {
    if (showModal) {
      refreshMySender();
      refreshCredits();
    }
  }, [showModal]);

  // metrics polling (Sent only)
  useEffect(() => {
    if (!campaigns.length) return;
    void refreshMetrics();
    const t = setInterval(() => refreshMetrics(), 5000);
    return () => clearInterval(t);
  }, [campaigns]);

  // recipients load (NO title/company)
  useEffect(() => {
    if (!showModal || !showRecipients) return;
    (async () => {
      setRecLoading(true);
      const { data, error } = await supabase
        .from("unlocked_contacts_v")
        .select("contact_id,contact_name,email")
        .order("contact_name", { ascending: true })
        .limit(5000);
      if (error) {
        setBanner({ kind: "error", msg: error.message || "Failed to load contacts." });
        setRecLoading(false);
        return;
      }

      // de-dupe by email
      const map = new Map<string, RecipientRecord>();
      (data ?? []).forEach((r: any) => {
        const key = (r.email || "").trim().toLowerCase();
        if (!key) return;
        if (!map.has(key)) map.set(key, r as RecipientRecord);
      });
      const list = Array.from(map.values());

      setAllUnlocked(list);
      setUnlockedCount(list.length);
      setRecLoading(false);
    })();
  }, [showModal, showRecipients, supabase]);

  // apply search filter locally
  useEffect(() => {
    if (!showRecipients) return;
    const q = recSearch.trim().toLowerCase();
    let filtered = allUnlocked;
    if (q) {
      filtered = filtered.filter(
        (r) =>
          (r.contact_name || "").toLowerCase().includes(q) ||
          (r.email || "").toLowerCase().includes(q)
      );
    }
    setFilteredCount(filtered.length);
    setVisible(filtered.slice(0, 500));
  }, [allUnlocked, recSearch, showRecipients]);

  // ---- data helpers ----
  async function refreshMySender(prefill = false) {
    try {
      const row = await getMySender(supabase);
      setMySender(row);
      if (prefill && row?.email) setFromEmail(row.email);
      if (row?.status) setVerStatus(row.status as any);
    } catch {/* no-op */}
  }

  async function refreshCredits() {
    const session = (await supabase.auth.getSession()).data.session;
    const uid = session?.user?.id;
    if (!uid) return setAvailableCredits(0);

    // Use wallet view for accurate live balance
    const { data, error } = await supabase
      .from("wallet")
      .select("balance")
      .eq("user_id", uid)
      .single();

    if (error) setAvailableCredits(0);
    else setAvailableCredits((data?.balance as number) ?? 0);
  }

  async function loadCampaigns() {
    const { data: camps } = await supabase
      .from("campaigns")
      .select("id,name,status,created_at")
      .order("created_at", { ascending: false });
    setCampaigns(camps ?? []);
  }

  async function refreshMetrics() {
    const ids = campaigns.map((c) => c.id);
    if (!ids.length) return;

    const { data, error } = await supabase
      .from("campaign_recipients")
      .select("campaign_id,status")
      .in("campaign_id", ids);

    if (error) return;

    const agg: Record<string, SimpleMetric> = {};
    campaigns.forEach((c) => (agg[c.id] = { campaign_id: c.id, recipients: 0, queued: 0 }));

    (data ?? []).forEach((r: any) => {
      const a = agg[r.campaign_id];
      a.recipients++;
      if (r.status === "queued") a.queued++;
    });

    setCampMetrics(agg);
  }

  // ---- actions ----
  async function handleStartVerify() {
    if (!fromEmail) return;

    const currentEmail = mySender?.email?.trim().toLowerCase();
    const targetEmail = fromEmail.trim().toLowerCase();
    const isNew = !currentEmail || currentEmail !== targetEmail;

    if (isNew && left === 0) {
      setBanner({ kind: "error", msg: "Change limit reached (2/2). Contact support to reset." });
      return;
    }
    if (mySender && isNew) {
      const ok = confirm(`Replace your current sender:\n${mySender.email}\n→ ${fromEmail}?`);
      if (!ok) return;
    }

    setBusy(true);
    setBanner(null);
    try {
      const resp = await startEmailVerify(supabase, fromEmail);
      setIdentityId(resp?.id ?? null);
      setVerStatus("pending");
      await refreshMySender();
      setBanner({ kind: "success", msg: "Verification email sent. Check your inbox to confirm." });
    } catch (e: any) {
      const msg = e?.json?.error || e?.message || "Could not start verification. Please try again later.";
      setVerStatus("error");
      setBanner({ kind: "error", msg });
    } finally {
      setBusy(false);
    }
  }

  async function pollVerification() {
    if (!fromEmail && !identityId) return;
    setBusy(true);
    try {
      const args = identityId ? { identityId } : { email: fromEmail };
      const resp = await checkEmailStatus(supabase, args);
      setVerStatus(resp.status);
      if (resp.status === "verified") {
        setBanner({ kind: "success", msg: "Sender verified! You can send from this address now." });
        await refreshMySender();
        setEditingSender(false);
      } else if (resp.status === "pending") {
        setBanner({ kind: "info", msg: "Still pending — please complete verification from your inbox." });
      } else if (resp.status === "failed") {
        setBanner({ kind: "error", msg: "Verification failed. Please try again later." });
      }
    } catch {
      setBanner({ kind: "error", msg: "Could not fetch status. Please try again later." });
    } finally {
      setBusy(false);
    }
  }

  async function sendTestEmail() {
    if (!testTo) return;
    setBusy(true);
    setBanner(null);
    try {
      const { error } = await supabase.functions.invoke("email-send-test", { body: { to: testTo } });
      if (error) {
        const status = (error as any)?.status ?? 500;
        if (status === 402) setBanner({ kind: "warn", msg: "Not enough credits. Please top up." });
        else setBanner({ kind: "error", msg: (error as any)?.message || "Test send failed." });
        return;
      }
      setBanner({ kind: "success", msg: "Test email sent!" });
      setTestTo("");
      await refreshCredits();
    } catch (e: any) {
      setBanner({ kind: "error", msg: e?.message || "Test send failed." });
    } finally {
      setBusy(false);
    }
  }

  async function createAndSend() {
    if (!fromEmail) {
      setBanner({ kind: "warn", msg: "Please enter and verify a From address before creating a campaign." });
      return;
    }
    if (!isVerified) {
      setBanner({ kind: "warn", msg: "Sender not verified yet. Please verify." });
      return;
    }
    if (recipientsToSend === 0) {
      setBanner({ kind: "warn", msg: "No recipients to send to." });
      return;
    }

    setBusy(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token || "";
      const base = process.env.NEXT_PUBLIC_SUPABASE_FUNCTION_URL as string;
      if (!base) throw new Error("Missing NEXT_PUBLIC_SUPABASE_FUNCTION_URL");

      const payload: any = {
        name: campaignName || "Untitled",
        subject,
        html: content,
        from_email: fromEmail,
      };

      if (mode === "selected" && selectedIds.size) {
        payload.contact_ids = Array.from(selectedIds);
      } else if (mode === "filtered") {
        const q = recSearch.trim().toLowerCase();
        const allFilteredIds = allUnlocked
          .filter(
            (r) =>
              !q ||
              (r.contact_name || "").toLowerCase().includes(q) ||
              (r.email || "").toLowerCase().includes(q)
          )
          .map((r) => r.contact_id);
        payload.contact_ids = allFilteredIds;
      } else {
        payload.contact_ids = allUnlocked.map((r) => r.contact_id);
      }

      // 1) create
      const createResp = await fetch(`${base}/email-campaigns/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const created = await createResp.json();
      if (!createResp.ok) throw new Error(created?.error || "Create failed");
      const id = created.id as string;

      // 2) send
      const sendResp = await fetch(`${base}/email-campaigns/campaigns/${id}/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!sendResp.ok) {
        const j = await sendResp.json().catch(() => ({}));
        if (sendResp.status === 402) setBanner({ kind: "warn", msg: "Not enough credits. Please top up." });
        else setBanner({ kind: "error", msg: j?.error || "Send failed." });
        return;
      }

      setBanner({ kind: "success", msg: "Campaign created and sending now." });
      setShowModal(false);
      setSelectedIds(new Set());
      setRecSearch("");
      await loadCampaigns();
      await refreshMetrics();
      await refreshCredits();
    } catch (e: any) {
      setBanner({ kind: "error", msg: e?.message || "Failed to create/send campaign." });
    } finally {
      setBusy(false);
    }
  }

  // ---- render helpers ----
  const totals = Object.values(campMetrics).reduce(
    (acc, m) => {
      acc.sent += m.recipients - m.queued;
      acc.totalRecipients += m.recipients;
      return acc;
    },
    { sent: 0, totalRecipients: 0 }
  );
  const activeCount = campaigns.filter((c) => c.status === "sending").length;

  const tableData = campaigns.map((c) => {
    const m = campMetrics[c.id] ?? { recipients: 0, queued: 0 };
    const sentCount = Math.max(0, m.recipients - m.queued);
    return {
      name: c.name,
      status: (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            c.status === "sending" ? "bg-emerald-600/20 text-emerald-400" : "bg-gray-600/20 text-gray-300"
          }`}
        >
          {c.status}
        </span>
      ),
      sent: sentCount.toLocaleString("en-US"),
    };
  });

  // ---- ui ----
  return (
    <AuthGuard>
      <div className="space-y-6">
        <SectionHeader title="Email Campaigns" description="Create and send your campaigns">
          <WalletBadge />
          <button
            onClick={() => alert("Campaign filters functionality")}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Campaign
          </button>
        </SectionHeader>

        {/* Stats — Sent only */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Active Campaigns" value={String(activeCount)} icon={Mail} />
          <StatCard title="Total Sent" value={totals.sent.toLocaleString("en-US")} icon={Mail} />
          <StatCard title="Unlocked Contacts" value={unlockedCount.toLocaleString("en-US")} icon={Mail} />
        </div>

        <Table headers={headers} data={tableData} />

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-4xl">
              <div className="p-6 border-b border-gray-700 sticky top-0 bg-gray-800 z-10 rounded-t-2xl">
                <h2 className="text-xl font-semibold text-white">Create New Campaign</h2>
                <p className="text-gray-400 mt-1">Set up your email campaign</p>
              </div>

              <div className="p-6 space-y-8 overflow-y-auto max-h-[70vh]">
                {/* Sender */}
                <section>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-medium text-white">Sender</h3>
                    <Info className="w-4 h-4 text-gray-400" />
                  </div>

                  {banner && (
                    <div
                      className={`mb-4 p-3 rounded border text-sm ${
                        banner.kind === "success"
                          ? "border-emerald-600 bg-emerald-900/20 text-emerald-200"
                          : banner.kind === "error"
                          ? "border-red-600 bg-red-900/20 text-red-200"
                          : banner.kind === "warn"
                          ? "border-amber-600 bg-amber-900/20 text-amber-200"
                          : "border-sky-600 bg-sky-900/20 text-sky-200"
                      }`}
                    >
                      {banner.msg}
                    </div>
                  )}

                  {mySender && (
                    <div className="mb-3 p-3 border border-gray-700 rounded-lg bg-gray-900/40">
                      <p className="text-xs text-gray-400 mb-1">Your sender</p>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                          <p className="text-sm text-white break-all">{mySender.email}</p>
                          {mySender.status !== "verified" && <p className="text-xs text-amber-300">{mySender.status}</p>}
                        </div>

                        {/* One working test-mail block (uses wallet balance) */}
                        {isVerified && (
                          <div className="mt-4 p-4 border border-gray-700 rounded-xl bg-gray-900/40">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-white font-medium">Send a test email</h4>
                              <span className="text-xs text-gray-400">
                                Balance: <strong className="text-white">{availableCredits ?? "—"}</strong> cr
                              </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                              <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-300">Test recipient</label>
                                <input
                                  type="email"
                                  placeholder="recipient@example.com"
                                  value={testTo}
                                  onChange={(e) => setTestTo(e.target.value)}
                                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none"
                                />
                                <p className="text-xs text-gray-500">Costs 1 credit.</p>
                              </div>
                              <button
                                type="button"
                                disabled={!testTo || (availableCredits ?? 0) < 1 || busy}
                                onClick={sendTestEmail}
                                className="h-[42px] px-4 md:px-6 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed border border-emerald-500 rounded-lg text-white"
                              >
                                Send test (1 cr)
                              </button>
                            </div>
                            {(availableCredits ?? 0) < 1 && (
                              <p className="text-xs text-amber-300 mt-2">You don’t have enough credits to send a test.</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Verify controls */}
                  {editingSender && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-end">
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-300">
                            {isVerified ? "New sender email" : "From (sender email)"}
                          </label>
                          <input
                            type="email"
                            placeholder="you@company.com"
                            value={fromEmail}
                            onChange={(e) => setFromEmail(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none"
                          />
                          {mySender && (
                            <p className="text-xs text-gray-400">
                              You can change your sender <strong>{left}</strong> more {left === 1 ? "time" : "times"} (max {CHANGE_LIMIT}).
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={
                            !fromEmail ||
                            busy ||
                            (mySender &&
                              left === 0 &&
                              fromEmail.trim().toLowerCase() !== (mySender.email ?? "").trim().toLowerCase())
                          }
                          onClick={handleStartVerify}
                          className="h-[42px] px-4 md:px-6 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed border border-emerald-500 rounded-lg text-white"
                        >
                          {busy ? "Working…" : isVerified ? "Send verification to new email" : "Verify"}
                        </button>

                        <button
                          type="button"
                          disabled={busy || latestStatus === "idle"}
                          onClick={pollVerification}
                          className="h-[42px] px-4 md:px-6 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed border border-gray-700 rounded-lg text-gray-200 flex items-center gap-1"
                        >
                          <RefreshCcw className="w-4 h-4" />
                          Check status
                        </button>
                      </div>

                      <div className="mt-3 flex items-center gap-2 text-sm">
                        <span className="text-gray-400">Status:</span>
                        <span
                          className={`${
                            latestStatus === "verified"
                              ? "text-emerald-400"
                              : latestStatus === "failed" || latestStatus === "error"
                              ? "text-red-400"
                              : latestStatus === "pending"
                              ? "text-amber-300"
                              : "text-gray-400"
                          }`}
                        >
                          {latestStatus}
                        </span>
                        {latestStatus === "verified" && <ShieldCheck className="w-4 h-4 text-emerald-400" />}
                      </div>
                    </>
                  )}
                </section>

                {/* Recipients (search + selection only) */}
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-medium text-white">Recipients</h3>
                    <button
                      type="button"
                      onClick={() => setShowRecipients((v) => !v)}
                      className="text-sm text-emerald-400 hover:text-emerald-300"
                    >
                      {showRecipients ? "Hide contacts" : "View contacts"}
                    </button>
                  </div>

                  <div className="bg-gray-700/40 rounded-lg p-4 border border-gray-700">
                    <p className="text-sm text-gray-300">
                      This campaign will send to your <b>unlocked contacts</b> only (deduped by email).
                    </p>

                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Send to</label>
                        <div className="flex items-center gap-3 text-sm text-gray-200">
                          <label className="flex items-center gap-1">
                            <input type="radio" checked={mode === "all"} onChange={() => setMode("all")} /> All unlocked
                          </label>
                          <label className="flex items-center gap-1">
                            <input type="radio" checked={mode === "filtered"} onChange={() => setMode("filtered")} /> Filtered
                          </label>
                          <label className="flex items-center gap-1">
                            <input type="radio" checked={mode === "selected"} onChange={() => setMode("selected")} /> Selected
                          </label>
                        </div>
                      </div>
                      <div className="text-sm">
                        <div>Credits available: <b>{availableCredits ?? "—"}</b></div>
                        <div className="mt-1 text-gray-300">Recipients to send: <b>{recipientsToSend}</b></div>
                        <div className="text-gray-300">Cost: <b>{recipientsToSend}</b> credits (1/contact)</div>
                      </div>
                    </div>

                    {showRecipients && (
                      <div className="mt-4">
                        <div className="mb-2 grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-end">
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Search contacts</label>
                            <input
                              type="text"
                              value={recSearch}
                              onChange={(e) => setRecSearch(e.target.value)}
                              placeholder="name or email"
                              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedIds(new Set(visible.map((v) => v.contact_id)))}
                            className="h-[38px] px-3 bg-emerald-700 hover:bg-emerald-600 border border-emerald-600 rounded-lg text-white"
                          >
                            Select all (shown)
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedIds(new Set())}
                            className="h-[38px] px-3 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-lg text-gray-200"
                          >
                            Clear selection
                          </button>
                        </div>

                        <div className="max-h-64 overflow-auto rounded border border-gray-700">
                          {recLoading ? (
                            <div className="p-3 text-sm text-gray-400">Loading contacts…</div>
                          ) : visible.length === 0 ? (
                            <div className="p-3 text-sm text-gray-400">No unlocked contacts found.</div>
                          ) : (
                            <ul className="divide-y divide-gray-700">
                              {visible.map((r) => (
                                <li key={r.contact_id} className="px-3 py-2 text-sm grid grid-cols-[auto_1fr_auto] gap-3 items-center">
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.has(r.contact_id)}
                                    onChange={(e) => {
                                      setMode("selected");
                                      setSelectedIds((prev) => {
                                        const next = new Set(prev);
                                        if (e.target.checked) next.add(r.contact_id);
                                        else next.delete(r.contact_id);
                                        return next;
                                      });
                                    }}
                                  />
                                  <div className="truncate">
                                    <span className="text-gray-200">{r.contact_name || "(no name)"}</span>
                                  </div>
                                  <div className="text-gray-400 truncate text-right">{r.email}</div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        {visible.length > 0 && (
                          <div className="mt-2 text-[11px] text-gray-500">
                            Showing up to 500 rows. Full filtered total: {filteredCount}. Unlocked total (deduped): {allUnlocked.length}.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </section>

                {/* Campaign Details */}
                <section>
                  <h3 className="text-lg font-medium text-white mb-4">Campaign Details</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Campaign Name</label>
                      <input
                        type="text"
                        placeholder="e.g., Q1 Product Launch"
                        value={campaignName}
                        onChange={(e) => setCampaignName(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 hover:border-gray-600 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Subject Line</label>
                      <input
                        type="text"
                        placeholder="Enter email subject"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 hover:border-gray-600 transition-colors"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-300 mb-2">Email Content</label>
                      <textarea
                        rows={6}
                        placeholder="Enter your email content here..."
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 hover:border-gray-600 transition-colors resize-none"
                      />
                    </div>
                  </div>
                </section>

                {/* Send Options */}
                <section>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-medium text-white">Send Options</h3>
                  </div>
                  <div className="bg-gray-700/40 rounded-lg p-4 border border-gray-700">
                    <p className="text-sm text-gray-300">Send now (scheduling is disabled).</p>
                  </div>
                </section>
              </div>

              <div className="p-6 border-t border-gray-700 flex flex-col sm:flex-row gap-3 sm:justify-end sticky bottom-0 bg-gray-800 z-10 rounded-b-2xl">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-750"
                >
                  Cancel
                </button>
                <button
                  onClick={createAndSend}
                  disabled={!canAfford || busy}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    !canAfford || busy ? "bg-gray-700 text-gray-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700 text-white"
                  }`}
                >
                  {canAfford ? "Create & Send Now" : "Insufficient Credits"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
