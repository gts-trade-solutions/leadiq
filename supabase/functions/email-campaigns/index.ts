// supabase/functions/email-campaigns/index.ts
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import { SESv2Client, SendEmailCommand } from "npm:@aws-sdk/client-sesv2";

// ========= ENV =========
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AWS_REGION = Deno.env.get("AWS_REGION")!;
const SES_CONFIGURATION_SET = Deno.env.get("SES_CONFIGURATION_SET") || "";

// ========= Clients =========
const ses = new SESv2Client({ region: AWS_REGION });
const svc = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const asUser = (req: Request) =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: req.headers.get("authorization") ?? "" },
    },
  });

// ========= CORS (allow all — same style as your reference) =========
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
} as const;

const j = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

// ========= Helpers =========
const nowIso = () => new Date().toISOString();
const normEmail = (e?: string | null) => (e || "").trim().toLowerCase();

async function requireUserId(client: SupabaseClient) {
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) return null;
  return data.user.id as string;
}

async function getVerifiedSender(userId: string, provided?: string | null) {
  const db = svc();
  if (provided) {
    const { data } = await db
      .from("email_identities")
      .select("email")
      .eq("user_id", userId)
      .eq("email", normEmail(provided))
      .eq("status", "verified")
      .maybeSingle();
    return data?.email ?? null;
  }
  const { data } = await db
    .from("email_identities")
    .select("email")
    .eq("user_id", userId)
    .eq("status", "verified")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.email ?? null;
}

// ========= Update helpers (used by SNS) =========
type UpdateFields = {
  status?: string;
  last_event_at?: string;
  opened_at?: string | null;
  clicked_at?: string | null;
  opens_count?: number;
  clicks_count?: number;
};

async function updateBoth(message_id: string, fields: UpdateFields) {
  const db = svc();
  await db
    .from("campaign_recipients")
    .update(fields)
    .eq("message_id", message_id);
  await db.from("oneoff_emails").update(fields).eq("message_id", message_id);
}

async function bumpCount(
  message_id: string,
  kind: "opens_count" | "clicks_count",
  atField: "opened_at" | "clicked_at"
) {
  const db = svc();

  // Try campaign_recipients first, then oneoff_emails
  let table: "campaign_recipients" | "oneoff_emails" = "campaign_recipients";
  let rec = await db
    .from("campaign_recipients")
    .select(`${kind}, ${atField}`)
    .eq("message_id", message_id)
    .maybeSingle();

  if (!rec.data) {
    table = "oneoff_emails";
    rec = await db
      .from("oneoff_emails")
      .select(`${kind}, ${atField}`)
      .eq("message_id", message_id)
      .maybeSingle();
  }
  if (!rec.data) return;

  const current = (rec.data[kind] as number | null) ?? 0;
  const update: Record<string, any> = {
    [kind]: current + 1,
    last_event_at: nowIso(),
  };
  if (!rec.data[atField]) update[atField] = nowIso();

  const { error } = await db
    .from(table)
    .update(update)
    .eq("message_id", message_id);
  if (error)
    console.error("SNS bumpCount update failed", {
      table,
      message_id,
      update,
      error,
    });
}

// ========= SNS webhook (supports WRAPPED and RAW) =========
async function handleSns(req: Request) {
  const raw = await req.text();

  try {
    const outer = JSON.parse(raw);

    // 1) Subscription confirmation
    if (outer?.Type === "SubscriptionConfirmation" && outer?.SubscribeURL) {
      try {
        await fetch(outer.SubscribeURL);
      } catch (e) {
        console.error("SNS confirm error", e);
        return j({ ok: false, error: "confirm_failed" }, 500);
      }
      return j({ ok: true, confirmed: true });
    }

    // 2) SNS-wrapped notification
    if (outer?.Type === "Notification") {
      const msg =
        typeof outer.Message === "string"
          ? JSON.parse(outer.Message)
          : outer.Message;
      if (msg?.eventType && msg?.mail?.messageId) {
        await processSesEvent(msg.eventType, msg.mail.messageId);
        return j({ ok: true, processed: true });
      }
      return j({ ok: true, ignored: true });
    }

    // 3) RAW SES event (when "Raw message delivery" = ON)
    if (outer?.eventType && outer?.mail?.messageId) {
      await processSesEvent(outer.eventType, outer.mail.messageId);
      return j({ ok: true, processed: true, raw: true });
    }

    return j({ ok: true, ignored: true });
  } catch {
    return j({ ok: true, ignored: true });
  }
}

async function processSesEvent(eventType: string, messageId: string) {
  const evt = eventType.toLowerCase();
  const ts = nowIso();

  if (evt === "delivery")
    await updateBoth(messageId, { status: "delivered", last_event_at: ts });
  else if (evt === "bounce")
    await updateBoth(messageId, { status: "bounced", last_event_at: ts });
  else if (evt === "complaint")
    await updateBoth(messageId, { status: "complained", last_event_at: ts });
  else if (evt === "open")
    await bumpCount(messageId, "opens_count", "opened_at");
  else if (evt === "click")
    await bumpCount(messageId, "clicks_count", "clicked_at");
  else console.log("SNS: unhandled eventType", eventType);
}

// ========= Campaign create =========
async function handleCreateCampaign(req: Request, userClient: SupabaseClient) {
  const uid = await requireUserId(userClient);
  if (!uid) return j({ code: 401, message: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name || "Untitled");
  const subject = String(body?.subject || "");
  const html = String(body?.html || "");
  const from_email = normEmail(body?.from_email);
  const contact_ids: string[] = Array.isArray(body?.contact_ids)
    ? body.contact_ids
    : [];

  if (!subject || !html)
    return j({ code: 400, message: "Missing subject or html" }, 400);

  const sender = await getVerifiedSender(uid, from_email);
  if (!sender)
    return j(
      { code: "SENDER_NOT_VERIFIED", message: "From email is not verified." },
      400
    );

  // Create campaign (let DB default set the status to avoid enum mismatch)
  const { data: camp, error: campErr } = await userClient
    .from("campaigns")
    .insert({ user_id: uid, name, subject, html, from_email: sender })
    .select("id")
    .single();
  if (campErr)
    return j({ code: 500, message: campErr.message || "Create failed" }, 500);
  const campaign_id = camp.id as string;

  if (!contact_ids.length) return j({ ok: true, id: campaign_id, inserted: 0 });

  // Pull unlocked contacts and dedupe by email
  const db = svc();
  const { data: unlocked, error: uErr } = await db
    .from("unlocked_contacts_v")
    .select("contact_id,email")
    .in("contact_id", contact_ids);
  if (uErr)
    return j(
      { code: 500, message: uErr.message || "Failed loading contacts" },
      500
    );

  const seen = new Set<string>();
  const rows = (unlocked ?? [])
    .map((r) => ({
      contact_id: r.contact_id as string,
      email: normEmail(r.email),
    }))
    .filter((r) => r.email && !seen.has(r.email) && (seen.add(r.email), true))
    .map((r) => ({
      campaign_id,
      contact_id: r.contact_id,
      email: r.email,
      status: "queued",
      tracking_token: crypto.randomUUID(), // <-- required by your NOT NULL column
    }));

  if (rows.length) {
    const { error: recErr } = await db.from("campaign_recipients").insert(rows);
    if (recErr)
      return j(
        { code: 500, message: recErr.message || "Failed inserting recipients" },
        500
      );
  }

  return j({ ok: true, id: campaign_id, inserted: rows.length });
}

// ========= Campaign send =========
async function handleSendCampaign(
  userClient: SupabaseClient,
  campaign_id: string
) {
  const uid = await requireUserId(userClient);
  if (!uid) return j({ code: 401, message: "Unauthorized" }, 401);

  if (!SES_CONFIGURATION_SET) {
    console.error("Missing SES_CONFIGURATION_SET; tracking will not work");
    return j(
      {
        code: 500,
        message: "SES_CONFIGURATION_SET is not set; cannot send with tracking.",
      },
      500
    );
  }

  const db = svc();
  const { data: camp, error: cErr } = await db
    .from("campaigns")
    .select("id,user_id,subject,html,from_email,status")
    .eq("id", campaign_id)
    .maybeSingle();
  if (cErr || !camp || camp.user_id !== uid)
    return j({ code: 404, message: "Campaign not found" }, 404);

  const sender = await getVerifiedSender(uid, camp.from_email);
  if (!sender)
    return j(
      { code: "SENDER_NOT_VERIFIED", message: "From email is not verified." },
      400
    );

  const { data: recs } = await db
    .from("campaign_recipients")
    .select("id,email")
    .eq("campaign_id", campaign_id)
    .eq("status", "queued")
    .limit(5000);

  // mark "sending" to satisfy your enum (sending|sent|failed)
  await db
    .from("campaigns")
    .update({ status: "sending" })
    .eq("id", campaign_id);

  let sent = 0;
  for (const r of recs ?? []) {
    try {
      const res = await ses.send(
        new SendEmailCommand({
          FromEmailAddress: sender,
          Destination: { ToAddresses: [r.email] },
          Content: {
            Simple: {
              Subject: { Data: camp.subject, Charset: "UTF-8" },
              Body: { Html: { Data: camp.html, Charset: "UTF-8" } },
            },
          },
          ConfigurationSetName: SES_CONFIGURATION_SET, // REQUIRED for events
          EmailTags: [
            { Name: "type", Value: "campaign" },
            { Name: "campaign_id", Value: campaign_id },
            { Name: "recipient_id", Value: r.id },
          ],
        })
      );
      await db
        .from("campaign_recipients")
        .update({
          status: "sent",
          message_id: res.MessageId ?? null,
          sent_at: nowIso(),
        })
        .eq("id", r.id);
      sent++;
    } catch (e) {
      console.error("SES send error", e);
      await db
        .from("campaign_recipients")
        .update({ status: "queued" })
        .eq("id", r.id);
    }
  }

  // mark campaign "sent" if nothing left in queue
  const { count } = await db
    .from("campaign_recipients")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaign_id)
    .eq("status", "queued");
  await db
    .from("campaigns")
    .update({ status: count ? "sending" : "sent" })
    .eq("id", campaign_id);

  return j({ ok: true, sent });
}

// ========= One-off send =========
async function handleOneoffSend(req: Request, userClient: SupabaseClient) {
  const uid = await requireUserId(userClient);
  if (!uid) return j({ code: 401, message: "Unauthorized" }, 401);

  if (!SES_CONFIGURATION_SET) {
    console.error("Missing SES_CONFIGURATION_SET; tracking will not work");
    return j(
      {
        code: 500,
        message: "SES_CONFIGURATION_SET is not set; cannot send with tracking.",
      },
      500
    );
  }

  const body = await req.json().catch(() => ({}));
  const to = normEmail(body?.to);
  const subject = String(body?.subject || "").trim();
  const html = String(body?.html || "");
  const from_email = normEmail(body?.from_email);
  const contact_id = body?.contact_id ? String(body.contact_id) : null;

  if (!to || !subject || !html)
    return j({ code: 400, message: "Missing 'to', 'subject' or 'html'." }, 400);

  const sender = await getVerifiedSender(uid, from_email);
  if (!sender)
    return j(
      { code: "SENDER_NOT_VERIFIED", message: "No verified sender." },
      400
    );

  const userDb = userClient;
  const db = svc();

  const { data: ins, error: insErr } = await userDb
    .from("oneoff_emails")
    .insert({
      user_id: uid,
      contact_id,
      email: to,
      from_email: sender,
      subject,
      html,
      status: "queued",
    })
    .select("id")
    .single();
  if (insErr)
    return j({ code: 500, message: insErr.message || "Insert failed" }, 500);
  const id = ins.id as string;

  let msgId = "";
  try {
    const res = await ses.send(
      new SendEmailCommand({
        FromEmailAddress: sender,
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: { Html: { Data: html, Charset: "UTF-8" } },
          },
        },
        ConfigurationSetName: SES_CONFIGURATION_SET, // REQUIRED for events
        EmailTags: [
          { Name: "type", Value: "oneoff" },
          { Name: "oneoff_id", Value: id },
          { Name: "user_id", Value: uid },
        ],
      })
    );
    msgId = res?.MessageId ?? "";
  } catch (e: any) {
    await db
      .from("oneoff_emails")
      .update({ error: e?.message ?? "SES send failed" })
      .eq("id", id);
    return j({ code: 502, message: e?.message ?? "SES send failed" }, 502);
  }

  await db
    .from("oneoff_emails")
    .update({ status: "sent", message_id: msgId, sent_at: nowIso() })
    .eq("id", id);
  return j({ ok: true, id, message_id: msgId });
}

// ========= Server =========
serve(async (req: Request) => {
  // Preflight for ALL paths
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS });

  try {
    const p = new URL(req.url).pathname;

    // Public health
    if (
      req.method === "GET" &&
      /\/(functions\/v1\/)?email-campaigns\/?$/.test(p)
    ) {
      return j({
        ok: true,
        service: "email-campaigns",
        tracking_config_set: !!SES_CONFIGURATION_SET,
      });
    }

    // Public SNS webhook
    if (
      req.method === "POST" &&
      /\/(functions\/v1\/)?email-campaigns\/sns$/.test(p)
    ) {
      return handleSns(req);
    }

    // Auth gate (everything else)
    const userClient = asUser(req);
    const uid = await requireUserId(userClient);
    if (!uid) return j({ code: 401, message: "Invalid JWT" }, 401);

    // Create campaign
    if (
      req.method === "POST" &&
      /\/(functions\/v1\/)?email-campaigns\/campaigns$/.test(p)
    ) {
      return handleCreateCampaign(req, userClient);
    }

    // Send campaign
    const m = p.match(
      /\/(functions\/v1\/)?email-campaigns\/campaigns\/([a-f0-9-]{36})\/send$/i
    );
    if (req.method === "POST" && m) {
      return handleSendCampaign(userClient, m[2]);
    }

    // One-off send
    if (
      req.method === "POST" &&
      /\/(functions\/v1\/)?email-campaigns\/oneoff\/send$/.test(p)
    ) {
      return handleOneoffSend(req, userClient);
    }

    return j({ code: 404, message: "Not found" }, 404);
  } catch (e) {
    console.error("Unhandled error", e);
    return j({ code: 500, message: "Internal error" }, 500);
  }
});
