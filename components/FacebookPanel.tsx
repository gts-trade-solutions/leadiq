"use client";

import React from "react";

/* ----------------------------- small UI bits ----------------------------- */

type Tone = "neutral" | "friendly" | "professional" | "playful";
type TabKey = "compose" | "drafts" | "posts" | "profile" | "analytics";

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`rounded-lg px-3 py-2 text-sm font-medium transition
      ${
        active
          ? "bg-slate-800 text-slate-100"
          : "text-slate-300 hover:bg-slate-800/60"
      }`}
  >
    {children}
  </button>
);

const Pill: React.FC<{
  color?: "green" | "red" | "blue" | "slate";
  children: React.ReactNode;
}> = ({ color = "slate", children }) => {
  const map: Record<string, string> = {
    green: "bg-emerald-500/10 text-emerald-300",
    red: "bg-rose-500/10 text-rose-300",
    blue: "bg-blue-500/10 text-blue-300",
    slate: "bg-slate-700/40 text-slate-300",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 text-xs ${map[color]}`}
    >
      {children}
    </span>
  );
};

const MiniBarRow: React.FC<{ data: number[]; labels: string[] }> = ({
  data,
  labels,
}) => {
  const max = Math.max(1, ...data);
  return (
    <div className="grid gap-1">
      {data.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-10 shrink-0 text-[11px] text-slate-400">
            {labels[i]}
          </span>
          <div className="h-2 flex-1 rounded bg-slate-800">
            <div
              className="h-2 rounded bg-blue-500"
              style={{ width: `${(v / max) * 100}%` }}
            />
          </div>
          <span className="w-6 text-right text-[11px] text-slate-400">{v}</span>
        </div>
      ))}
    </div>
  );
};

/* ----------------------------- main component ---------------------------- */

export default function FacebookMarketingPanel() {
  const APP_ID = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || "";

  const [tab, setTab] = React.useState<TabKey>("compose");
  const [error, setError] = React.useState<string | null>(null);

  /* ------------------------------ connect state ------------------------------ */
  type OAuthMsg = {
    source: "fb_oauth";
    status: "ok" | "error";
    user?: { id: string; name?: string; email?: string | null };
    error?: string;
  };
  const [connecting, setConnecting] = React.useState(false);
  const [connectedUser, setConnectedUser] = React.useState<
    OAuthMsg["user"] | null
  >(null);

  React.useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as Partial<OAuthMsg> | undefined;
      if (!data || data.source !== "fb_oauth") return;
      setConnecting(false);
      if (data.status === "ok") {
        setConnectedUser(data.user || null);
        setError(null);
      } else {
        setConnectedUser(null);
        setError(data.error || "Connect failed");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function openCenteredPopup(url: string, title: string, w = 620, h = 680) {
    const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
    const features = [
      "scrollbars=yes",
      "toolbar=no",
      "location=no",
      "status=no",
      "menubar=no",
      "resizable=yes",
      `width=${w}`,
      `height=${h}`,
      `top=${top}`,
      `left=${left}`,
    ].join(",");
    return window.open(url, title, features);
  }
  function copy(text: string) {
    try {
      navigator.clipboard.writeText(text);
    } catch {}
  }

  const handleConnect = () => {
    setError(null);
    setConnecting(true);
    const popup = openCenteredPopup("/api/facebook/start", "facebook_connect");
    if (!popup) {
      window.location.href = "/api/facebook/start";
      return;
    }
    const t = setInterval(() => {
      if (popup.closed) {
        clearInterval(t);
        setConnecting(false);
      }
    }, 400);
  };
  async function disconnectFacebook() {
    if (!confirm("Disconnect Facebook from your account?")) return;
    const r = await fetch("/api/facebook/disconnect", { method: "POST" });
    if (r.ok) window.location.reload();
  }

  /* ------------------------------ compose/share ----------------------------- */
  const [shareLink, setShareLink] = React.useState("");
  const [shareQuote, setShareQuote] = React.useState("");
  function openShareDialog(href: string, quote?: string) {
    if (!APP_ID) return alert("Missing NEXT_PUBLIC_FACEBOOK_APP_ID");
    if (!href) return alert("Add a link to share");
    const redirect = `${window.location.origin}/share-close`;
    const url = new URL("https://www.facebook.com/dialog/share");
    url.searchParams.set("app_id", APP_ID);
    url.searchParams.set("display", "popup");
    url.searchParams.set("href", href);
    if (quote) url.searchParams.set("quote", quote);
    url.searchParams.set("redirect_uri", redirect);
    openCenteredPopup(url.toString(), "fb_share");
  }

  /* --------------------------------- writer --------------------------------- */
  const [draftTitle, setDraftTitle] = React.useState("");
  const [draftBody, setDraftBody] = React.useState("");
  const [tone, setTone] = React.useState<Tone>("professional");
  const [length, setLength] = React.useState(120);
  const [aiBusy, setAiBusy] = React.useState(false);

  async function generateWithAI() {
    try {
      setAiBusy(true);
      const r = await fetch("/api/ai/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draftTitle,
          tone,
          length,
          context: draftBody,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "AI failed");
      setDraftBody(j.text);
      fetch("/api/analytics/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "app", event_type: "ai_write" }),
      });
    } catch (e: any) {
      setError(e.message || "AI error");
    } finally {
      setAiBusy(false);
    }
  }

  /* --------------------------------- uploads -------------------------------- */
  const [uploadBusy, setUploadBusy] = React.useState(false);
  const [mediaUrls, setMediaUrls] = React.useState<string[]>([]);
  async function getSupabaseClient() {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  async function uploadImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadBusy(true);
    try {
      const supabase = await getSupabaseClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) throw new Error("Not signed in to Supabase");
      const userId = userData.user.id;
      for (const file of Array.from(files).slice(0, 8)) {
        const safe = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
        const objectPath = `${userId}/${Date.now()}-${safe}`;
        const up = await supabase.storage
          .from("fb-assets")
          .upload(objectPath, file, { cacheControl: "3600", upsert: false });
        if (up.error) throw up.error;
        const pub = supabase.storage
          .from("fb-assets")
          .getPublicUrl(up.data!.path);
        setMediaUrls((arr) => [...arr, pub.data.publicUrl]);
      }
    } catch (e: any) {
      setError(e.message || "Upload failed");
    } finally {
      setUploadBusy(false);
    }
  }
  const removeMedia = (url: string) =>
    setMediaUrls((arr) => arr.filter((u) => u !== url));

  /* ---------------------------------- drafts --------------------------------- */
  const [saving, setSaving] = React.useState(false);
  const [drafts, setDrafts] = React.useState<any[]>([]);
  const [activeDraftId, setActiveDraftId] = React.useState<string | null>(null);
  const [draftShareUrl, setDraftShareUrl] = React.useState("");
  const [scheduledAt, setScheduledAt] = React.useState<string>("");
  async function loadDrafts() {
    const r = await fetch("/api/drafts");
    const j = await r.json();
    if (r.ok && j.ok) setDrafts(j.data);
  }
  async function saveDraft() {
    setSaving(true);
    try {
      const payload: any = {
        title: draftTitle,
        body: draftBody,
        media_urls: mediaUrls,
        share_url: draftShareUrl,
        status: "draft",
      };
      if (scheduledAt) {
        payload.scheduled_at = new Date(scheduledAt).toISOString();
        payload.status = "scheduled";
      }
      const url = activeDraftId
        ? `/api/drafts/${activeDraftId}`
        : "/api/drafts";
      const method = activeDraftId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "Save failed");
      setActiveDraftId(j.data.id);
      await loadDrafts();
      fetch("/api/analytics/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "app", event_type: "draft_save" }),
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  async function exportDrafts() {
    const r = await fetch("/api/drafts/export");
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `facebook-drafts-${Date.now()}.json`;
    a.click();
  }
  async function importDrafts(file: File) {
    const text = await file.text();
    const payload = JSON.parse(text);
    const r = await fetch("/api/drafts/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!r.ok || !j.ok) alert(j.error || "Import failed");
    else loadDrafts();
  }

  /* ---------------------------------- posts ---------------------------------- */
  const [posts, setPosts] = React.useState<any[]>([]);
  const [loadingPosts, setLoadingPosts] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [after, setAfter] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(false);
  const [postQuery, setPostQuery] = React.useState("");
  async function fetchPosts(opts: { reset?: boolean } = {}) {
    const isReset = !!opts.reset;
    try {
      if (isReset) setLoadingPosts(true);
      else setLoadingMore(true);
      const cursor = isReset ? null : after;
      const url = new URL("/api/facebook/posts/list", window.location.origin);
      if (cursor) url.searchParams.set("after", cursor);
      url.searchParams.set("limit", "10");
      const res = await fetch(url.toString());
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed posts");
      const newPosts: any[] = json.data || [];
      const paging = json.paging || null;
      setPosts(isReset ? newPosts : [...posts, ...newPosts]);
      const nextAfter = paging?.cursors?.after || null;
      setAfter(nextAfter);
      setHasMore(!!(paging && paging.next && nextAfter));
    } catch (e: any) {
      setError(e.message || "Failed to load posts");
    } finally {
      setLoadingPosts(false);
      setLoadingMore(false);
    }
  }
  const filteredPosts = posts.filter((p) => {
    if (!postQuery.trim()) return true;
    const msg = (p.message || "").toLowerCase();
    return msg.includes(postQuery.trim().toLowerCase());
  });

  /* ------------------------------ profile (rich) ----------------------------- */
  const [profile, setProfile] = React.useState<any | null>(null);
  const [likes, setLikes] = React.useState<any[]>([]);
  const [likesAfter, setLikesAfter] = React.useState<string | null>(null);
  const [photos, setPhotos] = React.useState<any[]>([]);
  const [videos, setVideos] = React.useState<any[]>([]);
  async function loadProfile() {
    const r = await fetch("/api/facebook/user/overview");
    const j = await r.json();
    if (!r.ok || !j.ok) setError(j.error || "Failed overview");
    else setProfile(j.data);
  }
  async function loadLikes(next?: string | null) {
    const u = new URL("/api/facebook/user/likes", window.location.origin);
    if (next) u.searchParams.set("after", next);
    const r = await fetch(u);
    const j = await r.json();
    if (!r.ok || !j.ok) setError(j.error || "Failed likes");
    else {
      setLikes(next ? [...likes, ...j.data] : j.data);
      setLikesAfter(j.paging?.cursors?.after || null);
    }
  }
  async function loadPhotos() {
    const r = await fetch("/api/facebook/user/photos");
    const j = await r.json();
    if (!r.ok || !j.ok) setError(j.error || "Failed photos");
    else setPhotos(j.data);
  }
  async function loadVideos() {
    const r = await fetch("/api/facebook/user/videos");
    const j = await r.json();
    if (!r.ok || !j.ok) setError(j.error || "Failed videos");
    else setVideos(j.data);
  }

  /* -------------------------------- analytics -------------------------------- */
  const [analytics, setAnalytics] = React.useState<any | null>(null);
  const dowLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const hourLabels = Array.from({ length: 24 }, (_, h) =>
    h.toString().padStart(2, "0")
  );
  async function loadAnalytics() {
    const r = await fetch("/api/analytics/overview");
    const j = await r.json();
    if (!r.ok || !j.ok) setError(j.error || "Failed analytics");
    else setAnalytics(j);
  }

  /* ---------------------------- comments integration ------------------------- */
  const [commentsOpen, setCommentsOpen] = React.useState(false);
  const [commentsPostId, setCommentsPostId] = React.useState<string | null>(
    null
  );
  const [comments, setComments] = React.useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = React.useState(false);
  const [replyText, setReplyText] = React.useState<Record<string, string>>({});
  const [canModerate, setCanModerate] = React.useState(false);
  const [selectedPage, setSelectedPage] = React.useState<{
    id: string;
    name: string;
  } | null>(null);

  async function loadSelectedPage() {
    const r = await fetch("/api/facebook/pages/selected");
    const j = await r.json();
    if (r.ok && j.ok && j.page)
      setSelectedPage({ id: j.page.id, name: j.page.name || "" });
    else setSelectedPage(null);
  }
  async function openCommentsFor(postId: string) {
    setCommentsOpen(true);
    setCommentsPostId(postId);
    setComments([]);
    setReplyText({});
    setCommentsLoading(true);
    try {
      await loadSelectedPage();
      const r = await fetch(
        `/api/facebook/comments/list?objectId=${encodeURIComponent(postId)}`
      );
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "Failed to load comments");
      setComments(j.data || []);
      setCanModerate(!!j.canModerate);
    } catch (e: any) {
      setError(e.message || "Comments error");
    } finally {
      setCommentsLoading(false);
    }
  }
  async function sendReply(targetId: string) {
    const text = (replyText[targetId] || "").trim();
    if (!text) return;
    try {
      const r = await fetch("/api/facebook/comments/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, message: text }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "Reply failed");
      setReplyText((m) => ({ ...m, [targetId]: "" }));
      if (commentsPostId) openCommentsFor(commentsPostId);
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function hideToggle(commentId: string, nextHidden: boolean) {
    try {
      const r = await fetch("/api/facebook/comments/hide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId, isHidden: nextHidden }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "Hide/unhide failed");
      if (commentsPostId) openCommentsFor(commentsPostId);
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function deleteComment(commentId: string) {
    if (!confirm("Delete this comment?")) return;
    const r = await fetch("/api/facebook/comments/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: commentId }),
    });
    const j = await r.json();
    if (!r.ok || !j.ok) {
      setError(j.error || "Delete failed");
      return;
    }
    if (commentsPostId) openCommentsFor(commentsPostId);
  }

  /* --------------------------------- sub-tabs -------------------------------- */
  const ComposeTab = (
    <div className="grid gap-4">
      <section className="rounded-xl border border-slate-800 bg-slate-900/40">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-200">Destination</h3>
          <Pill color="blue">Share Dialog</Pill>
        </header>
        <div className="grid gap-3 p-4">
          <input
            className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-100"
            value={shareLink}
            onChange={(e) => setShareLink(e.target.value)}
            placeholder="https://your-landing-page"
          />
          <textarea
            className="min-h-20 rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-100"
            value={shareQuote}
            onChange={(e) => setShareQuote(e.target.value)}
            placeholder="Optional quote…"
          />
          <button
            onClick={() => openShareDialog(shareLink, shareQuote || undefined)}
            disabled={!APP_ID || !shareLink}
            className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Share now
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-200">Writer</h3>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <label className="flex items-center gap-2">
              Tone:
              <select
                className="rounded bg-slate-800 px-2 py-1 text-slate-100"
                value={tone}
                onChange={(e) => setTone(e.target.value as Tone)}
              >
                <option value="neutral">Neutral</option>
                <option value="friendly">Friendly</option>
                <option value="professional">Professional</option>
                <option value="playful">Playful</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              Length:
              <input
                type="range"
                min={60}
                max={300}
                value={length}
                onChange={(e) => setLength(parseInt(e.target.value))}
              />
              <span>{length}w</span>
            </label>
          </div>
        </header>
        <div className="grid gap-3 p-4">
          <input
            className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-100"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder="Post title (optional)"
          />
          <textarea
            className="min-h-28 rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-100"
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            placeholder="Brief or caption…"
          />
          <div className="grid gap-2 sm:flex">
            <button
              onClick={generateWithAI}
              disabled={aiBusy}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {aiBusy ? "Generating…" : "Write with AI"}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-200">
            Media & schedule
          </h3>
          {uploadBusy && <Pill color="blue">Uploading…</Pill>}
        </header>
        <div className="grid gap-3 p-4">
          <label className="cursor-pointer rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-100 inline-block w-fit">
            Upload images
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => uploadImages(e.target.files)}
            />
          </label>
          {mediaUrls.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {mediaUrls.map((u) => (
                <div
                  key={u}
                  className="group relative overflow-hidden rounded-lg border border-slate-800"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={u}
                    alt="media"
                    className="h-24 w-full object-cover"
                  />
                  <button
                    onClick={() => removeMedia(u)}
                    className="absolute right-1 top-1 hidden rounded bg-slate-900/80 px-2 py-0.5 text-[11px] text-slate-100 group-hover:block"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="min-w-[220px] flex-1 rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-100 md:max-w-xs"
              value={draftShareUrl}
              onChange={(e) => setDraftShareUrl(e.target.value)}
              placeholder="Link to share (https://…)"
            />
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="rounded bg-slate-800 px-2 py-2 text-slate-100"
            />
            <button
              onClick={() => {
                if (!draftShareUrl) return alert("Add a link first.");
                openShareDialog(draftShareUrl, draftBody || undefined);
              }}
              disabled={!APP_ID}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Share draft now
            </button>
            <button
              onClick={saveDraft}
              disabled={saving}
              className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-slate-100 disabled:opacity-50"
            >
              {saving
                ? "Saving…"
                : activeDraftId
                ? "Save changes"
                : "Save draft"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );

  const DraftsTab = (
    <div className="grid gap-4">
      <section className="rounded-xl border border-slate-800 bg-slate-900/40">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-200">Drafts</h3>
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-slate-100"
              onClick={loadDrafts}
            >
              Refresh
            </button>
            <button
              className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-slate-100"
              onClick={exportDrafts}
            >
              Export
            </button>
            <label className="cursor-pointer rounded-lg bg-slate-700 px-3 py-2 text-sm text-slate-100">
              Import
              <input
                type="file"
                accept="application/json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importDrafts(f);
                }}
              />
            </label>
          </div>
        </header>
        <div className="p-3">
          {drafts.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-800 p-6 text-center text-sm text-slate-400">
              No drafts yet
            </div>
          )}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {drafts.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 p-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm text-slate-100">
                    {d.title || "(untitled)"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {d.scheduled_at
                      ? `Scheduled: ${new Date(
                          d.scheduled_at
                        ).toLocaleString()}`
                      : "Not scheduled"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-100"
                    onClick={async () => {
                      const r = await fetch(`/api/drafts/${d.id}`);
                      const j = await r.json();
                      if (r.ok && j.ok) {
                        setActiveDraftId(d.id);
                        setDraftTitle(j.data.title || "");
                        setDraftBody(j.data.body || "");
                        setDraftShareUrl(j.data.share_url || "");
                        setMediaUrls(j.data.media_urls || []);
                        setScheduledAt(
                          j.data.scheduled_at
                            ? new Date(j.data.scheduled_at)
                                .toISOString()
                                .slice(0, 16)
                            : ""
                        );
                        setTab("compose");
                      }
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="rounded bg-blue-600 px-2 py-1 text-xs text-white"
                    onClick={() => {
                      if (!APP_ID) return alert("Missing FB App ID");
                      if (!d.share_url) return alert("Draft has no share URL");
                      openShareDialog(d.share_url, d.body || undefined);
                    }}
                  >
                    Share
                  </button>
                  <button
                    className="rounded bg-rose-600 px-2 py-1 text-xs text-white"
                    onClick={async () => {
                      if (!confirm("Delete this draft?")) return;
                      const r = await fetch(`/api/drafts/${d.id}`, {
                        method: "DELETE",
                      });
                      if (r.ok)
                        setDrafts((arr) => arr.filter((x) => x.id !== d.id));
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );

  const PostsTab = (
    <div className="grid gap-4">
      <section className="rounded-xl border border-slate-800 bg-slate-900/40">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-200">My Posts</h3>
          <div className="flex items-center gap-2">
            <input
              className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-100"
              placeholder="Search message…"
              value={postQuery}
              onChange={(e) => setPostQuery(e.target.value)}
            />
            <button
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white"
              onClick={() => fetchPosts({ reset: true })}
            >
              {loadingPosts ? "Loading…" : "Refresh"}
            </button>
          </div>
        </header>
        <div className="grid grid-cols-1 gap-2 p-3 md:grid-cols-2">
          {filteredPosts.map((p) => {
            const created = new Date(p.created_time).toLocaleString();
            const permalink = p.permalink_url as string | undefined;
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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img}
                      alt="attachment"
                      className="max-h-40 w-full object-cover"
                    />
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2">
                  {permalink && (
                    <>
                      <a
                        className="rounded-md bg-slate-700 px-2 py-1 text-xs text-blue-200 hover:bg-slate-600"
                        href={permalink}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open
                      </a>
                      <button
                        className="rounded-md bg-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-600"
                        onClick={() => copy(permalink)}
                      >
                        Copy link
                      </button>
                    </>
                  )}
                  <button
                    className="rounded-md bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-500"
                    onClick={() => openCommentsFor(p.id)}
                  >
                    Comments
                  </button>
                </div>
              </article>
            );
          })}
          {!filteredPosts.length && (
            <div className="rounded-lg border border-dashed border-slate-800 p-6 text-center text-sm text-slate-400">
              No posts match your search.
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3">
          <div className="text-xs text-slate-500">
            Showing {filteredPosts.length} of {posts.length} loaded
          </div>
          {hasMore && (
            <button
              className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-slate-100 hover:bg-slate-600"
              onClick={() => fetchPosts()}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      </section>

      {/* Comments drawer */}
      {commentsOpen && (
        <div className="fixed inset-0 z-[60]">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setCommentsOpen(false)}
          />
          <div className="absolute right-0 top-0 h-full w-full max-w-xl overflow-auto border-l border-slate-800 bg-slate-950 shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3">
              <div className="text-sm font-semibold text-slate-100">
                Comments
              </div>
              <button
                className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200"
                onClick={() => setCommentsOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="p-4">
              {selectedPage && (
                <div className="mb-3 text-xs text-slate-400">
                  Moderating as Page:{" "}
                  <span className="font-medium text-slate-200">
                    {selectedPage.name || selectedPage.id}
                  </span>
                </div>
              )}

              {commentsLoading && (
                <div className="rounded-lg border border-slate-800 p-4 text-sm text-slate-300">
                  Loading…
                </div>
              )}

              {!commentsLoading && comments.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-800 p-6 text-center text-sm text-slate-400">
                  No comments yet.
                </div>
              )}

              <div className="grid gap-3">
                {comments.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-lg border border-slate-800 bg-slate-900/60 p-3"
                  >
                    <div className="flex items-baseline justify-between">
                      <div className="text-sm text-slate-200">
                        <span className="font-semibold">
                          {c.from?.name || "Unknown"}
                        </span>
                        <span className="ml-2 text-xs text-slate-500">
                          {new Date(c.created_time).toLocaleString()}
                        </span>
                      </div>
                      {c.is_hidden && (
                        <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-amber-300">
                          Hidden
                        </span>
                      )}
                    </div>
                    {c.message && (
                      <div className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-100">
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
                          onClick={() => sendReply(c.id)}
                        >
                          Reply
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {canModerate && commentsPostId && (
                <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                  <div className="mb-1 text-xs text-slate-400">
                    Add a top-level comment
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      className="min-w-0 flex-1 rounded bg-slate-800 px-2 py-1 text-xs text-slate-100"
                      placeholder="Write a comment on the post…"
                      value={replyText["__post__"] || ""}
                      onChange={(e) =>
                        setReplyText((m) => ({
                          ...m,
                          ["__post__"]: e.target.value,
                        }))
                      }
                    />
                    <button
                      className="rounded bg-blue-600 px-2 py-1 text-xs text-white"
                      onClick={() => sendReply(commentsPostId!)}
                    >
                      Comment
                    </button>
                  </div>
                </div>
              )}

              {!canModerate && (
                <div className="mt-4 rounded-md border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">
                  Replies & moderation require a selected <b>Page</b>. Go to{" "}
                  <i>Profile → Select a Page</i>.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const ProfileTab = (
    <div className="grid gap-4">
      <section className="rounded-xl border border-slate-800 bg-slate-900/40">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-200">Profile</h3>
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-slate-100"
              onClick={loadProfile}
            >
              Overview
            </button>
            <button
              className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-slate-100"
              onClick={() => loadLikes(null)}
            >
              Likes
            </button>
            <button
              className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-slate-100"
              onClick={loadPhotos}
            >
              Photos
            </button>
            <button
              className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-slate-100"
              onClick={loadVideos}
            >
              Videos
            </button>
          </div>
        </header>

        {profile && (
          <div className="grid grid-cols-1 gap-2 p-4 text-sm text-slate-200 md:grid-cols-2">
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
        )}

        {likes.length > 0 && (
          <div className="border-t border-slate-800 p-4">
            <div className="mb-2 text-sm text-slate-300">
              Likes ({likes.length})
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {likes.map((l) => (
                <div
                  key={l.id}
                  className="rounded-lg border border-slate-800 bg-slate-900/60 p-2"
                >
                  <div className="truncate text-slate-100">{l.name}</div>
                  <div className="text-[11px] text-slate-500">{l.id}</div>
                </div>
              ))}
            </div>
            {likesAfter && (
              <div className="mt-2">
                <button
                  className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-slate-100"
                  onClick={() => loadLikes(likesAfter)}
                >
                  Load more
                </button>
              </div>
            )}
          </div>
        )}

        {photos.length > 0 && (
          <div className="border-t border-slate-800 p-4">
            <div className="mb-2 text-sm text-slate-300">Photos</div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {photos.map((p) => (
                <a
                  key={p.id}
                  href={p.link || p.permalink_url}
                  target="_blank"
                  className="block overflow-hidden rounded-lg border border-slate-800"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.picture || p.images?.[0]?.source}
                    alt="photo"
                    className="h-24 w-full object-cover"
                  />
                </a>
              ))}
            </div>
          </div>
        )}

        {videos.length > 0 && (
          <div className="border-t border-slate-800 p-4">
            <div className="mb-2 text-sm text-slate-300">Videos</div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {videos.map((v) => (
                <a
                  key={v.id}
                  href={v.permalink_url}
                  target="_blank"
                  className="block rounded-lg border border-slate-800 bg-slate-900/60 p-2"
                >
                  <div className="line-clamp-2 text-slate-200">
                    {v.description || "Video"}
                  </div>
                  <div className="text-[11px] text-slate-500">{v.id}</div>
                </a>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );

  const AnalyticsTab = (
    <div className="grid gap-4">
      <section className="rounded-xl border border-slate-800 bg-slate-900/40">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-200">Analytics</h3>
          <button
            className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-slate-100"
            onClick={loadAnalytics}
          >
            Refresh
          </button>
        </header>

        {!analytics && (
          <div className="p-4 text-sm text-slate-400">
            Click Refresh to compute analytics.
          </div>
        )}

        {analytics && (
          <div className="grid gap-4 p-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-800 p-3">
              <div className="mb-2 text-sm font-semibold text-slate-200">
                Drafts
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm text-slate-300">
                <div>
                  Total: <b>{analytics.drafts.total}</b>
                </div>
                <div>
                  Scheduled: <b>{analytics.drafts.scheduled}</b>
                </div>
                <div>
                  With media: <b>{analytics.drafts.with_media}</b>
                </div>
                <div className="col-span-2">
                  <div className="text-xs text-slate-400 mb-1">Top domains</div>
                  <div className="flex flex-wrap gap-2">
                    {(analytics.drafts.top_domains || []).map((d: any) => (
                      <span
                        key={d.domain}
                        className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300"
                      >
                        {d.domain} · {d.count}
                      </span>
                    ))}
                    {(!analytics.drafts.top_domains ||
                      analytics.drafts.top_domains.length === 0) && (
                      <span className="text-xs text-slate-500">
                        No links yet
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 p-3">
              <div className="mb-2 text-sm font-semibold text-slate-200">
                Facebook (last 50 posts)
              </div>
              {analytics.facebook ? (
                <div className="grid gap-2 text-sm text-slate-300">
                  <div>
                    Posts: <b>{analytics.facebook.posts_count}</b>
                  </div>
                  <div>
                    Avg caption length:{" "}
                    <b>{analytics.facebook.avg_caption_len}</b> chars
                  </div>
                  <div>
                    With link:{" "}
                    <b>
                      {Math.round(analytics.facebook.ratio_with_link * 100)}%
                    </b>
                  </div>
                  <div>
                    With media:{" "}
                    <b>
                      {Math.round(analytics.facebook.ratio_with_media * 100)}%
                    </b>
                  </div>
                  <div className="mt-2">
                    <div className="text-xs text-slate-400 mb-1">
                      By day of week
                    </div>
                    <MiniBarRow
                      data={analytics.facebook.by_dow}
                      labels={dowLabels}
                    />
                  </div>
                  <div className="mt-2">
                    <div className="text-xs text-slate-400 mb-1">By hour</div>
                    <MiniBarRow
                      data={analytics.facebook.by_hour}
                      labels={hourLabels}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-400">
                  Connect Facebook to see post analytics.
                </div>
              )}
            </div>

            <div className="rounded-lg border border-slate-800 p-3 md:col-span-2">
              <div className="mb-2 text-sm font-semibold text-slate-200">
                Instagram (last 50 media)
              </div>
              {analytics.instagram ? (
                <div className="grid gap-2 text-sm text-slate-300 md:grid-cols-2">
                  <div>
                    Media: <b>{analytics.instagram.media_count}</b>
                  </div>
                  <div>
                    Avg caption length:{" "}
                    <b>{analytics.instagram.avg_caption_len}</b> chars
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-xs text-slate-400 mb-1">
                      By media type
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(analytics.instagram.by_type).map(
                        ([k, v]: any) => (
                          <span
                            key={k}
                            className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300"
                          >
                            {k}: {v}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">
                      By day of week
                    </div>
                    <MiniBarRow
                      data={analytics.instagram.by_dow}
                      labels={dowLabels}
                    />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">By hour</div>
                    <MiniBarRow
                      data={analytics.instagram.by_hour}
                      labels={hourLabels}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-400">
                  Connect Instagram to see media analytics.
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );

  /* --------------------------------- render --------------------------------- */
  return (
    <div className="w-full max-w-5xl rounded-2xl border border-slate-800 bg-slate-950 p-0 shadow-lg">
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/90 p-4 backdrop-blur">
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
              Facebook Marketing
            </div>
            <div className="text-xs text-slate-400">
              Compose • Draft • Share • Comments • Analytics
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {connectedUser ? (
            <>
              <Pill color="green">
                Connected as{" "}
                <b className="ml-1">{connectedUser.name || connectedUser.id}</b>
              </Pill>
              <button
                onClick={disconnectFacebook}
                className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-500"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
            >
              {connecting && (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
              )}
              {connecting ? "Connecting…" : "Connect Facebook"}
            </button>
          )}
        </div>
      </div>

      <div className="sticky top-[56px] z-10 border-b border-slate-800 bg-slate-950/90 px-3 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <TabButton
            active={tab === "compose"}
            onClick={() => setTab("compose")}
          >
            Compose
          </TabButton>
          <TabButton active={tab === "drafts"} onClick={() => setTab("drafts")}>
            Drafts
          </TabButton>
          <TabButton active={tab === "posts"} onClick={() => setTab("posts")}>
            Posts
          </TabButton>
          <TabButton
            active={tab === "profile"}
            onClick={() => setTab("profile")}
          >
            Profile
          </TabButton>
          <TabButton
            active={tab === "analytics"}
            onClick={() => setTab("analytics")}
          >
            Analytics
          </TabButton>
          {!APP_ID && <Pill color="red">Missing APP ID</Pill>}
        </div>
      </div>

      <div className="p-4">
        {!!error && (
          <div className="mb-3 rounded-lg border border-rose-700/40 bg-rose-600/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </div>
        )}
        {!connectedUser ? (
          <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-400">
            Connect Facebook to start.
          </div>
        ) : (
          <>
            {tab === "compose" && ComposeTab}
            {tab === "drafts" && DraftsTab}
            {tab === "posts" && PostsTab}
            {tab === "profile" && ProfileTab}
            {tab === "analytics" && AnalyticsTab}
          </>
        )}
      </div>

      <div className="border-t border-slate-800 p-3 text-center text-[11px] text-slate-500">
        Comment moderation works when a Page is selected (Profile → select a
        Page). Sharing uses Facebook’s dialog so you choose the destination at
        post time.
      </div>
    </div>
  );
}
