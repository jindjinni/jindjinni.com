import { Resend } from "resend";

/**
 * Thin wrapper around Resend so every email the app sends goes through one
 * place. Three states, in order of preference:
 *
 * 1. RESEND_API_KEY is set -> actually send, via Resend's API.
 * 2. No key, and not running on Vercel -> log the email to the server
 *    console instead of sending, so signup/verification can be exercised
 *    end-to-end on a local machine (or during a Playwright run against
 *    `next start`) without a real Resend account. Checking `VERCEL` rather
 *    than NODE_ENV matters here: `next start` always sets
 *    NODE_ENV=production even on a laptop, so NODE_ENV can't tell "real
 *    production" apart from "local smoke test" -- Vercel's own VERCEL env
 *    var can.
 * 3. No key, actually on Vercel -> fail closed with a clear error. A
 *    missing key in real production must never silently "succeed" without
 *    reaching an inbox -- that would defeat the entire point of
 *    verification.
 *
 * RESEND_FROM_EMAIL lets a verified sending domain replace Resend's shared
 * onboarding@resend.dev test address once one is set up (see chat).
 */

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Jindjinni <onboarding@resend.dev>";

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    if (process.env.VERCEL) {
      console.error("[email] RESEND_API_KEY is not set -- cannot send:", subject, "to", to);
      return { ok: false, error: "Email sending isn't configured yet. Please contact support." };
    }
    console.log(`[email:dev] To: ${to}\nSubject: ${subject}\n${text}`);
    return { ok: true };
  }

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({ from: FROM_EMAIL, to, subject, html, text });
    if (result.error) {
      console.error("[email] Resend error:", result.error);
      return { ok: false, error: "Couldn't send that email right now. Please try again." };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email] Unexpected error sending email:", err);
    return { ok: false, error: "Couldn't send that email right now. Please try again." };
  }
}

export type EmailAttachment = { filename: string; content: Buffer };

/** "Name <a@b.com>" or "a@b.com" -> "a@b.com" */
function addressOf(from: string): string {
  const m = /<([^>]+)>/.exec(from);
  return (m ? m[1] : from).trim();
}

/**
 * Customer-facing email from a company: its own display name, optional reply-to,
 * a hidden copy (BCC) to the team, and attachments (payment confirmation, revised
 * invoice, photos). The sending address still comes from RESEND_FROM_EMAIL so it
 * only ever goes out from a verified domain.
 */
export async function sendCustomerEmail(args: {
  to: string;
  subject: string;
  text: string;
  html: string;
  fromName?: string | null;
  replyTo?: string | null;
  bcc?: string[];
  attachments?: EmailAttachment[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromName = (args.fromName ?? "").replace(/[<>"\r\n]/g, "").trim();
  const from = fromName ? `${fromName} <${addressOf(FROM_EMAIL)}>` : FROM_EMAIL;

  if (!apiKey) {
    if (process.env.VERCEL) {
      console.error("[email] RESEND_API_KEY is not set -- cannot send:", args.subject);
      return { ok: false, error: "Email sending isn't configured yet. Please contact support." };
    }
    console.log(`[email:dev] From: ${from}\nTo: ${args.to}\nBcc: ${(args.bcc ?? []).join(", ")}\nSubject: ${args.subject}\nAttachments: ${(args.attachments ?? []).map((a) => a.filename).join(", ")}\n${args.text}`);
    return { ok: true };
  }
  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      ...(args.replyTo ? { replyTo: args.replyTo } : {}),
      ...(args.bcc && args.bcc.length ? { bcc: args.bcc } : {}),
      ...(args.attachments && args.attachments.length ? { attachments: args.attachments } : {}),
    });
    if (result.error) {
      console.error("[email] Resend error:", result.error);
      return { ok: false, error: "The email service refused that message. Check the sending domain is verified and the customer's address is valid." };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email] Unexpected error sending email:", err);
    return { ok: false, error: "Couldn't send that email right now. Please try again." };
  }
}
