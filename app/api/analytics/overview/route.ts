// app/api/analytics/overview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";
import { FB_VER, appsecret_proof } from "@/app/api/facebook/_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeStr(v: any) { return (typeof v === "string" ? v : "").trim(); }

async function fetchFacebookPosts(accessToken: string) {
  const url = new URL(`https://graph.facebook.com/${FB_VER}/me/posts`);
  // ask for attachments to infer media/link-ish posts
  url.searchParams.set("fields","id,created_time,message,attachments{media_type,media,url,media_url,subattachments}");
  url.searchParams.set("limit","50");
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("appsecret_proof", appsecret_proof(accessToken));
  const r = await fetch(url.toString());
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "Graph error");
  return j.data || [];
}

async function fetchInstagramMedia(accessToken: string, igUserId: string) {
  const url = new URL(`https://graph.facebook.com/${FB_VER}/${igUserId}/media`);
  url.searchParams.set("fields","id,media_type,media_url,permalink,caption,timestamp");
  url.searchParams.set("limit","50");
  url.searchParams.set("access_token", accessToken);
  const r = await fetch(url.toString());
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "IG graph error");
  return j.data || [];
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const svc = supabaseService();

    // Pull social connections
    const { data: accounts } = await svc
      .from("social_accounts")
      .select("provider, access_token, ig_user_id")
      .eq("user_id", user.id);

    const fb = accounts?.find(a => a.provider === "facebook" && a.access_token);
    const ig = accounts?.find(a => a.provider === "instagram" && a.access_token && a.ig_user_id);

    // Drafts from DB
    const { data: drafts } = await svc
      .from("content_drafts")
      .select("id, share_url, media_urls, status, scheduled_at")
      .eq("user_id", user.id);

    // Optional events (last 30 days)
    const since = new Date(); since.setDate(since.getDate() - 30);
    const { data: events } = await svc
      .from("analytics_events")
      .select("event_type, created_at, provider")
      .eq("user_id", user.id)
      .gte("created_at", since.toISOString());

    // ---- Compute Draft stats
    const totalDrafts = drafts?.length || 0;
    const scheduled = (drafts || []).filter(d => !!d.scheduled_at).length;
    const withMedia = (drafts || []).filter(d => (d.media_urls || []).length > 0).length;
    const domainCount: Record<string, number> = {};
    for (const d of drafts || []) {
      const u = safeStr(d.share_url);
      if (!u) continue;
      try {
        const host = new URL(u).host.replace(/^www\./,"");
        domainCount[host] = (domainCount[host] || 0) + 1;
      } catch {}
    }
    const topDomains = Object.entries(domainCount)
      .sort((a,b)=>b[1]-a[1])
      .slice(0,5)
      .map(([domain,count])=>({domain,count}));

    // ---- Facebook posts analytics
    let fbStats:any = null;
    if (fb?.access_token) {
      const posts = await fetchFacebookPosts(fb.access_token);
      const byHour = Array(24).fill(0);
      const byDow  = Array(7).fill(0); // 0..6 (Sun..Sat)
      let withLink = 0, withAnyMedia = 0, totalLen = 0;

      for (const p of posts) {
        const t = new Date(p.created_time);
        byHour[t.getHours()] += 1;
        byDow[t.getDay()] += 1;

        const msg = safeStr(p.message);
        totalLen += msg.length;

        const att = p.attachments?.data?.[0];
        const isMedia = !!(att?.media || att?.media_url || att?.subattachments?.data?.length);
        if (isMedia) withAnyMedia += 1;

        // heuristics: link-ish if attachment url or message contains http
        const looksLink = /https?:\/\//i.test(msg) || !!att?.url;
        if (looksLink) withLink += 1;
      }
      const count = posts.length || 1;
      fbStats = {
        posts_count: posts.length,
        avg_caption_len: Math.round(totalLen / count),
        by_hour: byHour,
        by_dow: byDow,
        ratio_with_link: Number((withLink / count).toFixed(2)),
        ratio_with_media: Number((withAnyMedia / count).toFixed(2)),
      };
    }

    // ---- Instagram media analytics
    let igStats:any = null;
    if (ig?.access_token && ig?.ig_user_id) {
      const media = await fetchInstagramMedia(ig.access_token, ig.ig_user_id);
      const typeCount: Record<string,number> = {};
      const byHour = Array(24).fill(0);
      const byDow  = Array(7).fill(0);
      let avgLen = 0;

      for (const m of media) {
        const t = new Date(m.timestamp);
        byHour[t.getHours()] += 1;
        byDow[t.getDay()] += 1;
        typeCount[m.media_type] = (typeCount[m.media_type] || 0) + 1;
        avgLen += safeStr(m.caption).length;
      }
      const count = media.length || 1;
      igStats = {
        media_count: media.length,
        by_type: typeCount,
        by_hour: byHour,
        by_dow: byDow,
        avg_caption_len: Math.round(avgLen / count),
      };
    }

    // ---- Events (optional)
    const eventSummary: Record<string,number> = {};
    for (const e of events || []) {
      const k = `${e.provider}:${e.event_type}`;
      eventSummary[k] = (eventSummary[k] || 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      drafts: { total: totalDrafts, scheduled, with_media: withMedia, top_domains: topDomains },
      facebook: fbStats, instagram: igStats,
      usage_30d: eventSummary,
    });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e.message }, { status: e.status || 400 });
  }
}
