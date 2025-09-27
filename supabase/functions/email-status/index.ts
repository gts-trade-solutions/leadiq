// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SESv2Client, GetEmailIdentityCommand } from "npm:@aws-sdk/client-sesv2";

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
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user ?? null;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const identityId: string | undefined = body?.identityId;

    const row = identityId
      ? await supabase.from("email_identities").select("id,email,changes_used").eq("id", identityId).single()
      : await supabase.from("email_identities").select("id,email,changes_used").eq("user_id", user.id).limit(1).maybeSingle();

    if (row.error || !row.data) {
      return new Response(JSON.stringify({ error: row.error?.message ?? "No sender found for user" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const email = row.data.email;
    const ses = new SESv2Client({
      region: AWS_REGION,
      credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
    });

    let verified = false;
    try {
      const resp = await ses.send(new GetEmailIdentityCommand({ EmailIdentity: email }));
      verified = !!resp.VerifiedForSendingStatus;
    } catch {
      verified = false;
    }
    const status: "pending" | "verified" | "failed" = verified ? "verified" : "pending";

    const up = await supabase
      .from("email_identities")
      .update({ status, verified_at: verified ? new Date().toISOString() : null, region: AWS_REGION })
      .eq("id", row.data.id)
      .select("id,email,status,verified_at,changes_used")
      .single();

    if (up.error) {
      return new Response(JSON.stringify({ error: up.error.message }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const changes_left = Math.max(0, CHANGE_LIMIT - (up.data.changes_used ?? 0));
    return new Response(JSON.stringify({ mode: "auth", ...up.data, changes_left }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Unexpected error" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
