"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Wand2,
  Image as ImageIcon,
  Upload as UploadIcon,
  Loader2,
  RefreshCcw,
  LogOut,
  Rocket,
} from "lucide-react";
// If you want strict typing, import from @supabase/supabase-js and type SupabaseClient.
// To avoid version mismatches, we keep `any` here.
type Supa = any;

type Draft = { headline?: string; body?: string; hashtags?: string[] } | null;
type DalleSize = "1792x1024" | "1024x1024" | "1024x1792";

type Props = {
  supabase: Supa;
  callFn: (name: string, init?: RequestInit) => Promise<any>;
  refreshWallet: () => Promise<void>;
};

type PageInfo = { id: string; name?: string; category?: string };

export default function FacebookPanel({
  supabase,
  callFn,
  refreshWallet,
}: Props) {
  // ---- Status & limits ----
  const [fbConnecting, setFbConnecting] = useState(false);
  const [fbConnected, setFbConnected] = useState(false);
  const [canPost, setCanPost] = useState(false);
  const [changesLeft, setChangesLeft] = useState<number>(2);

  const [pageList, setPageList] = useState<PageInfo[]>([]);
  const [pagesById, setPagesById] = useState<Record<string, PageInfo>>({});
  const [lastPostLink, setLastPostLink] = useState<string>("");

  // Pages
  const [pages, setPages] = useState<string[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [selectedPageName, setSelectedPageName] = useState<string | null>(null);

  // Composer
  const [postBody, setPostBody] = useState("");
  const [optPrompt, setOptPrompt] = useState(
    "Tighten the copy and make it scannable for Facebook."
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
    "Minimal banner with brand colors, modern, clean."
  );
  const [imgSize, setImgSize] = useState<DalleSize>("1792x1024");
  const [genUrl, setGenUrl] = useState("");
  const [loadingImage, setLoadingImage] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedImageUrl = imageMode === "upload" ? uploadPreview : genUrl;
  const postEnabled =
    fbConnected && canPost && !!selectedPageId && postBody.trim().length > 0;

  useEffect(() => {
    refreshFacebook().catch(() => {});
  }, []); // initial status

  // ---- Status / creds ----
  async function refreshFacebook() {
    setError("");
    setNotice("");
    try {
      const data = await callFn("facebook-creds", { method: "GET" });
      const used = data?.changes?.used ?? 0;
      const limit = data?.changes?.limit ?? 2;
      setChangesLeft(Math.max(0, limit - used));

      setFbConnected(!!data.connected);
      setCanPost(!!data.can_post);
      setPages(data.page_ids ?? []);
      setSelectedPageId(data.selected_page_id ?? null);
      setSelectedPageName(data.selected_page_name ?? null);
    } catch (e: any) {
      setFbConnected(false);
      setCanPost(false);
      setError(`Facebook status error: ${e.message || e}`);
    }
  }

  async function pollFacebookBounded() {
    const delays = [700, 1200, 2000, 3000, 5000, 7000, 8000]; // ~28s
    for (const d of delays) {
      try {
        const s = await callFn("facebook-creds", { method: "GET" });
        const used = s?.changes?.used ?? 0;
        const limit = s?.changes?.limit ?? 2;
        setChangesLeft(Math.max(0, limit - used));

        if (s.connected) {
          setFbConnected(true);
          setCanPost(!!s.can_post);
          setPages(s.page_ids ?? []);
          setSelectedPageId(s.selected_page_id ?? null);
          setSelectedPageName(s.selected_page_name ?? null);
          if (s.can_post) setNotice("Facebook connected.");
          return true;
        }
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, d));
    }
    return false;
  }

  async function connectFacebook() {
    setError("");
    setNotice("");
    setFbConnecting(true);
    try {
      const data = await callFn("facebook-oauth-start", { method: "GET" });
      if (typeof data?.changes_left === "number" && data.changes_left <= 0) {
        setError("Change limit reached (2).");
        setFbConnecting(false);
        return;
      }
      window.open("/api/facebook/start", "fb_oauth", "width=600,height=700");
      const ok = await pollFacebookBounded();
      if (!ok)
        setError(
          "Could not confirm Facebook connection. Click “Refresh status” after closing the popup."
        );
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes("CHANGE_LIMIT")) setError("Change limit reached (2).");
      else setError(`Connect failed: ${msg}`);
    } finally {
      setFbConnecting(false);
    }
  }

  async function disconnectFacebook() {
    setError("");
    setNotice("");
    try {
      await callFn("facebook-disconnect", { method: "POST" });
      setFbConnected(false);
      setCanPost(false);
      setSelectedPageId(null);
      setSelectedPageName(null);
      await refreshFacebook();
      setNotice("Facebook disconnected.");
    } catch (e: any) {
      const msg = String(e.message || e);
      if (msg.includes("CHANGE_LIMIT")) setError("Change limit reached (2).");
      else setError(`Disconnect failed: ${msg}`);
    }
  }

  async function setDefaultPage(pageId: string, pageName?: string) {
    setError("");
    setNotice("");
    try {
      // Small helper edge function; code included below in this message.
      const res = await callFn("facebook-set-page", {
        method: "POST",
        body: JSON.stringify({ page_id: pageId, page_name: pageName || null }),
      });
      setSelectedPageId(res.selected_page_id || pageId);
      setSelectedPageName(res.selected_page_name || pageName || null);
      setCanPost(true);
      setNotice("Default Page saved.");
    } catch (e: any) {
      setError(`Set page failed: ${e.message || e}`);
    }
  }

  // ---- AI helpers (reuse your existing functions) ----
  async function optimize() {
    setLoadingOptimize(true);
    setError("");
    setNotice("");
    try {
      const combined = [
        "Optimize this Facebook post.",
        postBody ? `Original:\n${postBody}` : "",
        optPrompt ? `Instruction:\n${optPrompt}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const data = await callFn("ai-draft", {
        method: "POST",
        body: JSON.stringify({ prompt: combined, tone, length }),
      });

      if (!data?.ok) throw new Error("AI draft failed");
      const draft: Draft = data.draft || null;
      setLastDraft(draft);
      if (draft?.body) {
        const tags =
          Array.isArray(draft.hashtags) && draft.hashtags.length
            ? "\n\n" + draft.hashtags.map((t: string) => `#${t}`).join(" ")
            : "";
        setPostBody(
          (draft.headline ? `${draft.headline}\n\n` : "") + draft.body + tags
        );
      }
      await refreshWallet();
      setNotice("Content optimized.");
    } catch (e: any) {
      setError(`AI optimize error: ${e.message || e}`);
    } finally {
      setLoadingOptimize(false);
    }
  }

  async function genImage() {
    setLoadingImage(true);
    setError("");
    setNotice("");
    try {
      const data = await callFn("ai-image", {
        method: "POST",
        body: JSON.stringify({ prompt: imgPrompt, size: imgSize }),
      });
      if (!data?.ok) throw new Error("AI image failed");
      setGenUrl(data.image.publicUrl);
      setImageMode("ai");
      await refreshWallet();
      setNotice("Image generated.");
    } catch (e: any) {
      setError(`AI image error: ${e.message || e}`);
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

  async function loadPages() {
    try {
      const r = await callFn("facebook-pages", { method: "GET" });
      const list: PageInfo[] = r?.pages || [];
      setPageList(list);
      const idx: Record<string, PageInfo> = {};
      list.forEach((p) => {
        idx[p.id] = p;
      });
      setPagesById(idx);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    refreshFacebook()
      .then(() => {
        loadPages();
      })
      .catch(() => {});
  }, []);

  async function uploadLocalToPublic(): Promise<string | undefined> {
    if (!uploadFile) return undefined;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in");
    // Reuse existing public bucket
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
    setLastPostLink("");
    try {
      if (!fbConnected) throw new Error("Connect Facebook first");
      if (!canPost) throw new Error("Select a Page to post to");
      if (!selectedPageId) throw new Error("No Page selected");
      if (!postBody.trim() && !(imageMode === "upload" ? uploadFile : genUrl)) {
        throw new Error("Type your post or add an image");
      }

      let imageUrl: string | undefined = undefined;
      if (imageMode === "upload" && uploadFile) {
        imageUrl = await uploadLocalToPublic();
      } else if (imageMode === "ai" && genUrl) {
        imageUrl = genUrl;
      }

      const data = await callFn("facebook-post", {
        method: "POST",
        body: JSON.stringify({
          message: postBody,
          page_id: selectedPageId,
          image_url: imageUrl,
        }),
      });

      if (!data?.ok) throw new Error("Publish failed");
      await refreshWallet();
      setNotice("Posted successfully.");
      if (data.permalink) setLastPostLink(data.permalink);
    } catch (e: any) {
      setError(`Post error: ${e.message || e}`);
    }
  }

  // ---- UI ----
  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="grid lg:grid-cols-3 gap-6"
    >
      <div className="lg:col-span-3 flex items-center justify-between border-b border-gray-800 pb-2 mb-4">
        {fbConnected ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs px-2 py-1 rounded border border-emerald-500 text-emerald-400">
              Facebook Connected
            </span>
            <span className="text-xs text-gray-400">
              Changes left: {changesLeft}
            </span>

            {(pages?.length ?? 0) > 0 && (
              <>
                <select
                  className="text-xs bg-transparent border border-gray-700 rounded px-2 py-1"
                  value={selectedPageId ?? ""}
                  onChange={(e) => {
                    const id = e.target.value;
                    const nm = pagesById[id]?.name || undefined;
                    setDefaultPage(id, nm || undefined);
                  }}
                >
                  <option value="" disabled>
                    Select Page…
                  </option>
                  {(pageList.length ? pageList : pages || []).map((p: any) => {
                    const id = typeof p === "string" ? p : p.id;
                    const nm =
                      typeof p === "string" ? pagesById[p]?.name : p.name;
                    return (
                      <option key={id} value={id}>
                        {nm ? `${nm} (${id})` : id}
                      </option>
                    );
                  })}
                </select>

                <button
                  type="button"
                  onClick={refreshFacebook}
                  className="text-xs px-2 py-1 rounded border border-gray-700 hover:border-gray-500 inline-flex items-center gap-1"
                >
                  <RefreshCcw className="w-3 h-3" /> Refresh
                </button>
                <button
                  type="button"
                  onClick={disconnectFacebook}
                  className="text-xs px-2 py-1 rounded border border-gray-700 hover:border-gray-500 inline-flex items-center gap-1"
                >
                  <LogOut className="w-3 h-3" /> Disconnect
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={connectFacebook}
              disabled={fbConnecting || changesLeft <= 0}
              className="text-xs px-2 py-1 rounded border border-gray-700 hover:border-gray-500 inline-flex items-center gap-2 disabled:opacity-60"
            >
              {fbConnecting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : null}
              {fbConnecting
                ? "Connecting…"
                : changesLeft <= 0
                ? "Change limit reached"
                : "Connect Facebook"}
            </button>
            <span className="text-xs text-gray-400">
              Changes left: {changesLeft}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-4 lg:col-span-2">
        <label className="text-sm text-gray-300">Your Facebook Post</label>
        <textarea
          className="w-full bg-transparent border border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          rows={8}
          value={postBody}
          onChange={(e) => setPostBody(e.target.value)}
          placeholder="Type or paste your post here…"
        />

        <div className="grid md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-gray-400">
              Optimization hint (1 credit)
            </label>
            <input
              className="w-full bg-transparent border border-gray-700 rounded-lg p-2 text-sm"
              value={optPrompt}
              onChange={(e) => setOptPrompt(e.target.value)}
              placeholder="Tell AI how to improve the copy"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              className="bg-transparent border border-gray-700 rounded-lg p-2 text-sm"
              value={tone}
              onChange={(e) => setTone(e.target.value as any)}
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
            >
              <option value="short">short</option>
              <option value="medium">medium</option>
              <option value="long">long</option>
            </select>
          </div>
        </div>

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

        {lastDraft && (
          <div className="border border-gray-800 rounded-lg p-3 space-y-2">
            <div className="text-xs uppercase tracking-wide text-gray-400">
              AI Draft (reference)
            </div>
            {lastDraft.headline && (
              <div className="font-medium text-white">{lastDraft.headline}</div>
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
              onClick={refreshFacebook}
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
              <Rocket className="w-4 h-4" />{" "}
              {postEnabled
                ? "Post to Facebook"
                : fbConnected
                ? "Select a Page & type a post"
                : "Connect Facebook"}
            </button>
          </div>
          {fbConnected && !canPost && (
            <p className="text-xs text-amber-400">
              Connected. Select a Page to enable posting.
            </p>
          )}
        </div>
      </div>
      {lastPostLink && (
        <a
          href={lastPostLink}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-xs text-emerald-400 underline"
        >
          View post on Facebook
        </a>
      )}

      {(error || notice) && (
        <div className="lg:col-span-3">
          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
          {notice && <p className="text-sm text-emerald-400">{notice}</p>}
        </div>
      )}
    </form>
  );
}
