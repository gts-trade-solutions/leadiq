import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";
import { FB_VER, appsecret_proof, requireUserAndFbToken } from "@/app/api/facebook/_helpers";

export const dynamic = "force-dynamic";

type GError = { error?: { message?: string; code?: number; error_subcode?: number; type?: string } };

const mask = (t?: string | null) => (t ? `${t.slice(0, 6)}…${t.slice(-4)}` : "none");

function buildCommentsUrl(objectId: string, token: string, isPage: boolean) {
  const u = new URL(`https://graph.facebook.com/${FB_VER}/${objectId}/comments`);
  u.searchParams.set(
    "fields",
    [
      "id",
      "from{id,name}",
      "message",
      "created_time",
      "comment_count",
      "like_count",
      "parent{id}",
      "is_hidden",
      "can_hide",
      "permalink_url",
    ].join(",")
  );
  u.searchParams.set("order", "reverse_chronological");
  u.searchParams.set("limit", "50");
  u.searchParams.set("summary", "true");
  u.searchParams.set("access_token", token);
  if (!isPage) u.searchParams.set("appsecret_proof", appsecret_proof(token));
  return u;
}

async function tryToken(objectId: string, token: string, isPage: boolean) {
  const url = buildCommentsUrl(objectId, token, isPage);
  // For logs / debug payload: redact the token in the URL
  const displayUrl = new URL(url.toString());
  displayUrl.searchParams.set("access_token", "REDACTED");
  if (!isPage) displayUrl.searchParams.set("appsecret_proof", "REDACTED");

  console.info(
    `[fb:comments] → fetch (isPage=${isPage})`,
    JSON.stringify({ url: displayUrl.toString(), token: mask(token) })
  );

  const res = await fetch(url.toString());
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { parse_error: text?.slice(0, 512) }; }

  const trace = res.headers.get("x-fb-trace-id") || null;

  console.info(
    `[fb:comments] ← response (isPage=${isPage})`,
    JSON.stringify({
      status: res.status,
      ok: res.ok,
      length: Array.isArray(json?.data) ? json.data.length : null,
      summary: json?.summary || null,
      error: (json as GError)?.error || null,
      trace,
    })
  );

  return { ok: res.ok, json, trace, displayUrl: displayUrl.toString() };
}

export async function GET(req: NextRequest) {
  const started = Date.now();
  try {
    const url = new URL(req.url);
    const objectId = url.searchParams.get("objectId");
    const debug = url.searchParams.get("debug") === "1";
    const force = (url.searchParams.get("force") || "").toLowerCase(); // 'user' | 'page' | ''

    if (!objectId) throw new Error("objectId required");

    console.info(`[fb:comments] start`, JSON.stringify({ objectId, force, debug }));

    const user = await requireUser();
    const svc = supabaseService();

    // Load stored page token (if any)
    const { data: acc } = await svc
      .from("social_accounts")
      .select("page_access_token")
      .eq("user_id", user.id)
      .eq("provider", "facebook")
      .single();

    const pageToken = acc?.page_access_token || null;
    const { accessToken: userToken } = await requireUserAndFbToken();

    console.info(
      `[fb:comments] tokens`,
      JSON.stringify({ hasPageToken: !!pageToken, pageToken: mask(pageToken), userToken: mask(userToken) })
    );

    const attempts: any[] = []; // for debug echo

    // Decide order: page first (default), unless force=user
    const order: Array<"page" | "user"> =
      force === "user" ? ["user", "page"] : force === "page" ? ["page", "user"] : ["page", "user"];

    let result: any = null;
    let canModerate = false;

    for (const which of order) {
      if (which === "page" && !pageToken) continue;
      const token = which === "page" ? pageToken! : userToken;
      const isPage = which === "page";

      const r = await tryToken(objectId, token, isPage);
      attempts.push({
        which,
        status: r.ok,
        length: Array.isArray(r.json?.data) ? r.json.data.length : null,
        summary: r.json?.summary || null,
        error: (r.json as GError)?.error || null,
        trace: r.trace,
        url: r.displayUrl,
      });

      if (r.ok && Array.isArray(r.json?.data)) {
        // If page token returned anything, use it (moderation OK)
        if (isPage) {
          result = r;
          canModerate = true;
          // If it’s empty, still try user to see if user can read them
          if ((r.json.data?.length || 0) > 0) break;
        } else {
          // user token
          if (!result) result = r; // keep first good response
          if ((r.json.data?.length || 0) > 0) break;
        }
      }
    }

    if (!result) {
      console.error(`[fb:comments] both attempts failed`);
      return NextResponse.json(
        { ok: false, error: "Graph error", debug: debug ? { attempts } : undefined },
        { status: 400 }
      );
    }

    const data = Array.isArray(result.json?.data) ? result.json.data : [];
    const payload: any = {
      ok: true,
      data,
      summary: result.json?.summary || null,
      canModerate,
    };
    if (debug) payload.debug = { attempts, took_ms: Date.now() - started };

    console.info(
      `[fb:comments] done`,
      JSON.stringify({ count: data.length, canModerate, took_ms: Date.now() - started })
    );

    return NextResponse.json(payload);
  } catch (e: any) {
    console.error(`[fb:comments] fatal`, e?.message || e);
    return NextResponse.json({ ok: false, error: e.message || "Unexpected error" }, { status: 400 });
  }
}
