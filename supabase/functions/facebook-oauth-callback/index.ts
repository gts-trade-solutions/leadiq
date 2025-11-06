// supabase/functions/facebook-oauth-callback/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const APP_ID = Deno.env.get("FACEBOOK_APP_ID")!;
  const APP_SECRET = Deno.env.get("FACEBOOK_APP_SECRET")!;
  const REDIRECT_URI = Deno.env.get("FACEBOOK_REDIRECT_URI")!;
  const API_VER = Deno.env.get("FB_API_VERSION") || "v19.0";
  const FE_REDIRECT =
    Deno.env.get("FE_REDIRECT_AFTER_CONNECT") || "/portal/multi-channel";

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  // Basic error from Facebook
  if (error) {
    return Response.redirect(
      `${FE_REDIRECT}?facebook=error&reason=${encodeURIComponent(error)}`,
      302
    );
  }

  if (!code || !state) {
    return Response.redirect(
      `${FE_REDIRECT}?facebook=error&reason=missing_code_or_state`,
      302
    );
  }

  // Validate state → get user
  const { data: st } = await supabase
    .from("social_oauth_states")
    .select("user_id")
    .eq("state", state)
    .eq("provider", "facebook")
    .maybeSingle();

  if (!st) {
    return Response.redirect(
      `${FE_REDIRECT}?facebook=error&reason=invalid_state`,
      302
    );
  }
  const userId = st.user_id;

  // Exchange code → short-lived user token
  const tokenRes = await fetch(
    `https://graph.facebook.com/${API_VER}/oauth/access_token?` +
      new URLSearchParams({
        client_id: APP_ID,
        client_secret: APP_SECRET,
        redirect_uri: REDIRECT_URI,
        code,
      }),
    { method: "GET" }
  );
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) {
    return Response.redirect(
      `${FE_REDIRECT}?facebook=error&reason=token_exchange_failed`,
      302
    );
  }

  const shortToken = tokenJson.access_token as string;

  // Exchange short → long-lived user token (~60 days)
  const llRes = await fetch(
    `https://graph.facebook.com/${API_VER}/oauth/access_token?` +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: APP_ID,
        client_secret: APP_SECRET,
        fb_exchange_token: shortToken,
      }),
    { method: "GET" }
  );
  const llJson = await llRes.json();
  const userToken = (llJson.access_token as string) ?? shortToken;

  // Fetch user profile id (for bookkeeping)
  const meRes = await fetch(
    `https://graph.facebook.com/${API_VER}/me?fields=id,name&access_token=${userToken}`
  );
  const me = await meRes.json();
  const fbUserId = me.id as string;

  // Fetch managed Pages (ids + names)
  const pagesRes = await fetch(
    `https://graph.facebook.com/${API_VER}/me/accounts?fields=id,name&access_token=${userToken}`
  );
  const pagesJson = await pagesRes.json();
  const pages = Array.isArray(pagesJson.data) ? pagesJson.data : [];
  const pageIds = pages.map((p: any) => p.id);

  // Upsert social_accounts
  const { data: existing } = await supabase
    .from("social_accounts")
    .select("fb_user_id")
    .eq("user_id", userId)
    .eq("provider", "facebook")
    .maybeSingle();

  // If switching accounts, enforce change limit
  if (existing && existing.fb_user_id && existing.fb_user_id !== fbUserId) {
    const { data: lim } = await supabase
      .from("social_account_limits")
      .select("changes_used, changes_limit")
      .eq("user_id", userId)
      .eq("provider", "facebook")
      .maybeSingle();

    if (lim && lim.changes_used >= lim.changes_limit) {
      return Response.redirect(
        `${FE_REDIRECT}?facebook=error&reason=change_limit`,
        302
      );
    }

    // Increment usage
    await supabase.from("social_account_limits").upsert({
      user_id: userId,
      provider: "facebook",
      changes_used: (lim?.changes_used ?? 0) + 1,
    });
  }

  await supabase.from("social_accounts").upsert({
    user_id: userId,
    provider: "facebook",
    access_token: userToken,
    scope: "pages_show_list,pages_manage_posts",
    fb_user_id: fbUserId,
    page_ids: pageIds,
    updated_at: new Date().toISOString(),
  });

  // Cleanup used state
  await supabase
    .from("social_oauth_states")
    .delete()
    .eq("state", state)
    .eq("provider", "facebook");

  // Redirect back to app
  return Response.redirect(`${FE_REDIRECT}?facebook=connected`, 302);
});
