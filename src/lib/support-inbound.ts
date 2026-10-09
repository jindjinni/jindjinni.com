// Reading mail that arrives at support@ (pure helpers; the route is src/app/api/support/inbound/route.ts).
// Two shapes are understood:
//   1. Simple:  { "from": "Name <a@b.com>", "subject": "...", "text": "...", "messageId": "..." }  (any mail forwarder or a script)
//   2. Resend:  { "type": "email.received", "data": { "email_id", "from", "subject", "message_id", ... } } -- Resend sends only the
//      details, so the body is fetched with its email_id (route does that).
// Authenticity: Resend signs its webhooks (Svix: svix-id / svix-timestamp / svix-signature, secret "whsec_..."); anything else
// uses a shared secret sent as x-support-secret or "Authorization: Bearer".

import { createHmac, timingSafeEqual } from "node:crypto";
import type { InboundMail } from "@/lib/support-service";

export const MAX_INBOUND_BYTES = 1_000_000;

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Svix signature check (what Resend uses). The secret looks like "whsec_<base64>". Refuses anything older than 5 minutes. */
export function verifySvix(secret: string, headers: { id: string | null; timestamp: string | null; signature: string | null }, rawBody: string, nowMs = Date.now()): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${rawBody}`).digest("base64");
  return headers.signature.split(" ").some((part) => {
    const [v, sig] = part.split(",");
    return v === "v1" && !!sig && safeEqual(sig, expected);
  });
}

/** Shared-secret check; the secret may come in a header, as a Bearer token or (last resort) in the web address. */
export function sharedSecretOk(secret: string, provided: { header: string | null; authorization: string | null; query: string | null }): boolean {
  if (!secret) return false;
  const candidates = [provided.header, provided.authorization?.replace(/^Bearer\s+/i, "") ?? null, provided.query];
  return candidates.some((c) => !!c && safeEqual(c, secret));
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** "Name <a@b.com>" -> { address, name } */
export function splitFrom(raw: string): { address: string; name: string | null } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(raw);
  if (m) return { address: m[2].trim(), name: m[1].trim() || null };
  return { address: raw.trim(), name: null };
}

export type Normalized =
  | { kind: "mail"; mail: InboundMail }
  | { kind: "fetch"; emailId: string; from: string; subject: string; messageId: string | null }
  | null;

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function normalizeInbound(payload: unknown): Normalized {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (p.type === "email.received" && p.data && typeof p.data === "object") {
    const d = p.data as Record<string, unknown>;
    const from = str(d.from);
    if (!from) return null;
    const text = str(d.text) || (str(d.html) ? htmlToText(str(d.html)) : "");
    const f = splitFrom(from);
    if (text) return { kind: "mail", mail: { from: f.address, fromName: f.name, subject: str(d.subject), text, messageId: str(d.message_id) || str(d.email_id) || null } };
    const emailId = str(d.email_id);
    return emailId ? { kind: "fetch", emailId, from, subject: str(d.subject), messageId: str(d.message_id) || emailId } : null;
  }
  const from = str(p.from);
  const text = str(p.text) || (str(p.html) ? htmlToText(str(p.html)) : "");
  if (!from || !text) return null;
  const f = splitFrom(from);
  return { kind: "mail", mail: { from: f.address, fromName: str(p.fromName) || f.name, subject: str(p.subject), text, messageId: str(p.messageId) || str(p.message_id) || null } };
}
