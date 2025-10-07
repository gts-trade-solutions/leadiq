import { supabaseService } from "@/lib/supabase";

export async function logUsage(userId: string, provider: string, event: string, metadata: any = {}) {
  try {
    await supabaseService().from("social_connection_usage").insert({
      user_id: userId, provider, event, metadata, created_at: new Date().toISOString()
    });
  } catch { /* best-effort */ }
}
