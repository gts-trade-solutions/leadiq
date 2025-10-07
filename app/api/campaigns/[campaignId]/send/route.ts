export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { withTracking } from "@/lib/emailTracking";
import { sendEmail } from "@/lib/emailProvider";

export const runtime = "nodejs";       // ensure NOT edge


type Body = {
  // Optional overrides if your campaign table doesn't store these
  subject?: string;
  html?: string;
  fromEmail?: string;
  fromName?: string;
  limit?: number;     // limit number of queued recipients to send this run
  dryRun?: boolean;   // build/preview but don't send
};

export async function POST(req: NextRequest, { params }: { params: { campaignId: string } }) {
  const campaignId = params.campaignId;
  const baseUrl = process.env.APP_URL!;
  if (!baseUrl) return NextResponse.json({ error: "APP_URL not set" }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as Body;
  const limit = Math.min(Math.max(body.limit ?? 200, 1), 1000); // 1..1000 per call

  // 1) Fetch campaign content (or accept overrides)
  // Adjust field names if your "campaigns" table differs
  const { data: campaignRow, error: campErr } = await supabaseAdmin
    .from("campaigns")
    .select("id, subject, html, from_email, from_name")
    .eq("id", campaignId)
    .single();

  if (campErr || !campaignRow) {
    return NextResponse.json({ error: "Campaign not found", detail: campErr }, { status: 404 });
  }

  const subject = body.subject ?? campaignRow.subject;
  const baseHtml = body.html ?? campaignRow.html;
  const fromEmail = body.fromEmail ?? campaignRow.from_email ?? process.env.DEFAULT_FROM_EMAIL!;
  const fromName = body.fromName ?? campaignRow.from_name ?? process.env.DEFAULT_FROM_NAME;

  if (!subject || !baseHtml || !fromEmail) {
    return NextResponse.json({ error: "Missing subject/html/fromEmail" }, { status: 400 });
  }

  // 2) Pull queued recipients for this campaign
  const { data: recips, error: recErr } = await supabaseAdmin
    .from("campaign_recipients")
    .select("id, email, tracking_token, message_id, status, sent_at")
    .eq("campaign_id", campaignId)
    .eq("status", "queued")
    .limit(limit);

  if (recErr) return NextResponse.json({ error: "Recipients query failed", detail: recErr }, { status: 500 });
  if (!recips?.length) return NextResponse.json({ ok: true, sent: 0, skipped: 0, failed: 0 });

  let sent = 0, failed = 0, skipped = 0;
  const errors: Array<{ id: string; email: string; error: string }> = [];

  for (const r of recips) {
    // Defensive: tracking_token must exist (your schema is NOT NULL, but just in case)
    const token = r.tracking_token || crypto.randomUUID();

    // 2a) (Very optional) ensure token persisted if it was empty for any reason
    if (!r.tracking_token) {
      await supabaseAdmin.from("campaign_recipients")
        .update({ tracking_token: token })
        .eq("id", r.id);
    }

    // 3) Build HTML with pixel + link redirects
    const html = withTracking(baseHtml, campaignId, token, baseUrl);

    if (body.dryRun) {
      skipped++;
      continue;
    }

    try {
      // 4) Send via chosen provider
      const resp = await sendEmail({
        to: r.email,
        subject,
        html,
        fromEmail,
        fromName,
      });

      // 5) Persist message_id + status
      await supabaseAdmin
        .from("campaign_recipients")
        .update({
          message_id: resp.id,
          sent_at: new Date().toISOString(),
          status: "sent",
        })
        .eq("id", r.id);

      sent++;

      // polite pacing to avoid throttling; tweak as needed
      await sleep(40);
    } catch (e: any) {
      failed++;
      const msg = e?.message ?? String(e);
      errors.push({ id: r.id, email: r.email, error: msg });

      await supabaseAdmin
        .from("campaign_recipients")
        .update({ status: "failed", last_event_at: new Date().toISOString() })
        .eq("id", r.id);
    }
  }

  return NextResponse.json({ ok: true, sent, skipped, failed, errors });
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}
