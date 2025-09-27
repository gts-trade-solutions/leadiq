// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  SESv2Client,
  SendEmailCommand,
} from "npm:@aws-sdk/client-sesv2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
} as const;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const AWS_REGION = Deno.env.get("AWS_REGION")!;
const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID")!;
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY")!;
const PER_EMAIL_CREDITS = Number(Deno.env.get("PER_EMAIL_CREDITS") ?? "1"); // default 1

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user ?? null;
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type":"application/json" } });

    // parse inputs
    const body = await req.json().catch(() => ({}));
    const to: string | undefined = body?.to;
    const subject: string = body?.subject || "Test email";
    const html: string = body?.html || `<p>This is a test email.</p>`;
    if (!to) return new Response(JSON.stringify({ error: "Missing 'to' address" }), { status: 400, headers: { ...cors, "Content-Type":"application/json" } });

    // ensure the user has a verified sender
    const senderRow = await supabase
      .from("email_identities")
      .select("email,status")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    const sender = senderRow.data?.email;
    const senderStatus = senderRow.data?.status;
    if (!sender || senderStatus !== "verified") {
      return new Response(JSON.stringify({ error: "Sender not verified" }), {
        status: 400, headers: { ...cors, "Content-Type":"application/json" }
      });
    }

    // check balance
    const wal = await supabase.from("wallet").select("balance").eq("user_id", user.id).single();
    const balance = wal.data?.balance ?? 0;
    if (balance < PER_EMAIL_CREDITS) {
      return new Response(JSON.stringify({ error: "Insufficient credits", balance }), {
        status: 402, headers: { ...cors, "Content-Type":"application/json" }
      });
    }

    // send via SES
    const ses = new SESv2Client({
      region: AWS_REGION,
      credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
    });

    const sendResp = await ses.send(new SendEmailCommand({
      FromEmailAddress: sender,
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: subject },
          Body: { Html: { Data: html } }
        }
      }
    }));

    const messageId = (sendResp as any)?.MessageId ?? crypto.randomUUID();
    const correlation_id = `testsend-${user.id}-${messageId}`;

    // idempotent debit (will no-op if correlation already exists)
    const debit = await supabase
      .from("credits_ledger")
      .insert({
        user_id: user.id,
        delta: -PER_EMAIL_CREDITS,
        kind: "debit",           // use an existing enum value in your credit_kind
        correlation_id,
        note: "test_send",
        metadata: { to, subject, messageId }
      })
      .select("user_id")
      .single();

    if (debit.error && debit.error.code !== "23505") {
      // 23505 = unique violation on correlation_id
      return new Response(JSON.stringify({ error: debit.error.message }), {
        status: 500, headers: { ...cors, "Content-Type":"application/json" }
      });
    }

    // basic log (adjust to your email_sends schema)
    await supabase.from("email_sends").insert({
      user_id: user.id,
      to_email: to,
      from_email: sender,
      subject,
      message_id: messageId,
      kind: "test",
      status: "sent",
      metadata: { correlation_id }
    });

    // new balance
    const wal2 = await supabase.from("wallet").select("balance").eq("user_id", user.id).single();

    return new Response(JSON.stringify({
      ok: true,
      messageId,
      balance: wal2.data?.balance ?? balance - PER_EMAIL_CREDITS
    }), {
      status: 200, headers: { ...cors, "Content-Type":"application/json" }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Unexpected error" }), {
      status: 500, headers: { ...cors, "Content-Type":"application/json" }
    });
  }
});
