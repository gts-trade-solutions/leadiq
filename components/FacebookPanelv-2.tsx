"use client";

import React from "react";

/**
 * ──────────────────────────────────────────────────────────────────────────────
 * SUPABASE SETUP (client-side, anon key)
 * ──────────────────────────────────────────────────────────────────────────────
 * Env needed:
 *  - NEXT_PUBLIC_SUPABASE_URL
 *  - NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Tables this UI uses directly:
 *  - credits_wallets(user_id uuid PK, balance int, plan text, resets_at timestamptz, updated_at timestamptz)
 *  - credits_ledger(id uuid pk default gen_random_uuid(), user_id uuid, feature text, amount int, meta jsonb, created_at timestamptz default now())
 *  - credits_prices(feature text pk, price int)      // optional
 *  - social_accounts(id uuid pk, user_id uuid, provider text, fb_user_id text, page_access_token text, page_name text, created_at timestamptz, ...)
 *
 * RLS (high-level):
 *  - wallets:   user can select/update ONLY where user_id = auth.uid()
 *  - ledger:    user can insert/select ONLY where user_id = auth.uid()
 *  - accounts:  user can select/delete ONLY rows where user_id = auth.uid() AND provider='facebook'
 *
 * Atomic Credit Spend:
 *  - Create RPC:
 *      create or replace function public.spend_credit(p_feature text, p_amount int, p_meta jsonb)
 *      returns table(balance int)
 *      language plpgsql security definer as $$
 *      declare v_balance int;
 *      begin
 *        -- lock wallet
 *        update credits_wallets set updated_at = now()
 *        where user_id = auth.uid()
 *        returning balance into v_balance;
 *        if not found then raise exception 'WALLET_NOT_FOUND'; end if;
 *        if v_balance < p_amount then raise exception 'INSUFFICIENT_CREDITS'; end if;
 *        update credits_wallets set balance = balance - p_amount, updated_at = now()
 *        where user_id = auth.uid();
 *        insert into credits_ledger(user_id,feature,amount,meta) values(auth.uid(), p_feature, -p_amount, p_meta);
 *        return query select balance from credits_wallets where user_id = auth.uid();
 *      end$$;
 *
 * Connection limit (2):
 *  - You can enforce at DB via a trigger that prevents INSERT when user already has >= 2 rows for provider='facebook'.
 *    (Happy to paste that trigger if you want it.)
 */

async function getSupabase() {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

/* Small UI helpers */
const Pill: React.FC<{
  tone?: "blue" | "green" | "rose" | "slate";
  children: React.ReactNode;
}> = ({ tone = "slate", children }) => {
  const cls: Record<string, string> = {
    blue: "bg-blue-500/10 text-blue-300",
    green: "bg-emerald-500/10 text-emerald-300",
    rose: "bg-rose-500/10 text-rose-300",
    slate: "bg-slate-700/40 text-slate-300",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 text-xs ${cls[tone]}`}
    >
      {children}
    </span>
  );
};
const TabBtn: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`rounded-lg px-3 py-2 text-sm font-medium ${
      active
        ? "bg-slate-800 text-slate-100"
        : "text-slate-300 hover:bg-slate-800/60"
    }`}
  >
    {children}
  </button>
);
function openPopup(url: string, title = "popup", w = 620, h = 680) {
  const l = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
  const t = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
  return window.open(
    url,
    title,
    `width=${w},height=${h},left=${l},top=${t},resizable=yes,scrollbars=yes`
  );
}
function copy(s: string) {
  try {
    navigator.clipboard.writeText(s);
  } catch {}
}

type TabKey = "accounts" | "posts" | "profile" | "compose";
type Prices = Partial<
  Record<
    | "connect"
    | "ai_write"
    | "share"
    | "comment_reply"
    | "comment_moderate"
    | "export",
    number
  >
>;

const DEFAULT_PRICES: Prices = {
  connect: 1,
  ai_write: 2,
  share: 1,
  comment_reply: 1,
  comment_moderate: 1,
  export: 1,
};

export default function FacebookPanelWithCredits() {
  const APP_ID = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || "";
  const [tab, setTab] = React.useState<TabKey>("accounts");
  const [err, setErr] = React.useState<string | null>(null);

  /* Wallet & Prices (direct Supabase) */
  const [wallet, setWallet] = React.useState<{
    balance: number;
    plan?: string;
    resets_at?: string;
  } | null>(null);
  const [prices, setPrices] = React.useState<Prices>(DEFAULT_PRICES);

  const loadWallet = React.useCallback(async () => {
    try {
      const supabase = await getSupabase();
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) return setErr("Not signed in");
      const { data, error } = await supabase
        .from("credits_wallets")
        .select("balance, plan, resets_at")
        .eq("user_id", user.user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setWallet({ balance: 0 });
      } else {
        setWallet(data as any);
      }
    } catch (e: any) {
      setErr(e.message || "Wallet error");
    }
  }, []);

  const loadPrices = React.useCallback(async () => {
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from("credits_prices")
        .select("feature, price");
      if (error) {
        /* table might not exist */ return;
      }
      const map: Prices = { ...DEFAULT_PRICES };
      (data || []).forEach((r: any) => {
        map[r.feature as keyof Prices] = r.price;
      });
      setPrices(map);
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    loadWallet();
    loadPrices();
  }, [loadWallet, loadPrices]);

  async function spend(feature: keyof Prices, meta: Record<string, any> = {}) {
    const amount = prices[feature] ?? 1;
    try {
      const supabase = await getSupabase();
      // call RPC; if it doesn't exist, show a helpful error
      const { data, error } = await supabase.rpc("spend_credit", {
        p_feature: feature,
        p_amount: amount,
        p_meta: meta,
      });
      if (error) {
        if ((error as any).message?.includes("function spend_credit")) {
          throw new Error(
            "Missing RPC spend_credit() — please create it in Supabase. (Ask me for the SQL if you want it now.)"
          );
        }
        throw error;
      }
      await loadWallet();
      return {
        ok: true,
        balance: Array.isArray(data) ? data[0]?.balance ?? null : null,
      };
    } catch (e: any) {
      setErr(e.message || "Credit spend failed");
      return { ok: false };
    }
  }

  /* Accounts (limit 2) */
  const [accounts, setAccounts] = React.useState<any[]>([]);
  const [pageSelected, setPageSelected] = React.useState<{
    id: string;
    name?: string;
  } | null>(null);

  const refreshAccounts = React.useCallback(async () => {
    try {
      const supabase = await getSupabase();
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) return;
      // list accounts
      const { data: rows, error } = await supabase
        .from("social_accounts")
        .select("id, fb_user_id, page_name, page_access_token")
        .eq("user_id", user.user.id)
        .eq("provider", "facebook")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setAccounts(rows || []);
      const p = (rows || []).find((r) => r.page_access_token);
      setPageSelected(p ? { id: p.fb_user_id, name: p.page_name || "" } : null);
    } catch (e: any) {
      setErr(e.message);
    }
  }, []);

  React.useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  // listen for popup connect message
  React.useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e?.data?.source === "fb_oauth") {
        if (e.data.status === "ok") {
          refreshAccounts();
          loadWallet();
        } else setErr(e.data.error || "Connect failed");
      }
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, [refreshAccounts, loadWallet]);

  async function connectFacebook() {
    if ((accounts?.length || 0) >= 2)
      return setErr("Connection limit (2) reached.");
    const spendRes = await spend("connect", { action: "facebook_connect" });
    if (!spendRes.ok) return; // error already shown
    const popup = openPopup("/api/facebook/start", "fb_connect");
    if (!popup) location.href = "/api/facebook/start";
  }

  async function disconnectAccount(id: string) {
    if (!confirm("Disconnect this Facebook account?")) return;
    try {
      const supabase = await getSupabase();
      const { error } = await supabase
        .from("social_accounts")
        .delete()
        .eq("id", id);
      if (error) throw error;
      refreshAccounts();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  /* Posts & Comments (Graph stays behind your routes) */
  const [posts, setPosts] = React.useState<any[]>([]);
  const [after, setAfter] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(false);
  const [loadingPosts, setLoadingPosts] = React.useState(false);

  async function loadPosts(reset = true) {
    try {
      setLoadingPosts(true);
      const url = new URL("/api/facebook/posts/list", location.origin);
      if (!reset && after) url.searchParams.set("after", after);
      url.searchParams.set("limit", "10");
      const r = await fetch(url.toString());
      const j = await r.json();
      if (!r.ok || j.ok === false)
        throw new Error(j.error || "Failed to load posts");
      const newItems = j.data || [];
      const paging = j.paging || null;
      setPosts(reset ? newItems : [...posts, ...newItems]);
      const nextAfter = paging?.cursors?.after || null;
      setAfter(nextAfter);
      setHasMore(!!(paging && paging.next && nextAfter));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoadingPosts(false);
    }
  }

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerPostId, setDrawerPostId] = React.useState<string | null>(null);
  const [comments, setComments] = React.useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = React.useState(false);
  const [canModerate, setCanModerate] = React.useState(false);
  const [replyText, setReplyText] = React.useState<Record<string, string>>({});

  async function openComments(postId: string) {
    setDrawerOpen(true);
    setDrawerPostId(postId);
    setComments([]);
    setCommentsLoading(true);
    try {
      const r = await fetch(
        `/api/facebook/comments/list?objectId=${encodeURIComponent(postId)}`
      );
      const j = await r.json();
      if (!r.ok || j.ok === false)
        throw new Error(j.error || "Comments fetch failed");
      setComments(j.data || []);
      setCanModerate(!!j.canModerate);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setCommentsLoading(false);
    }
  }

  async function reply(targetId: string) {
    const text = (replyText[targetId] || "").trim();
    if (!text) return;
    const sp = await spend("comment_reply", { targetId });
    if (!sp.ok) return;
    try {
      const r = await fetch("/api/facebook/comments/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, message: text }),
      });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || "Reply failed");
      setReplyText((m) => ({ ...m, [targetId]: "" }));
      if (drawerPostId) openComments(drawerPostId);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function hideToggle(commentId: string, nextHidden: boolean) {
    const sp = await spend("comment_moderate", { commentId, nextHidden });
    if (!sp.ok) return;
    try {
      const r = await fetch("/api/facebook/comments/hide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId, isHidden: nextHidden }),
      });
      const j = await r.json();
      if (!r.ok || j.ok === false)
        throw new Error(j.error || "Hide/unhide failed");
      if (drawerPostId) openComments(drawerPostId);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function deleteComment(commentId: string) {
    if (!confirm("Delete this comment?")) return;
    const sp = await spend("comment_moderate", { commentId, action: "delete" });
    if (!sp.ok) return;
    try {
      const r = await fetch("/api/facebook/comments/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: commentId }),
      });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || "Delete failed");
      if (drawerPostId) openComments(drawerPostId);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  /* Profile (Graph stays server-side) */
  const [profile, setProfile] = React.useState<any | null>(null);
  async function loadProfile() {
    try {
      const r = await fetch("/api/facebook/user/overview");
      const j = await r.json();
      if (!r.ok || j.ok === false)
        throw new Error(j.error || "Overview failed");
      setProfile(j.data || null);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  /* Compose (Share & AI) */
  const [shareUrl, setShareUrl] = React.useState("");
  const [shareQuote, setShareQuote] = React.useState("");
  const [draft, setDraft] = React.useState("");
  const [aiBusy, setAiBusy] = React.useState(false);

  async function shareNow() {
    if (!APP_ID) return setErr("Missing NEXT_PUBLIC_FACEBOOK_APP_ID");
    if (!shareUrl) return setErr("Please enter a URL to share");
    const sp = await spend("share", { href: shareUrl });
    if (!sp.ok) return;
    const u = new URL("https://www.facebook.com/dialog/share");
    u.searchParams.set("app_id", APP_ID);
    u.searchParams.set("display", "popup");
    u.searchParams.set("href", shareUrl);
    if (shareQuote) u.searchParams.set("quote", shareQuote);
    u.searchParams.set("redirect_uri", `${location.origin}/share-close`);
    openPopup(u.toString(), "fb_share");
  }

  async function aiWrite() {
    const sp = await spend("ai_write", { where: "facebook_compose" });
    if (!sp.ok) return;
    try {
      setAiBusy(true);
      const r = await fetch("/api/ai/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Facebook post",
          tone: "professional",
          length: 120,
          context: draft,
        }),
      });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || "AI failed");
      setDraft(j.text || "");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setAiBusy(false);
    }
  }

  /* ─────────────────────────────────────────────────────────────────────── */

  return (
    <div className="w-full max-w-6xl rounded-2xl border border-slate-800 bg-slate-950 shadow">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600/15">
            <svg viewBox="0 0 24 24" className="h-5 w-5">
              <path
                fill="currentColor"
                d="M22 12.07C22 6.48 17.52 2 11.93 2S1.86 6.48 1.86 12.07c0 5 3.66 9.14 8.44 9.93v-7.03H7.9v-2.9h2.4V9.41c0-2.37 1.42-3.68 3.58-3.68 1.04 0 2.13.19 2.13.19v2.35h-1.2c-1.18 0-1.55.73-1.55 1.49v1.79h2.64l-.42 2.9h-2.22V22c4.78-.79 8.44-4.93 8.44-9.93z"
              />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-100">
              Facebook (Credits)
            </div>
            <div className="text-xs text-slate-400">
              Connections • Posts • Comments • Profile • Compose
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {wallet ? (
            <>
              <Pill tone={wallet.balance > 0 ? "green" : "rose"}>
                Credits: <b className="ml-1">{wallet.balance}</b>
              </Pill>
              {wallet.plan && <Pill tone="blue">{wallet.plan}</Pill>}
              {wallet.resets_at && (
                <span className="text-xs text-slate-400">
                  Resets {new Date(wallet.resets_at).toLocaleDateString()}
                </span>
              )}
            </>
          ) : (
            <Pill>Loading credits…</Pill>
          )}
        </div>
      </div>

      <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/90 px-3 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <TabBtn
            active={tab === "accounts"}
            onClick={() => setTab("accounts")}
          >
            Accounts
          </TabBtn>
          <TabBtn active={tab === "posts"} onClick={() => setTab("posts")}>
            Posts
          </TabBtn>
          <TabBtn active={tab === "profile"} onClick={() => setTab("profile")}>
            Profile
          </TabBtn>
          <TabBtn active={tab === "compose"} onClick={() => setTab("compose")}>
            Compose
          </TabBtn>
        </div>
      </div>

      {!!err && (
        <div className="mx-4 mt-3 rounded-lg border border-rose-700/40 bg-rose-600/10 px-3 py-2 text-sm text-rose-300">
          {err}
        </div>
      )}

      {/* ACCOUNTS */}
      {tab === "accounts" && (
        <div className="p-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
              <div className="text-sm font-semibold text-slate-200">
                Connections
              </div>
              <div className="flex items-center gap-2">
                <Pill>Limit: 2</Pill>
                <Pill tone="blue">connect: {prices.connect ?? "—"}</Pill>
                <button
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  onClick={connectFacebook}
                  disabled={(accounts?.length || 0) >= 2}
                >
                  {(accounts?.length || 0) >= 2
                    ? "Limit reached"
                    : "Connect Facebook"}
                </button>
              </div>
            </header>
            <div className="grid gap-2 p-4 md:grid-cols-2">
              {(accounts || []).map((a: any) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-slate-100">
                      {a.page_name
                        ? `${a.page_name} (Page)`
                        : a.fb_user_id || "Facebook user"}
                    </div>
                    <div className="truncate text-[11px] text-slate-500">
                      {a.id}
                    </div>
                  </div>
                  <button
                    className="rounded bg-rose-600 px-2 py-1 text-xs text-white"
                    onClick={() => disconnectAccount(a.id)}
                  >
                    Disconnect
                  </button>
                </div>
              ))}
              {(!accounts || accounts.length === 0) && (
                <div className="rounded-lg border border-dashed border-slate-800 p-6 text-center text-sm text-slate-400">
                  No accounts connected yet.
                </div>
              )}
            </div>
            <div className="border-t border-slate-800 p-3 text-xs text-slate-400">
              {pageSelected ? (
                <>
                  Moderating as Page:{" "}
                  <b className="text-slate-200">
                    {pageSelected.name || pageSelected.id}
                  </b>
                </>
              ) : (
                <>Select a Page in Profile to enable comment moderation.</>
              )}
            </div>
          </div>
        </div>
      )}

      {/* POSTS + COMMENTS */}
      {tab === "posts" && (
        <div className="p-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40">
            <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div className="text-sm font-semibold text-slate-200">
                Recent posts
              </div>
              <div className="flex items-center gap-2">
                <Pill>reply: {prices.comment_reply ?? "—"}</Pill>
                <Pill>moderate: {prices.comment_moderate ?? "—"}</Pill>
                <button
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white"
                  onClick={() => loadPosts(true)}
                >
                  {loadingPosts ? "Loading…" : "Refresh"}
                </button>
              </div>
            </header>
            <div className="grid grid-cols-1 gap-2 p-3 md:grid-cols-2">
              {posts.map((p) => {
                const created = new Date(p.created_time).toLocaleString();
                const link = p.permalink_url;
                const att = p.attachments?.data?.[0];
                const img =
                  att?.media?.image?.src || att?.media_url || att?.media?.src;
                return (
                  <article
                    key={p.id}
                    className="rounded-lg border border-slate-800 bg-slate-900/60 p-3"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="text-xs text-slate-400">{created}</div>
                      <div className="truncate text-[11px] text-slate-500">
                        {p.id}
                      </div>
                    </div>
                    {p.message && (
                      <div className="mt-1 line-clamp-5 text-sm text-slate-100">
                        {p.message}
                      </div>
                    )}
                    {img && (
                      <div className="mt-2 overflow-hidden rounded-md">
                        <img
                          src={img}
                          alt=""
                          className="max-h-40 w-full object-cover"
                        />
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      {link && (
                        <>
                          <a
                            className="rounded bg-slate-700 px-2 py-1 text-xs text-blue-200"
                            target="_blank"
                            href={link}
                          >
                            Open
                          </a>
                          <button
                            className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-200"
                            onClick={() => copy(link)}
                          >
                            Copy
                          </button>
                        </>
                      )}
                      <button
                        className="rounded bg-indigo-600 px-2 py-1 text-xs text-white"
                        onClick={() => openComments(p.id)}
                      >
                        Comments
                      </button>
                    </div>
                  </article>
                );
              })}
              {posts.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-800 p-6 text-center text-sm text-slate-400">
                  No posts loaded yet.
                </div>
              )}
            </div>
            {hasMore && (
              <div className="border-t border-slate-800 p-3 text-center">
                <button
                  className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-slate-100"
                  onClick={() => loadPosts(false)}
                >
                  Load more
                </button>
              </div>
            )}
          </div>

          {/* Comments Drawer */}
          {drawerOpen && (
            <div className="fixed inset-0 z-50">
              <div
                className="absolute inset-0 bg-black/50"
                onClick={() => setDrawerOpen(false)}
              />
              <div className="absolute right-0 top-0 h-full w-full max-w-xl overflow-auto border-l border-slate-800 bg-slate-950">
                <div className="sticky top-0 flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3">
                  <div className="text-sm font-semibold text-slate-100">
                    Comments
                  </div>
                  <button
                    className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200"
                    onClick={() => setDrawerOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <div className="p-4">
                  {commentsLoading && (
                    <div className="rounded border border-slate-800 p-3 text-sm text-slate-300">
                      Loading…
                    </div>
                  )}
                  {!commentsLoading && comments.length === 0 && (
                    <div className="rounded border border-dashed border-slate-800 p-6 text-center text-sm text-slate-400">
                      No comments yet.
                    </div>
                  )}
                  <div className="grid gap-3">
                    {comments.map((c: any) => (
                      <div
                        key={c.id}
                        className="rounded border border-slate-800 bg-slate-900/60 p-3"
                      >
                        <div className="flex items-baseline justify-between">
                          <div className="text-sm text-slate-200">
                            <b>{c.from?.name || "Unknown"}</b>
                            <span className="ml-2 text-xs text-slate-500">
                              {new Date(c.created_time).toLocaleString()}
                            </span>
                          </div>
                          {c.is_hidden && <Pill>Hidden</Pill>}
                        </div>
                        {c.message && (
                          <div className="mt-1 whitespace-pre-wrap text-sm text-slate-100">
                            {c.message}
                          </div>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <a
                            className="text-xs text-blue-300 underline"
                            href={c.permalink_url}
                            target="_blank"
                          >
                            Open
                          </a>
                          {canModerate && (
                            <>
                              <button
                                className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-100"
                                onClick={() => hideToggle(c.id, !c.is_hidden)}
                              >
                                {c.is_hidden ? "Unhide" : "Hide"}
                              </button>
                              <button
                                className="rounded bg-rose-600 px-2 py-1 text-xs text-white"
                                onClick={() => deleteComment(c.id)}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                        {canModerate && (
                          <div className="mt-2 flex items-center gap-2">
                            <input
                              className="min-w-0 flex-1 rounded bg-slate-800 px-2 py-1 text-xs text-slate-100"
                              placeholder="Write a reply…"
                              value={replyText[c.id] || ""}
                              onChange={(e) =>
                                setReplyText((m) => ({
                                  ...m,
                                  [c.id]: e.target.value,
                                }))
                              }
                            />
                            <button
                              className="rounded bg-indigo-600 px-2 py-1 text-xs text-white"
                              onClick={() => reply(c.id)}
                            >
                              Reply
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PROFILE */}
      {tab === "profile" && (
        <div className="p-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40">
            <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div className="text-sm font-semibold text-slate-200">
                Profile
              </div>
              <button
                className="rounded bg-slate-700 px-3 py-2 text-sm text-slate-100"
                onClick={loadProfile}
              >
                Refresh
              </button>
            </header>
            {profile ? (
              <div className="grid grid-cols-1 gap-2 p-4 md:grid-cols-2">
                <div>
                  <b>Name:</b> {profile.name}{" "}
                  <span className="text-slate-500">({profile.id})</span>
                </div>
                {profile.email && (
                  <div>
                    <b>Email:</b> {profile.email}
                  </div>
                )}
                {profile.link && (
                  <div className="truncate">
                    <b>Profile:</b>{" "}
                    <a
                      className="text-blue-400 underline"
                      href={profile.link}
                      target="_blank"
                    >
                      {profile.link}
                    </a>
                  </div>
                )}
                {profile.location && (
                  <div>
                    <b>Location:</b> {profile.location}
                  </div>
                )}
                {profile.hometown && (
                  <div>
                    <b>Hometown:</b> {profile.hometown}
                  </div>
                )}
                {profile.gender && (
                  <div>
                    <b>Gender:</b> {profile.gender}
                  </div>
                )}
                {profile.birthday && (
                  <div>
                    <b>Date of Birth:</b> {profile.birthday}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 text-sm text-slate-400">
                Click Refresh to load your profile.
              </div>
            )}
          </div>
        </div>
      )}

      {/* COMPOSE */}
      {tab === "compose" && (
        <div className="p-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40">
            <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div className="text-sm font-semibold text-slate-200">
                Share & AI writer
              </div>
              <div className="flex items-center gap-2">
                <Pill>share: {prices.share ?? "—"}</Pill>
                <Pill>ai_write: {prices.ai_write ?? "—"}</Pill>
              </div>
            </header>
            <div className="grid gap-3 p-4">
              <input
                className="rounded bg-slate-800 px-3 py-2 text-sm text-slate-100"
                placeholder="https://page-to-share"
                value={shareUrl}
                onChange={(e) => setShareUrl(e.target.value)}
              />
              <input
                className="rounded bg-slate-800 px-3 py-2 text-sm text-slate-100"
                placeholder="Optional quote…"
                value={shareQuote}
                onChange={(e) => setShareQuote(e.target.value)}
              />
              <button
                className="w-fit rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white"
                onClick={shareNow}
              >
                Open Facebook Share
              </button>
              <textarea
                className="min-h-28 rounded bg-slate-800 px-3 py-2 text-sm text-slate-100"
                placeholder="Brief for AI…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button
                className="w-fit rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={aiBusy}
                onClick={aiWrite}
              >
                {aiBusy ? "Generating…" : "Write with AI"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-slate-800 p-3 text-center text-[11px] text-slate-500">
        Credits are deducted via Supabase RPC; ensure RLS and the function
        exist. Facebook Graph calls remain server-side.
      </div>
    </div>
  );
}
