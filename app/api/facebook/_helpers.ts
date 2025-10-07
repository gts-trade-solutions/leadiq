import crypto from "crypto";
import { supabaseService } from "@/lib/supabase";
import { requireUser, HttpError } from "@/lib/auth";

export const FB_VER = "v23.0";
const APP_SECRET = process.env.FACEBOOK_APP_SECRET!;

export function appsecret_proof(t: string) {
  return crypto.createHmac("sha256", APP_SECRET).update(t).digest("hex");
}

export async function requireUserAndFbToken() {
  const user = await requireUser();
  const svc = supabaseService();
  const { data, error } = await svc
    .from("social_accounts")
    .select("access_token, fb_user_id")
    .eq("user_id", user.id)
    .eq("provider", "facebook")
    .single();

  if (error || !data?.access_token) {
    throw new HttpError(401, "Facebook not connected");
  }
  return { userId: user.id, accessToken: data.access_token as string, fbUserId: data.fb_user_id as string };
}
