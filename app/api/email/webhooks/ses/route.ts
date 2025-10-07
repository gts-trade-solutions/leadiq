// app/api/email/webhooks/ses/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Optional: verify SNS signatures. If you want verification, install "sns-validator":
//   npm i sns-validator
// and uncomment the validator section below.
// import SNSValidator from "sns-validator";
// const validator = new SNSValidator();

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // ensure Node runtime (not edge)

type SnsEnvelope = {
  Type: "SubscriptionConfirmation" | "Notification" | "UnsubscribeConfirmation";
  MessageId: string;
  Token?: string;
  TopicArn: string;
  Subject?: string | null;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  UnsubscribeURL?: string;
  SubscribeURL?: string;
};

export async function POST(req: NextRequest) {
  const hdrType = req.headers.get("x-amz-sns-message-type") as SnsEnvelope["Type"] | null;

  const body = (await req.json()) as SnsEnvelope;

  // --- Signature verification (optional but recommended) ---
  // try {
  //   await new Promise<void>((resolve, reject) =>
  //     validator.validate(body as any, (err) => (err ? reject(err) : resolve()))
  //   );
  // } catch (e) {
  //   console.error("SNS signature verify failed", e);
  //   return NextResponse.json({ ok: false }, { status: 400 });
  // }

  if (hdrType === "SubscriptionConfirmation" && body.SubscribeURL) {
    // Confirm the subscription so SNS will start delivering events
    try {
      await fetch(body.SubscribeURL);
    } catch (e) {
      console.error("SNS subscribe confirm failed", e);
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    return NextResponse.json({ ok: true, subscribed: true });
  }

  if (hdrType === "Notification") {
    try {
      const msg = JSON.parse(body.Message);

      // SES can send either "notificationType" or "eventType" depending on channel
      const eventType: string =
        msg.notificationType || msg.eventType || msg.event?.eventType || "Unknown";

      // "mail" payload contains messageId and tags
      const mail = msg.mail || msg.mailObject || {};
      const messageId: string | undefined = mail.messageId;

      // Build DB patch
      const now = new Date().toISOString();
      const patch: Record<string, any> = { last_event_at: now };

      if (eventType === "Delivery") {
        patch.status = "delivered";
        // Optionally set sent_at if you want delivery time there:
        // patch.sent_at = now;
      } else if (eventType === "Bounce") {
        patch.status = "bounced";
        patch.bounced_at = now;
      } else if (eventType === "Complaint") {
        patch.status = "complained";
        patch.complaint_at = now;
      } else {
        // ignore other events or log them
      }

      let updated = false;

      if (messageId) {
        const { error } = await supabaseAdmin
          .from("campaign_recipients")
          .update(patch)
          .eq("message_id", messageId);

        if (!error) updated = true;
        else console.error("Update by message_id failed", error);
      }

      // Fallback using SES tags if you set them during send (EmailTags / X-SES-MESSAGE-TAGS)
      if (!updated) {
        const tags = normalizeTags(mail.tags);
        const campaignId = first(tags.campaign_id);
        const trackingToken = first(tags.tracking_token);

        if (campaignId && trackingToken) {
          const { error } = await supabaseAdmin
            .from("campaign_recipients")
            .update(patch)
            .eq("campaign_id", campaignId)
            .eq("tracking_token", trackingToken);

          if (error) console.error("Update by tags failed", error);
        }
      }

      return NextResponse.json({ ok: true });
    } catch (e) {
      console.error("SNS notification handling failed", e);
      return NextResponse.json({ ok: false }, { status: 400 });
    }
  }

  // UnsubscribeConfirmation or unknown types
  return NextResponse.json({ ok: true });
}

function first(x?: any): string | undefined {
  if (!x) return undefined;
  if (Array.isArray(x)) return x[0];
  return x;
}
function normalizeTags(tags: any) {
  // SES delivers tags as { key: [values] }
  return tags ?? {};
}
