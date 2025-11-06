// supabase/functions/linkedin-oauth-callback/index.ts
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LI_CLIENT_ID = Deno.env.get("LINKEDIN_CLIENT_ID")!;
const LI_CLIENT_SECRET = Deno.env.get("LINKEDIN_CLIENT_SECRET")!;
const LI_REDIRECT = Deno.env.get("LINKEDIN_REDIRECT_URI")!;

const TXT = { headers: { "Content-Type": "text/plain; charset=utf-8" } };

async function j(url: string, init: RequestInit) {
  const r = await fetch(url, init);
  const t = await r.text();
  if (!r.ok) throw new Error(t);
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

serve(async (req) => {
  const u = new URL(req.url);
  const code = u.searchParams.get("code") || "";
  const state = u.searchParams.get("state") || "";
  const err = u.searchParams.get("error");
  const desc = u.searchParams.get("error_description") || "";

  // LinkedIn sent an error back
  if (err) {
    return new Response(
      `LinkedIn error: ${err}${
        desc ? " — " + desc : ""
      }. Close this tab and return to the app.`,
      TXT
    );
  }

  if (!code || !state) {
    return new Response(
      "Missing code or state. Close this tab and return to the app.",
      TXT
    );
  }

  try {
    const admin = createClient(SUPABASE_URL, SRK);

    // 1) Validate state -> user
    const { data: st, error: stErr } = await admin
      .from("social_oauth_states")
      .select("user_id, provider")
      .eq("state", state)
      .maybeSingle();
    if (stErr) throw stErr;
    if (!st || st.provider !== "linkedin") throw new Error("Invalid state");

    // 2) Exchange code -> token
    const tok = await j("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: LI_REDIRECT,
        client_id: LI_CLIENT_ID,
        client_secret: LI_CLIENT_SECRET,
      }),
    });
    const access_token = tok.access_token as string;
    const expires_in = Number(tok.expires_in ?? 0);
    const expires_at = new Date(Date.now() + expires_in * 1000).toISOString();

    // 3) Optional OIDC identity
    let member_urn = "";
    try {
      const info = await j("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (info?.sub) member_urn = `urn:li:person:${info.sub}`;
    } catch {
      /* ok */
    }

    // 4) Previous URN to detect identity change
    const { data: prev } = await admin
      .from("social_accounts")
      .select("member_urn")
      .eq("user_id", st.user_id)
      .eq("provider", "linkedin")
      .maybeSingle();
    const prevUrn = prev?.member_urn || null;

    // 5) Parse scopes -> text[]
    const rawScope = typeof tok.scope === "string" ? tok.scope : "";
    const scopeArr = rawScope.split(/[,\s]+/).filter(Boolean);

    // 6) Upsert account (true UPSERT on (user_id, provider))
    const up = await admin
      .from("social_accounts")
      .upsert(
        {
          user_id: st.user_id,
          provider: "linkedin",
          access_token,
          expires_at,
          scope: scopeArr,
          member_urn: member_urn || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,provider" }
      )
      .select("user_id");
    if (up.error) throw up.error;

    // 7) Increment "changes_used" if identity switched (cap at 2)
    if (member_urn && prevUrn && prevUrn !== member_urn) {
      const { data: usage } = await admin
        .from("social_connection_usage")
        .select("changes_used")
        .eq("user_id", st.user_id)
        .eq("provider", "linkedin")
        .maybeSingle();
      const used = usage?.changes_used ?? 0;
      if (used < 2) {
        await admin.from("social_connection_usage").upsert(
          {
            user_id: st.user_id,
            provider: "linkedin",
            changes_used: used + 1,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,provider" }
        );
      }
    }

    // 8) Clean state & respond with plain text
    await admin.from("social_oauth_states").delete().eq("state", state);

    return new Response("LinkedIn connected. You can close this tab.", TXT);
  } catch (e: any) {
    return new Response(
      `LinkedIn error: ${
        e?.message || String(e)
      }. Close this tab and return to the app.`,
      TXT
    );
  }
});
