type SendArgs = {
  to: string;
  subject: string;
  html: string;
  fromEmail: string;
  fromName?: string;
};

export type Provider = "ses" | "resend";

export async function sendEmail(args: SendArgs): Promise<{ id: string | null }> {
  const provider = (process.env.EMAIL_PROVIDER || "ses") as Provider;
  if (provider === "resend") return sendWithResend(args);
  return sendWithSES(args); // default
}

// ---------- AWS SES v2 ----------
async function sendWithSES({ to, subject, html, fromEmail, fromName }: SendArgs) {
  const { SESv2Client, SendEmailCommand } = await import("@aws-sdk/client-sesv2");
  const ses = new SESv2Client({ region: process.env.AWS_REGION });
  const resp = await ses.send(new SendEmailCommand({
    FromEmailAddress: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
    Destination: { ToAddresses: [to] },
    Content: { Simple: { Subject: { Data: subject }, Body: { Html: { Data: html } } } },
    ConfigurationSetName: process.env.SES_CONFIG_SET || undefined,
    // Optional: if you want SES tags too
    // EmailTags: [{ Name: "app", Value: "campaign" }],
  }));
  return { id: resp.MessageId ?? null };
}

// ---------- Resend ----------
async function sendWithResend({ to, subject, html, fromEmail, fromName }: SendArgs) {
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const resp = await resend.emails.send({
    from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
    to, subject, html,
  });
  return { id: (resp as any)?.id ?? null };
}
