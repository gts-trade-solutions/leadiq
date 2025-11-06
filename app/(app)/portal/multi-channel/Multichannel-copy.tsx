"use client";
export const dynamic = "force-dynamic";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import {
  Coins,
  MessageSquare,
  Mail,
  Phone,
  Plus,
  Wand2,
  Image as ImageIcon,
  Upload as UploadIcon,
  Loader2,
  Rocket,
  RefreshCcw,
  LogOut,
  Facebook as FacebookIcon,
} from "lucide-react";
// Keep import to avoid breaking build if you re-enable later
import FacebookPanel from "@/components/FacebookPanelv-2";

type Draft = { headline?: string; body?: string; hashtags?: string[] } | null;
type DalleSize = "1792x1024" | "1024x1024" | "1024x1792";

const MULTICHANNEL_PATH = "/portal/multi-channel";

// Feature flags (hide other channels without touching backend)
const ENABLE_FACEBOOK = false;
const ENABLE_EMAIL = false;
const ENABLE_PHONE = false;

export default function MultiChannelPage() {
  const router = useRouter();
  const qs = useSearchParams();

  // ---------- Supabase client ----------
  const supabase = useMemo(
    () =>
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: true, detectSessionInUrl: true } }
      ),
    []
  );

  // helper to call Edge Functions with JWT
  async function callFn<T = any>(name: string, init?: RequestInit): Promise<T> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Not signed in");
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    if (!res.ok) throw new Error(json?.error || text || res.statusText);
    return json as T;
  }

  // ---------- Auth guard ----------
  const [authReady, setAuthReady] = useState(false);

  // ---------- UI state ----------
  type Tabs = "LinkedIn" | "Facebook" | "Email" | "Phone";
  const [activeTab, setActiveTab] = useState<Tabs>("LinkedIn");

  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [balance, setBalance] = useState(0);
  const [loadingBal, setLoadingBal] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // LinkedIn connection
  const [liConnecting, setLiConnecting] = useState(false);
  const [liConnected, setLiConnected] = useState(false);
  const [canPost, setCanPost] = useState(false);
  const [changesLeft, setChangesLeft] = useState<number>(2);
  const [orgUrns, setOrgUrns] = useState<string[]>([]);
  const [targetUrn, setTargetUrn] = useState<string>("member");

  // Composer
  const [postBody, setPostBody] = useState("");
  const [optPrompt, setOptPrompt] = useState(
    "Tighten the copy and make it scannable for LinkedIn."
  );
  const [tone, setTone] = useState<
    "neutral" | "friendly" | "persuasive" | "technical"
  >("friendly");
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const [loadingOptimize, setLoadingOptimize] = useState(false);
  const [lastDraft, setLastDraft] = useState<Draft>(null);

  // Image
  const [imageMode, setImageMode] = useState<"upload" | "ai">("upload");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [imgPrompt, setImgPrompt] = useState(
    "Minimal abstract banner with brand colors, modern, clean."
  );
  const [imgSize, setImgSize] = useState<DalleSize>("1792x1024");
  const [genUrl, setGenUrl] = useState("");
  const [loadingImage, setLoadingImage] = useState(false);

  const selectedImageUrl = imageMode === "upload" ? uploadPreview : genUrl;

  // ---------- Effects (TOP-LEVEL ONLY) ----------
  // 1) Boot auth
  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace(`/login?next=${encodeURIComponent(MULTICHANNEL_PATH)}`);
        return;
      }
      setAuthReady(true);
    })();
  }, [router, supabase]);

  // 2) Initial load after auth is ready
  useEffect(() => {
    if (!authReady) return;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserEmail(user?.email ?? null);

      const liOk = qs.get("li");
      const liErr = qs.get("li_error");
      const liDesc = qs.get("li_desc");
      if (liOk === "connected") setNotice("LinkedIn connected.");
      if (liErr) setError(`${liErr}${liDesc ? `: ${liDesc}` : ""}`);

      await Promise.all([refreshWallet(), refreshLinkedIn()]);
    })().catch((e) => setError(String(e?.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady]);

  // 3) If a hidden tab becomes active via history, push back to LinkedIn
  useEffect(() => {
    const hiddenNow =
      (activeTab === "Facebook" && !ENABLE_FACEBOOK) ||
      (activeTab === "Email" && !ENABLE_EMAIL) ||
      (activeTab === "Phone" && !ENABLE_PHONE);
    if (hiddenNow) setActiveTab("LinkedIn");
  }, [activeTab]);

  // ---------- Data helpers ----------
  async function refreshWallet() {
    setLoadingBal(true);
    try {
      const data = await callFn<{ balance: number }>("wallet-read", {
        method: "GET",
      });
      setBalance(data.balance ?? 0);
    } catch (e: any) {
      setError(`Wallet error: ${e.message}`);
    } finally {
      setLoadingBal(false);
    }
  }

  async function refreshLinkedIn() {
    try {
      const data = await callFn<{
        connected: boolean;
        can_post: boolean;
        member_urn: string | null;
        org_urns: string[];
        expires_at: string | null;
        changes_left?: number;
      }>("linkedin-creds", { method: "GET" });

      setLiConnected(!!data.connected);
      setCanPost(!!data.can_post);
      setOrgUrns(data.org_urns || []);
      setChangesLeft(
        typeof data.changes_left === "number" ? data.changes_left : 2
      );
      if (data.connected && data.can_post && targetUrn === "member")
        setTargetUrn("member");
    } catch (e: any) {
      setLiConnected(false);
      setCanPost(false);
      setError(`LinkedIn status error: ${e.message}`);
    }
  }

  // bounded poller after connect
  async function pollLinkedInBounded() {
    const delays = [700, 1200, 2000, 3000, 5000, 7000, 8000];
    for (const d of delays) {
      try {
        const s = await callFn<{
          connected: boolean;
          can_post: boolean;
          changes_left?: number;
        }>("linkedin-creds", { method: "GET" });
        if (typeof s.changes_left === "number") setChangesLeft(s.changes_left);
        if (s.connected) {
          setLiConnected(true);
          setCanPost(!!s.can_post);
          if (s.can_post) setNotice("LinkedIn connected.");
          return true;
        }
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, d));
    }
    return false;
  }

  // ---------- Actions ----------
  async function connectLinkedIn() {
    setError("");
    setNotice("");
    setLiConnecting(true);
    try {
      const data = await callFn<{ authUrl: string; changes_left?: number }>(
        "linkedin-oauth-start",
        { method: "GET" }
      );
      if (typeof data.changes_left === "number")
        setChangesLeft(data.changes_left);
      if (data?.changes_left === 0) {
        setError("Change limit reached (2).");
        setLiConnecting(false);
        return;
      }
      window.open(data.authUrl, "li_oauth", "width=600,height=700");
      const ok = await pollLinkedInBounded();
      if (!ok)
        setError(
          "Could not confirm LinkedIn connection. Click “Refresh status” after closing the popup."
        );
    } catch (e: any) {
      const msg = String(e.message || e);
      if (msg.includes("CHANGE_LIMIT")) setError("Change limit reached (2).");
      else setError(`Connect failed: ${msg}`);
    } finally {
      setLiConnecting(false);
    }
  }

  async function disconnectLinkedIn() {
    setError("");
    setNotice("");
    try {
      const res = await callFn<{ ok: boolean; changes_left: number }>(
        "linkedin-disconnect",
        { method: "POST" }
      );
      setLiConnected(false);
      setCanPost(false);
      setChangesLeft(res.changes_left ?? changesLeft);
      setNotice("LinkedIn disconnected.");
    } catch (e: any) {
      const msg = String(e.message || e);
      if (msg.includes("CHANGE_LIMIT")) setError("Change limit reached (2).");
      else setError(`Disconnect failed: ${msg}`);
    }
  }

  async function optimize() {
    setLoadingOptimize(true);
    setError("");
    setNotice("");
    try {
      const combined = [
        "Optimize this LinkedIn post.",
        postBody ? `Original:\n${postBody}` : "",
        optPrompt ? `Instruction:\n${optPrompt}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const data = await callFn<{ ok: boolean; draft: Draft; balance: number }>(
        "ai-draft",
        {
          method: "POST",
          body: JSON.stringify({ prompt: combined, tone, length }),
        }
      );

      if (!data.ok) throw new Error("AI draft failed");
      setLastDraft(data.draft || null);
      if (data.draft?.body) {
        const tags =
          Array.isArray(data.draft.hashtags) && data.draft.hashtags.length
            ? "\n\n" + data.draft.hashtags.map((t: string) => `#${t}`).join(" ")
            : "";
        setPostBody(
          (data.draft.headline ? `${data.draft.headline}\n\n` : "") +
            data.draft.body +
            tags
        );
      }
      setBalance(data.balance);
      setNotice("Content optimized.");
    } catch (e: any) {
      setError(`AI optimize error: ${e.message}`);
    } finally {
      setLoadingOptimize(false);
    }
  }

  async function genImage() {
    setLoadingImage(true);
    setError("");
    setNotice("");
    try {
      const data = await callFn<{
        ok: boolean;
        image: { publicUrl: string };
        balance: number;
      }>("ai-image", {
        method: "POST",
        body: JSON.stringify({ prompt: imgPrompt, size: imgSize }),
      });
      if (!data.ok) throw new Error("AI image failed");
      setGenUrl(data.image.publicUrl);
      setBalance(data.balance);
      setImageMode("ai");
      setNotice("Image generated.");
    } catch (e: any) {
      setError(`AI image error: ${e.message}`);
    } finally {
      setLoadingImage(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setUploadFile(f);
    setUploadPreview(f ? URL.createObjectURL(f) : "");
    setImageMode("upload");
  }

  async function uploadLocalToPublic(): Promise<string | undefined> {
    if (!uploadFile) return undefined;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in");
    const path = `${user.id}/uploads/${Date.now()}-${uploadFile.name}`;
    const up = await supabase.storage
      .from("li-assets")
      .upload(path, uploadFile);
    if (up.error) throw new Error(up.error.message);
    return supabase.storage.from("li-assets").getPublicUrl(path).data.publicUrl;
  }

  async function publish() {
    setError("");
    setNotice("");
    try {
      if (!liConnected) throw new Error("Connect LinkedIn first");
      if (!canPost)
        throw new Error(
          "Posting requires LinkedIn Sign In (openid profile) — reconnect after enabling"
        );
      if (!postBody.trim()) throw new Error("Type your post first");

      const imageUrl =
        imageMode === "ai"
          ? genUrl || undefined
          : uploadFile
          ? await uploadLocalToPublic()
          : undefined;

      const data = await callFn<{
        ok: boolean;
        postUrn: string;
        balance: number;
      }>("linkedin-post", {
        method: "POST",
        body: JSON.stringify({
          text: postBody,
          target: targetUrn,
          visibility: "PUBLIC",
          imageUrl,
        }),
      });

      if (!data.ok) throw new Error("Publish failed");
      setBalance(data.balance);
      setNotice(`Posted! ${data.postUrn ? `URN: ${data.postUrn}` : ""}`);
    } catch (e: any) {
      setError(`Post error: ${e.message}`);
    }
  }

  // ---------- UI ----------
  const Tab = ({
    name,
    icon: Icon,
  }: {
    name: "LinkedIn" | "Facebook" | "Email" | "Phone";
    icon: any;
  }) => (
    <button
      onClick={() => setActiveTab(name)}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 ${
        activeTab === name
          ? "text-emerald-400 border-emerald-400"
          : "text-gray-400 border-transparent hover:text-gray-300"
      }`}
      type="button"
    >
      <Icon className="w-4 h-4" />
      {name}
    </button>
  );

  const postEnabled = liConnected && canPost && postBody.trim().length > 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl text-white font-semibold">
            LinkedIn Campaigns
          </h1>
          <p className="text-sm text-gray-400">
            {userEmail ? `Signed in as ${userEmail}` : "Please sign in."}
          </p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm"
          type="button"
        >
          <Plus className="w-4 h-4" /> Create Sequence
        </button>
      </div>

      <div className="flex items-center gap-2 text-sm text-gray-300">
        <Coins className="w-4 h-4" /> Balance:&nbsp;
        {loadingBal ? (
          <span className="opacity-70">loading…</span>
        ) : (
          <span className="text-emerald-400 font-medium">{balance}</span>
        )}{" "}
        credits
      </div>

      <div className="bg-[#0b0f14] border border-gray-800 rounded-xl p-5">
        {/* Tabs row — only show enabled channels */}
        <div className="flex items-center justify-between border-b border-gray-800 mb-6 pb-2 gap-2 flex-wrap">
          <div className="flex">
            <Tab name="LinkedIn" icon={MessageSquare} />
            {ENABLE_FACEBOOK && <Tab name="Facebook" icon={FacebookIcon} />}
            {ENABLE_EMAIL && <Tab name="Email" icon={Mail} />}
            {ENABLE_PHONE && <Tab name="Phone" icon={Phone} />}
          </div>

          {activeTab === "LinkedIn" && (
            <div className="flex items-center gap-2">
              {liConnected ? (
                <>
                  <span className="text-xs px-2 py-1 rounded border border-emerald-500 text-emerald-400">
                    LinkedIn Connected
                  </span>
                  {!canPost && (
                    <span className="text-xs text-amber-400">
                      posting disabled — enable Sign In (openid profile)
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    Changes left: {changesLeft}
                  </span>
                  {orgUrns.length > 0 && (
                    <select
                      className="text-xs bg-transparent border border-gray-700 rounded px-2 py-1"
                      value={targetUrn}
                      onChange={(e) => setTargetUrn(e.target.value)}
                    >
                      <option value="member">Post as: Me</option>
                      {orgUrns.map((u) => (
                        <option key={u} value={u}>
                          Org: {u.split(":").pop()}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={refreshLinkedIn}
                    className="text-xs px-2 py-1 rounded border border-gray-700 hover:border-gray-500 inline-flex items-center gap-1"
                    title="Refresh status"
                    type="button"
                  >
                    <RefreshCcw className="w-3 h-3" /> Refresh
                  </button>
                  <button
                    onClick={disconnectLinkedIn}
                    className="text-xs px-2 py-1 rounded border border-gray-700 hover:border-gray-500 inline-flex items-center gap-1"
                    type="button"
                  >
                    <LogOut className="w-3 h-3" /> Disconnect
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={connectLinkedIn}
                    disabled={liConnecting || changesLeft <= 0}
                    className="text-xs px-2 py-1 rounded border border-gray-700 hover:border-gray-500 inline-flex items-center gap-2 disabled:opacity-60"
                    type="button"
                  >
                    {liConnecting ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : null}
                    {liConnecting
                      ? "Connecting…"
                      : changesLeft <= 0
                      ? "Change limit reached"
                      : "Connect LinkedIn"}
                  </button>
                  <span className="text-xs text-gray-400">
                    Changes left: {changesLeft}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* LINKEDIN ONLY UI */}
        {activeTab === "LinkedIn" && (
          <form
            onSubmit={(e) => e.preventDefault()}
            className="grid lg:grid-cols-3 gap-6"
          >
            {/* LEFT: Editor */}
            <div className="space-y-4 lg:col-span-2">
              <label className="text-sm text-gray-300">
                Your LinkedIn Post
              </label>
              <textarea
                className="w-full bg-transparent border border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                rows={8}
                value={postBody}
                onChange={(e) => setPostBody(e.target.value)}
                placeholder="Type or paste your post here…"
              />

              {/* Polished Optimization section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-400">
                    Optimization hint{" "}
                    <span className="text-gray-500">(costs 1 credit)</span>
                  </label>
                </div>

                <div className="flex flex-col md:flex-row gap-3">
                  <div className="flex-1">
                    <input
                      className="w-full bg-transparent border border-gray-700 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={optPrompt}
                      onChange={(e) => setOptPrompt(e.target.value)}
                      placeholder="Tell AI how to improve the copy"
                    />
                  </div>

                  {/* Compact tone/length controls */}
                  <div className="grid grid-cols-2 gap-2 md:w-[320px]">
                    <select
                      className="bg-transparent border border-gray-700 rounded-lg p-2 text-sm"
                      value={tone}
                      onChange={(e) => setTone(e.target.value as any)}
                      aria-label="Tone"
                    >
                      <option value="neutral">neutral</option>
                      <option value="friendly">friendly</option>
                      <option value="persuasive">persuasive</option>
                      <option value="technical">technical</option>
                    </select>
                    <select
                      className="bg-transparent border border-gray-700 rounded-lg p-2 text-sm"
                      value={length}
                      onChange={(e) => setLength(e.target.value as any)}
                      aria-label="Length"
                    >
                      <option value="short">short</option>
                      <option value="medium">medium</option>
                      <option value="long">long</option>
                    </select>
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={optimize}
                    disabled={loadingOptimize}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-sm disabled:opacity-60"
                  >
                    {loadingOptimize ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Wand2 className="w-4 h-4" />
                    )}
                    {loadingOptimize ? "Optimizing…" : "Optimize with AI"}
                  </button>
                </div>
              </div>

              {lastDraft && (
                <div className="border border-gray-800 rounded-lg p-3 space-y-2">
                  <div className="text-xs uppercase tracking-wide text-gray-400">
                    AI Draft (reference)
                  </div>
                  {lastDraft.headline && (
                    <div className="font-medium text-white">
                      {lastDraft.headline}
                    </div>
                  )}
                  <div className="text-sm whitespace-pre-wrap text-gray-200">
                    {lastDraft.body}
                  </div>
                  {!!lastDraft.hashtags?.length && (
                    <div className="text-xs text-gray-400">
                      {lastDraft.hashtags.map((h) => `#${h}`).join(" ")}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT: Image + Preview + Publish */}
            <div className="space-y-6">
              <div className="border border-gray-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-300">Post Image</div>
                  <div className="text-xs text-gray-400">
                    {imageMode === "ai" ? "5 credits" : "0 credits"}
                  </div>
                </div>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setImageMode("upload")}
                    className={`px-2 py-1 rounded border ${
                      imageMode === "upload"
                        ? "border-emerald-500 text-emerald-400"
                        : "border-gray-700 text-gray-400"
                    }`}
                  >
                    Upload
                  </button>
                  <button
                    type="button"
                    onClick={() => setImageMode("ai")}
                    className={`px-2 py-1 rounded border ${
                      imageMode === "ai"
                        ? "border-emerald-500 text-emerald-400"
                        : "border-gray-700 text-gray-400"
                    }`}
                  >
                    Generate with AI
                  </button>
                </div>

                {imageMode === "upload" && (
                  <div className="space-y-2">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      onChange={onPick}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-md text-sm"
                    >
                      <UploadIcon className="w-4 h-4" /> Choose image…
                    </button>
                    {uploadPreview && (
                      <img
                        src={uploadPreview}
                        alt="upload"
                        className="rounded-lg border border-gray-700"
                      />
                    )}
                    {!uploadPreview && (
                      <div className="text-xs text-gray-500">
                        Recommended: 1792×1024 (landscape)
                      </div>
                    )}
                  </div>
                )}

                {imageMode === "ai" && (
                  <div className="space-y-2">
                    <label className="text-xs text-gray-400">Prompt</label>
                    <textarea
                      className="w-full bg-transparent border border-gray-700 rounded-lg p-2 text-sm"
                      rows={3}
                      value={imgPrompt}
                      onChange={(e) => setImgPrompt(e.target.value)}
                    />
                    <label className="text-xs text-gray-400">Size</label>
                    <select
                      className="w-full bg-transparent border border-gray-700 rounded-lg p-2 text-sm"
                      value={imgSize}
                      onChange={(e) => setImgSize(e.target.value as DalleSize)}
                    >
                      <option value="1792x1024">1792×1024</option>
                      <option value="1024x1024">1024×1024</option>
                      <option value="1024x1792">1024×1792</option>
                    </select>
                    <button
                      type="button"
                      onClick={genImage}
                      disabled={loadingImage}
                      className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-sm disabled:opacity-60"
                    >
                      {loadingImage ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ImageIcon className="w-4 h-4" />
                      )}
                      {loadingImage ? "Generating…" : "Generate Image"}
                    </button>
                    {genUrl && (
                      <img
                        src={genUrl}
                        alt="generated"
                        className="rounded-lg border border-gray-700"
                      />
                    )}
                  </div>
                )}
              </div>

              <div className="border border-gray-800 rounded-lg p-4 space-y-3">
                <div className="text-sm text-gray-300">Draft Preview</div>
                {selectedImageUrl && (
                  <img
                    src={selectedImageUrl}
                    alt="preview"
                    className="rounded-lg border border-gray-700"
                  />
                )}
                <div className="text-sm whitespace-pre-wrap text-gray-200">
                  {postBody || "Your content will appear here…"}
                </div>
              </div>

              <div className="border border-gray-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-300">Final</div>
                  <button
                    type="button"
                    onClick={refreshLinkedIn}
                    className="text-xs px-2 py-1 rounded border border-gray-700 hover:border-gray-500 inline-flex items-center gap-1"
                  >
                    <RefreshCcw className="w-3 h-3" /> Refresh status
                  </button>
                </div>
                <div className="text-xs text-gray-500">Review and post.</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={publish}
                    disabled={!postEnabled}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-sm disabled:opacity-60"
                  >
                    <Rocket className="w-4 h-4" />
                    {postEnabled
                      ? "Post to LinkedIn"
                      : liConnected
                      ? "Complete sign-in & type a post"
                      : "Connect LinkedIn"}
                  </button>
                </div>
                {liConnected && !canPost && (
                  <p className="text-xs text-amber-400">
                    Connected, but posting needs <b>OpenID “profile”</b>.
                    Reconnect after enabling (scopes:{" "}
                    <code>openid profile w_member_social</code>).
                  </p>
                )}
              </div>
            </div>
          </form>
        )}

        {/* Hidden/disabled channels */}
        {ENABLE_FACEBOOK && activeTab === "Facebook" && (
          <FacebookPanel
            supabase={supabase}
            callFn={callFn}
            refreshWallet={refreshWallet}
          />
        )}
        {ENABLE_EMAIL && activeTab === "Email" && (
          <div className="text-sm text-gray-400">
            Email composer coming soon.
          </div>
        )}
        {ENABLE_PHONE && activeTab === "Phone" && (
          <div className="text-sm text-gray-400">
            Phone/SMS composer coming soon.
          </div>
        )}

        {(error || notice) && (
          <div className="mt-6">
            {error && (
              <p className="text-sm text-red-400" role="alert">
                {error}
              </p>
            )}
            {notice && <p className="text-sm text-emerald-400">{notice}</p>}
          </div>
        )}

        {/* Loading mask while auth bootstraps, but hooks still run above */}
        {!authReady && (
          <div className="mt-6 p-4 text-sm text-gray-400 border border-gray-800 rounded-lg bg-[#0b0f14]">
            Initializing session…
          </div>
        )}
      </div>
    </div>
  );
}
