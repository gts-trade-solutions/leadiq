// supabase/functions/email-start/index.ts
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  SESv2Client,
  CreateEmailIdentityCommand,
  DeleteEmailIdentityCommand,
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
const CHANGE_LIMIT = 2;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });

    // Require auth
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user ?? null;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const email: string | undefined = body?.email;
    if (!email) {
      return new Response(JSON.stringify({ error: "Missing email" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const targetEmail = email.trim().toLowerCase();

    // Current row (one per user)
    const existing = await supabase
      .from("email_identities")
      .select("id,email,changes_used")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (existing.error && (existing as any).error?.code !== "PGRST116") {
      return new Response(JSON.stringify({ error: existing.error.message }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const oldEmail = existing.data?.email?.trim().toLowerCase() || null;
    const isNew = !oldEmail || oldEmail !== targetEmail;

    // Enforce 2-change limit when switching to a different email
    const used = existing.data?.changes_used ?? 0;
    if (isNew && existing.data && used >= CHANGE_LIMIT) {
      return new Response(JSON.stringify({ error: "Change limit reached", changes_left: 0 }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // SES client
    const ses = new SESv2Client({
      region: AWS_REGION,
      credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
    });

    // (Re)send verification for the new email (idempotent)
    try {
      await ses.send(new CreateEmailIdentityCommand({ EmailIdentity: targetEmail }));
    } catch (e: any) {
      const name = (e?.name || e?.Code || "").toString().toLowerCase();
      if (!name.includes("alreadyexist")) {
        const status = e?.$metadata?.httpStatusCode && Number(e.$metadata.httpStatusCode) !== 200
          ? e.$metadata.httpStatusCode : 500;
        return new Response(JSON.stringify({ error: "SES error", detail: e?.message ?? String(e) }), {
          status, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
    }

    // If switching to a different email, best-effort delete the old identity from SES
    if (isNew && oldEmail) {
      try {
        await ses.send(new DeleteEmailIdentityCommand({ EmailIdentity: oldEmail }));
      } catch {
        // swallow errors; cleanup shouldn't block the flow
      }
    }

    // Write to DB (one row per user)
    let id: string;
    let changes_used = used;

    if (existing.data) {
      const upd = await supabase
        .from("email_identities")
        .update({
          email: targetEmail,
          region: AWS_REGION,
          status: "pending",
          verified_at: null,
          changes_used: isNew ? used + 1 : used,
        })
        .eq("id", existing.data.id)
        .select("id,changes_used")
        .single();

      if (upd.error) {
        return new Response(JSON.stringify({ error: upd.error.message }), {
          status: 500, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      id = upd.data.id;
      changes_used = upd.data.changes_used ?? used;
    } else {
      const ins = await supabase
        .from("email_identities")
        .insert({
          user_id: user.id,
          email: targetEmail,
          region: AWS_REGION,
          status: "pending",
          verified_at: null,
          changes_used: 0,
        })
        .select("id,changes_used")
        .single();

      if (ins.error) {
        return new Response(JSON.stringify({ error: ins.error.message }), {
          status: 500, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      id = ins.data.id;
      changes_used = ins.data.changes_used ?? 0;
    }

    const changes_left = Math.max(0, CHANGE_LIMIT - changes_used);
    return new Response(JSON.stringify({ mode: "auth", id, email: targetEmail, status: "pending", changes_left }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Unexpected error" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
