// supabase/functions/email-campaigns/index.ts
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SESv2Client, SendEmailCommand } from "npm:@aws-sdk/client-sesv2";

const FN_SLUG = "email-campaigns";

// ===== ENV =====
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AWS_REGION = Deno.env.get("AWS_REGION")!;
const SES_CONFIGURATION_SET = Deno.env.get("SES_CONFIGURATION_SET") || undefined;

// ===== Clients =====
const ses = new SESv2Client({ region: AWS_REGION });

// ===== Helpers / CORS =====
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
} as const;

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

const now = () => new Date().toISOString();
const normEmail = (e?: string | null) => (e || "").trim().toLowerCase();

const sbUser = (req: Request) => {
  const auth = req.headers.get("authorization") ?? "";
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: auth } } });
};
const sbService = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function userId(supabase: any) {
  const { data, error } = await supabase.auth.getUser();
  return error || !data?.user ? null : (data.user.id as string);
}

function normalizePath(req: Request) {
  let p = new URL(req.url).pathname.replace(/\/+$/, "");
  p = p.replace(/^\/functions\/v\d+\//, "/"); // strip /functions/v1
  const slugRe = new RegExp(`^/${FN_SLUG}(?=/|$)`);
  p = p.replace(slugRe, ""); // strip /email-campaigns
  if (p === "") p = "/";
  return p;
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ===== Status priority (like your old route) =====
const statusRank: Record<string, number> = {
  delivery: 1,
  open: 2,
  click: 3,
  bounce: 4,
  complaint: 5,
};
function rankOf(s?: string | null) {
  if (!s) return 0;
  return statusRank[String(s).toLowerCase()] ?? 0;
}
// Map SES event -> recipient.status value we store
function statusForEvent(evt: string): string | null {
  switch (evt) {
    case "delivery": return "delivered";
    case "bounce": return "bounced";
    case "complaint": return "complained";
    // open/click don’t change status, we only bump counters/timestamps
    default: return null;
  }
}

// ===================================================
// POST /campaigns
// body: { name, subject, html, from_email, contact_ids?: string[] }
async function createCampaign(req: Request) {
  const supabase = sbUser(req);
  const uid = await userId(supabase);
  if (!uid) return j({ error: "Unauthorized" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch {}
  const { name, subject, html, from_email, contact_ids } = body || {};
  if (!name || !subject || !html || !from_email) return j({ error: "Missing required fields" }, 400);

  // Try unlocked view first (minimal cols), fallback join if needed
  let rows: any[] = [];
  let viewOK = true;
  {
    let q = supabase.from("unlocked_contacts_v").select("contact_id,email").eq("user_id", uid);
    if (Array.isArray(contact_ids) && contact_ids.length) q = q.in("contact_id", contact_ids);
    const { data, error } = await q.limit(5000);
    if (!error) rows = data ?? [];
    else viewOK = false;
  }
  if (!viewOK || (rows.length === 0 && !(Array.isArray(contact_ids) && contact_ids.length))) {
    const { data: unlocks, error: uErr } = await supabase
      .from("contacts_unlocks")
      .select("contact_id")
      .eq("user_id", uid)
      .limit(5000);
    if (uErr) return j({ error: uErr.message }, 400);

    let ids = (unlocks ?? []).map((r: any) => r.contact_id).filter(Boolean);
    if (Array.isArray(contact_ids) && contact_ids.length) {
      const set = new Set(contact_ids.map(String));
      ids = ids.filter((id: any) => set.has(String(id)));
    }

    rows = [];
    for (const part of chunk(ids, 700)) {
      const { data: crows, error: cErr } = await supabase
        .from("contacts")
        .select("id,email")
        .in("id", part);
      if (cErr) return j({ error: cErr.message }, 400);
      rows.push(...(crows ?? []).map((c: any) => ({ contact_id: c.id, email: c.email })));
    }
  }

  // Deduplicate by contact_id and normalized email
  const seenId = new Set<string>();
  const seenEmail = new Set<string>();
  const recipients: { contact_id: string; email: string; tracking_token: string }[] = [];
  for (const r of rows ?? []) {
    const id = String(r.contact_id);
    const em = normEmail(r.email);
    if (!id || !em) continue;
    if (seenId.has(id) || seenEmail.has(em)) continue;
    seenId.add(id);
    seenEmail.add(em);
    recipients.push({ contact_id: id, email: em, tracking_token: crypto.randomUUID() });
  }

  const { data: camp, error: insErr } = await supabase
    .from("campaigns")
    .insert({
      user_id: uid,
      name,
      subject,
      from_email,
      html,
      recipients_count: recipients.length,
      status: "sending",
    })
    .select("id")
    .single();
  if (insErr) return j({ error: insErr.message }, 400);
  const campaign_id = camp!.id as string;

  if (recipients.length) {
    const { error: recErr } = await supabase.from("campaign_recipients").insert(
      recipients.map((r) => ({
        campaign_id,
        contact_id: r.contact_id,
        email: r.email,
        tracking_token: r.tracking_token,
        status: "queued",
      })),
    );
    if (recErr) return j({ error: recErr.message }, 400);
  }

  return j({ id: campaign_id, recipients: recipients.length }, 201);
}

// ===================================================
// POST /campaigns/:id/send
async function sendCampaign(req: Request, id: string) {
  const supabase = sbUser(req);
  const uid = await userId(supabase);
  if (!uid) return j({ error: "Unauthorized" }, 401);

  const camp = await supabase
    .from("campaigns")
    .select("id,user_id,subject,from_email,html,price_per_email")
    .eq("id", id)
    .single();
  if (camp.error || !camp.data) return j({ error: "Campaign not found" }, 404);
  if (camp.data.user_id !== uid) return j({ error: "Forbidden" }, 403);

  const rec = await supabase
    .from("campaign_recipients")
    .select("id,email")
    .eq("campaign_id", id)
    .eq("status", "queued");
  if (rec.error) return j({ error: rec.error.message }, 400);

  const recipients = rec.data ?? [];
  const count = recipients.length;
  if (count === 0) return j({ ok: true, sent: 0 });

  // Optional: pre-check credits
  let credits: number | null = null;
  try {
    const { data } = await supabase.rpc("fn_available_credits", { p_user: uid });
    if (typeof data === "number") credits = data;
  } catch {}
  const price = (camp.data.price_per_email ?? 1) as number;
  const needed = count * price;
  if (credits !== null && credits < needed) return j({ error: "Not enough credits" }, 402);

  // Optional debit
  try {
    const { error: dErr } = await supabase.rpc("sp_debit_credits", {
      p_user: uid,
      p_amount: needed,
      p_correlation: `send-${id}`,
      p_note: "Campaign send",
      p_metadata: { campaign_id: id, recipients: count },
    });
    if (dErr) console.warn("sp_debit_credits error:", dErr.message);
  } catch (e) {
    console.warn("sp_debit_credits call failed:", (e as any)?.message);
  }

  // Send via SES
  let sent = 0;
  for (const r of recipients) {
    try {
      const cmd = new SendEmailCommand({
        FromEmailAddress: camp.data.from_email,
        Destination: { ToAddresses: [r.email] },
        Content: {
          Simple: {
            Subject: { Data: camp.data.subject },
            Body: { Html: { Data: camp.data.html } },
          },
        },
        ConfigurationSetName: SES_CONFIGURATION_SET, // must attach config set
        EmailTags: [
          { Name: "campaign_id", Value: id },
          { Name: "recipient_id", Value: r.id },
        ],
      });
      const resp = await ses.send(cmd);
      const messageId = (resp as any)?.MessageId ?? null;

      await supabase
        .from("campaign_recipients")
        .update({ status: "sent", sent_at: now(), message_id: messageId, last_event_at: now() })
        .eq("id", r.id);

      sent++;
    } catch {
      await supabase
        .from("campaign_recipients")
        .update({ status: "bounced", last_event_at: now() })
        .eq("id", r.id);
    }
  }

  const { error: updErr } = await supabase
    .from("campaigns")
    .update({ credits_charged: needed })
    .eq("id", id);
  if (updErr) console.warn("credits_charged update failed:", updErr.message);

  return j({ ok: true, sent });
}

// ===================================================
// POST /sns  (SES -> SNS -> HTTPS)
// mirrors your old route's behavior + priority updates
async function handleSns(req: Request) {
  const supabase = sbService(); // service role to bypass RLS
  const raw = await req.text();
  const msgType = req.headers.get("x-amz-sns-message-type") || ""; // like your old route

  // SubscriptionConfirmation
  if (msgType === "SubscriptionConfirmation") {
    try {
      const outer = JSON.parse(raw);
      if (outer?.SubscribeURL) await fetch(outer.SubscribeURL);
      return j({ ok: true, confirmed: true });
    } catch (e: any) {
      return j({ error: e?.message || "Bad SubscriptionConfirmation" }, 400);
    }
  }

  // Notification (normal event)
  if (msgType === "Notification") {
    let outer: any;
    try { outer = JSON.parse(raw); } catch { return j({ error: "Invalid SNS envelope" }, 400); }
    let ev: any;
    try { ev = typeof outer.Message === "string" ? JSON.parse(outer.Message) : outer.Message; }
    catch { return j({ error: "Invalid SNS Message" }, 400); }

    const eventType = String(ev.eventType || ev.notificationType || "unknown").toLowerCase();
    const mail = ev.mail || {};
    const messageId = mail.messageId || null;
    const destination = mail.destination?.[0] || null;
    const eventTime = mail.timestamp || now();

    // Metadata (like your route)
    let link: string | null = null;
    let ip: string | null = null;
    let userAgent: string | null = null;

    if (eventType === "click") {
      link = ev.click?.link || null;
      ip = ev.click?.ipAddress || null;
      userAgent = ev.click?.userAgent || null;
    } else if (eventType === "open") {
      ip = ev.open?.ipAddress || null;
      userAgent = ev.open?.userAgent || null;
    }

    // Prefer tags to identify the row; then messageId; then (campaign_id + email)
    const tags = mail.tags || {};
    const tagCampaign = (tags.campaign_id?.[0]) ?? null;
    const tagRecipient = (tags.recipient_id?.[0]) ?? null;

    // Resolve recipient
    let recId: string | null = tagRecipient ?? null;
    let campaignId: string | null = tagCampaign ?? null;

    if (!recId && messageId) {
      const { data: listByMsg } = await supabase
        .from("campaign_recipients")
        .select("id,campaign_id")
        .eq("message_id", messageId)
        .limit(1);
      const found = listByMsg?.[0];
      if (found) {
        recId = found.id;
        campaignId = campaignId || found.campaign_id;
      }
    }

    if (!recId && tagCampaign && destination) {
      const { data: listByEmail } = await supabase
        .from("campaign_recipients")
        .select("id,campaign_id")
        .eq("campaign_id", tagCampaign)
        .eq("email", normEmail(destination))
        .limit(1);
      const found = listByEmail?.[0];
      if (found) {
        recId = found.id;
        campaignId = campaignId || found.campaign_id;
      }
    }

    if (!campaignId) {
      // As a last resort, try to get it via recipient row (if we have recId)
      if (recId) {
        const { data: rRow } = await supabase
          .from("campaign_recipients")
          .select("campaign_id")
          .eq("id", recId)
          .limit(1);
        campaignId = rRow?.[0]?.campaign_id ?? null;
      }
    }

    // Always record raw event (even if we couldn't fully resolve)
    await supabase.from("campaign_events").insert({
      campaign_id: campaignId,
      recipient_id: recId,
      kind: eventType,
      meta: ev,
    });

    if (!recId) {
      // Can't map this event to a recipient => nothing else to mutate
      return j({ ok: true, note: "event recorded; recipient not found" });
    }

    // Fetch current recipient state for priority compare
    const { data: recState } = await supabase
      .from("campaign_recipients")
      .select("status,opens_count,clicks_count")
      .eq("id", recId)
      .limit(1);
    const current = recState?.[0] ?? { status: null, opens_count: 0, clicks_count: 0 };
    const incomingRank = rankOf(eventType);
    const existingRank = rankOf(current.status);

    // Build update per eventType (priority-aware)
    const t = new Date(eventTime).toISOString();
    const upd: any = { last_event_at: t };

    // Status bump if higher priority
    const nextStatus = statusForEvent(eventType);
    if (nextStatus && incomingRank > existingRank) {
      upd.status = nextStatus;
    }
    // If open/click arrive before "delivery", ensure status at least "delivered"
    if ((eventType === "open" || eventType === "click") && existingRank < rankOf("delivery")) {
      upd.status = "delivered";
    }

    // Counters / timestamps
    if (eventType === "open") {
      upd.opened_at = t;
      upd.opens_count = (current.opens_count ?? 0) + 1;
    } else if (eventType === "click") {
      upd.clicked_at = t;
      upd.clicks_count = (current.clicks_count ?? 0) + 1;
    }

    // Optional: you can persist ip/userAgent/link to a separate audit table if you like

    const { error: uErr } = await supabase.from("campaign_recipients").update(upd).eq("id", recId);
    if (uErr) console.warn("recipient update failed:", uErr.message);

    return j({ ok: true });
  }

  // Not a type we handle
  return j({ ok: true, ignored: true });
}

// ===================================================
// Server
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const method = req.method.toUpperCase();
  const path = normalizePath(req);

  try {
    if (method === "POST" && path === "/campaigns") return await createCampaign(req);
    if (method === "POST" && /^\/campaigns\/[^/]+\/send$/.test(path)) {
      const id = path.split("/")[2];
      return await sendCampaign(req, id);
    }
    if (method === "POST" && path === "/sns") return await handleSns(req);
    if (method === "GET" && (path === "/" || path === "")) return j({ ok: true, service: FN_SLUG });
    return j({ error: `Unsupported route ${method} ${path}` }, 404);
  } catch (e: any) {
    return j({ error: e?.message || "Internal error" }, 500);
  }
});
