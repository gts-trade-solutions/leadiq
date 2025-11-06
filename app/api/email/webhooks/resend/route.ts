import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ResendEvent = {
  type: string; // e.g. "email.delivered", "email.bounced"
  data: any;
};

export async function POST(req: Request) {
  try {
    const evt = (await req.json()) as ResendEvent;
    const now = new Date().toISOString();

    const type = evt?.type;
    const msg = evt?.data;
    const providerId: string | undefined = msg?.id;
    const toEmail: string | undefined = msg?.to ?? msg?.recipient;
    const deliveryStatus =
      type === "email.delivered" ? "delivered"
      : type === "email.bounced" ? "bounced"
      : type === "email.complained" ? "complained"
      : null;

    // Prefer matching by message_id when possible
    let q = supabaseAdmin.from("campaign_recipients").update({
      last_event_at: now,
      ...(deliveryStatus ? { status: deliveryStatus as any } : {}),
      ...(type === "email.delivered" ? { /* optional */ } : {}),
    });

    if (providerId) {
      q = q.eq("message_id", providerId);
    } else if (toEmail) {
      // If you included campaign_id in provider metadata, match by that too.
      q = q.eq("email", toEmail);
    } else {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const { error } = await q;
    if (error) {
      console.error("webhook update error", error);
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("webhook exception", e);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
