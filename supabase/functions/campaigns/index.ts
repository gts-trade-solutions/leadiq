// Deno: Supabase Edge Function - campaigns
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SESClient, SendEmailCommand } from "npm:@aws-sdk/client-ses";

// env
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AWS_REGION = Deno.env.get("AWS_REGION")!;
const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID")!;
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY")!;
const PUBLIC_BASE = Deno.env.get("PUBLIC_FUNCTION_URL") // e.g., https://<proj>.functions.supabase.co/campaigns
  ?? `${SUPABASE_URL.replace(".supabase.co","")}.functions.supabase.co/campaigns`;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ses = new SESClient({
  region: AWS_REGION,
  credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
});

// utils
function b64url(u8: Uint8Array) {
  return btoa(String.fromCharCode(...u8)).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");
}
function randomToken(n = 16) { const u = new Uint8Array(n); crypto.getRandomValues(u); return b64url(u); }
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } }); }
function png(u8: Uint8Array, extra: Record<string,string> = {}) {
  return new Response(u8, { status: 200, headers: { "content-type": "image/png", "cache-control":"no-store", ...extra } });
}
function rewriteHtml(html: string, campaignId: string, token: string) {
  const pixel = `<img src="${PUBLIC_BASE}/o?c=${encodeURIComponent(campaignId)}&r=${encodeURIComponent(token)}" width="1" height="1" style="display:none" alt="" />`;
  const re = /href="(https?:\/\/[^"]+)"/gi;
  const out = html.replace(re, (_m, url) => {
    const wrapped = `${PUBLIC_BASE}/c?c=${encodeURIComponent(campaignId)}&r=${encodeURIComponent(token)}&u=${encodeURIComponent(url)}`;
    return `href="${wrapped}"`;
  });
  return out.includes("</body>") ? out.replace("</body>", `${pixel}</body>`) : out + pixel;
}
const PIXEL = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7rOasAAAAASUVORK5CYII="), c=>c.charCodeAt(0));

// router
serve(async (req) => {
  try {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname.endsWith("/ses")) return handleSes(req);
    if (req.method === "GET"  && url.pathname.endsWith("/o")) return handleOpen(url);
    if (req.method === "GET"  && url.pathname.endsWith("/c")) return handleClick(url);
    if (req.method === "POST") return handleSend(req);
    return new Response("Not found", { status: 404 });
  } catch (e) {
    console.error(e);
    return json({ error: "Unexpected" }, 500);
  }
});

// ───────────────────────── SEND NOW ─────────────────────────
async function handleSend(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!jwt) return json({ error: "Missing auth" }, 401);

  const { data: ures, error: uerr } = await admin.auth.getUser(jwt);
  if (uerr || !ures.user) return json({ error: "Invalid auth" }, 401);
  const user = ures.user;

  type Selection =
    | { mode: "all" }
    | { mode: "company"; companies: string[] }
    | { mode: "title"; titles: string[] };

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  const from = String(body?.from ?? "").trim();
  const subject = String(body?.subject ?? "").trim();
  const html = String(body?.html ?? "");
  const pricePerEmail = Number(body?.pricePerEmail ?? 1);
  const selection: Selection = body?.selection ?? { mode: "all" };

  if (!name || !from || !subject || !html) return json({ error: "Missing fields" }, 400);

  // unlocked contacts for this user
  const { data: unlockRows, error: uErr } = await admin
    .from("unlocked_contacts")
    .select("contact_id")
    .eq("user_id", user.id);
  if (uErr) return json({ error: "Could not read unlocked contacts" }, 500);

  const unlockedIds = (unlockRows ?? []).map((r: any) => r.contact_id);
  if (unlockedIds.length === 0) return json({ error: "No unlocked contacts" }, 400);

  let q = admin
    .from("contacts")
    .select("id, email, contact_name, title, company_id")
    .in("id", unlockedIds)
    .not("email", "is", null);

  if (selection.mode === "company" && (selection.companies?.length ?? 0) > 0) {
    const { data: comps, error: cErr } = await admin
      .from("companies")
      .select("company_id, company_name")
      .in("company_name", selection.companies);
    if (cErr) return json({ error: "Company filter error" }, 500);
    const allowed = (comps ?? []).map((c: any) => c.company_id);
    if (allowed.length === 0) return json({ error: "No recipients for selected companies" }, 400);
    q = q.in("company_id", allowed);
  }
  if (selection.mode === "title" && (selection.titles?.length ?? 0) > 0) {
    q = q.in("title", selection.titles);
  }

  const { data: contacts, error: cErr } = await q;
  if (cErr) return json({ error: "Could not fetch recipients" }, 500);

  const recipients = (contacts ?? []).filter((c: any) => String(c.email ?? "").trim().length > 3);
  if (recipients.length === 0) return json({ error: "No recipients" }, 400);

  const totalCost = recipients.length * pricePerEmail;
  const corr = `campaign:${crypto.randomUUID()}`;
  const { data: okSpend } = await admin.rpc("attempt_spend", {
    p_user_id: user.id, p_amount: totalCost, p_corr: corr, p_note: `Send ${recipients.length} @ ${pricePerEmail}`
  });
  if (!okSpend) return json({ error: "INSUFFICIENT_CREDITS" }, 402);

  const { data: camp, error: campErr } = await admin
    .from("campaigns")
    .insert({
      user_id: user.id, name, subject, from_email: from, html,
      price_per_email: pricePerEmail, recipients_count: recipients.length, credits_charged: totalCost, status: "sending"
    })
    .select("id")
    .single();
  if (campErr || !camp) return json({ error: "Could not create campaign" }, 500);
  const campaignId = camp.id as string;

  // insert recipients with tokens
  const recRows = recipients.map((r: any) => ({
    campaign_id: campaignId, contact_id: r.id, email: r.email, tracking_token: randomToken(18)
  }));
  const { data: inserted, error: insErr } = await admin
    .from("campaign_recipients")
    .insert(recRows)
    .select("id, email, tracking_token");
  if (insErr) return json({ error: "Could not create recipients" }, 500);

  // send via SES (parallel pool)
  const sendOne = async (rid: string, email: string, token: string) => {
    const htmlTracked = rewriteHtml(html, campaignId, token);
    try {
      const resp = await ses.send(new SendEmailCommand({
        Source: from,
        Destination: { ToAddresses: [email] },
        Message: { Subject: { Data: subject, Charset: "UTF-8" }, Body: { Html: { Data: htmlTracked, Charset: "UTF-8" } } },
        ReplyToAddresses: [from],
      }));
      const msgId = resp.MessageId ?? null;

      await admin.from("campaign_recipients").update({
        status: "sent", sent_at: new Date().toISOString(), message_id: msgId, last_event_at: new Date().toISOString()
      }).eq("id", rid);

      await admin.from("campaign_events").insert({
        campaign_id: campaignId, recipient_id: rid, kind: "sent", meta: msgId ? { message_id: msgId } : null
      });
    } catch (e) {
      console.error("Send failed", email, e);
      await admin.from("campaign_recipients").update({
        status: "failed", last_event_at: new Date().toISOString()
      }).eq("id", rid);
      await admin.from("campaign_events").insert({
        campaign_id: campaignId, recipient_id: rid, kind: "fail", meta: { error: String(e) }
      });
    }
  };

  const pool = 8;
  const queue = [...inserted];
  const workers: Promise<void>[] = [];
  for (let i = 0; i < pool; i++) {
    workers.push((async () => {
      while (queue.length) {
        const r = queue.pop();
        if (!r) break;
        await sendOne(r.id as string, r.email as string, r.tracking_token as string);
      }
    })());
  }
  await Promise.all(workers);

  // finalize campaign status
  const { count: failedCount } = await admin
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "failed");
  const status = (failedCount ?? 0) > 0 ? "failed" : "sent";
  await admin.from("campaigns").update({ status }).eq("id", campaignId);

  return json({ campaignId, recipients: recipients.length, status });
}

// ───────────────────────── OPEN PIXEL ─────────────────────────
async function handleOpen(url: URL) {
  const c = url.searchParams.get("c") || "";
  const r = url.searchParams.get("r") || "";
  if (c && r) {
    const { data: rec } = await admin
      .from("campaign_recipients")
      .select("id, opens_count, opened_at")
      .eq("campaign_id", c).eq("tracking_token", r).maybeSingle();
    if (rec) {
      const now = new Date().toISOString();
      await admin.from("campaign_recipients").update({
        opens_count: (rec.opens_count ?? 0) + 1,
        opened_at: rec.opened_at ?? now,
        last_event_at: now
      }).eq("id", rec.id);
      await admin.from("campaign_events").insert({ campaign_id: c, recipient_id: rec.id, kind: "open", meta: null });
    }
  }
  return png(PIXEL);
}

// ───────────────────────── CLICK REDIRECT ─────────────────────────
async function handleClick(url: URL) {
  const c = url.searchParams.get("c") || "";
  const r = url.searchParams.get("r") || "";
  const u = url.searchParams.get("u") || "";
  const target = (() => { try { return decodeURIComponent(u); } catch { return ""; } })();
  const safe = target && /^https?:\/\//i.test(target) ? target : "https://example.com";

  const { data: rec } = await admin
    .from("campaign_recipients")
    .select("id, clicks_count, clicked_at")
    .eq("campaign_id", c).eq("tracking_token", r).maybeSingle();
  if (rec) {
    const now = new Date().toISOString();
    await admin.from("campaign_recipients").update({
      clicks_count: (rec.clicks_count ?? 0) + 1,
      clicked_at: rec.clicked_at ?? now,
      last_event_at: now
    }).eq("id", rec.id);
    await admin.from("campaign_events").insert({ campaign_id: c, recipient_id: rec.id, kind: "click", meta: { url: target } });
  }
  return Response.redirect(safe, 302);
}

// ───────────────────────── SNS WEBHOOK (SES) ─────────────────────────
async function handleSes(req: Request) {
  const msgType = req.headers.get("x-amz-sns-message-type") || "";
  const payload = await req.json().catch(() => ({} as any));

  if (msgType === "SubscriptionConfirmation") {
    // confirm subscription
    const subscribeURL = payload?.SubscribeURL;
    if (subscribeURL) {
      try { await fetch(subscribeURL); } catch (e) { console.error("SNS confirm failed", e); }
    }
    return json({ ok: true });
  }

  if (msgType === "Notification") {
    // SES notification is embedded as JSON string in Message
    let message: any = {};
    try {
      message = typeof payload?.Message === "string" ? JSON.parse(payload.Message) : payload?.Message ?? {};
    } catch (e) {
      console.error("Bad Message JSON", e);
    }

    const notificationType = message?.notificationType || message?.eventType; // SES variants
    const mail = message?.mail || {};
    const msgId = mail?.messageId as string | undefined;

    // Find recipient by message_id
    if (msgId) {
      const { data: rec } = await admin
        .from("campaign_recipients")
        .select("id, campaign_id")
        .eq("message_id", msgId)
        .maybeSingle();

      if (rec) {
        const now = new Date().toISOString();

        if (notificationType === "Delivery") {
          await admin.from("campaign_recipients").update({ status: "delivered", last_event_at: now }).eq("id", rec.id);
          await admin.from("campaign_events").insert({ campaign_id: rec.campaign_id, recipient_id: rec.id, kind: "delivery", meta: message?.delivery ?? null });
        } else if (notificationType === "Bounce") {
          await admin.from("campaign_recipients").update({ status: "bounced", last_event_at: now }).eq("id", rec.id);
          await admin.from("campaign_events").insert({ campaign_id: rec.campaign_id, recipient_id: rec.id, kind: "bounce", meta: message?.bounce ?? null });
        } else if (notificationType === "Complaint") {
          await admin.from("campaign_recipients").update({ status: "complained", last_event_at: now }).eq("id", rec.id);
          await admin.from("campaign_events").insert({ campaign_id: rec.campaign_id, recipient_id: rec.id, kind: "complaint", meta: message?.complaint ?? null });
        } else {
          // other event types can be logged for debugging
          await admin.from("campaign_events").insert({ campaign_id: rec.campaign_id, recipient_id: rec.id, kind: notificationType ?? "unknown", meta: message });
        }
      }
    }
    return json({ ok: true });
  }

  // UnsubscribeConfirmation or others
  return json({ ok: true });
}
