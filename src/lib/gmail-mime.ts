// Builds the raw email message Gmail's "send" call takes (RFC 2822 / MIME). Pure and tested: header values can't
// carry line breaks (no header injection), non-English names and subjects are encoded, attachments are named safely.

import { randomBytes } from "node:crypto";

export type MimeAttachment = { filename: string; content: Buffer };
export type MimeInput = {
  from: { name?: string | null; address: string };
  to: string;
  bcc?: string[];
  replyTo?: string | null;
  subject: string;
  text: string;
  html: string;
  attachments?: MimeAttachment[];
  date?: Date;
  messageIdDomain?: string;
};

/** A header value on one line, with nothing that could start another header. */
export const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
const isAscii = (s: string) => /^[\x20-\x7e]*$/.test(s);
const word = (s: string) => `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;

/** A subject or display name, encoded when it has non-English characters. Long encoded text is split into several words. */
export function encodeText(raw: string): string {
  const s = oneLine(raw);
  if (isAscii(s)) return s;
  const parts: string[] = [];
  let cur = "";
  for (const ch of s) {
    if (Buffer.byteLength(cur + ch, "utf8") > 36) { parts.push(cur); cur = ""; }
    cur += ch;
  }
  if (cur) parts.push(cur);
  return parts.map(word).join("\r\n ");
}

function address(name: string | null | undefined, addr: string): string {
  const a = oneLine(addr).replace(/[<>"]/g, "");
  const n = oneLine(name ?? "");
  if (!n) return a;
  return isAscii(n) ? `"${n.replace(/["\\]/g, "")}" <${a}>` : `${encodeText(n)} <${a}>`;
}

const wrap76 = (b64: string) => b64.replace(/(.{76})/g, "$1\r\n");
const b64 = (b: Buffer | string) => wrap76(Buffer.from(b).toString("base64"));

function typeFor(filename: string): string {
  const e = filename.toLowerCase().split(".").pop();
  return ({ pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", txt: "text/plain", csv: "text/csv" } as Record<string, string>)[e ?? ""] ?? "application/octet-stream";
}

/** The complete message, ready to be base64url-encoded for Gmail. */
export function buildMime(i: MimeInput): string {
  const mixed = "mix_" + randomBytes(12).toString("hex");
  const alt = "alt_" + randomBytes(12).toString("hex");
  const domain = (i.from.address.split("@")[1] || "mail.local").replace(/[^a-z0-9.-]/gi, "");
  const h: string[] = [
    `From: ${address(i.from.name, i.from.address)}`,
    `To: ${address(null, i.to)}`,
  ];
  const bcc = (i.bcc ?? []).filter(Boolean).map((b) => address(null, b));
  if (bcc.length) h.push(`Bcc: ${bcc.join(", ")}`);
  if (i.replyTo) h.push(`Reply-To: ${address(null, i.replyTo)}`);
  h.push(
    `Subject: ${encodeText(i.subject)}`,
    `Date: ${(i.date ?? new Date()).toUTCString()}`,
    `Message-ID: <${randomBytes(12).toString("hex")}@${i.messageIdDomain ?? domain}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
  );
  const body: string[] = [
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    `--${alt}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64(i.text),
    `--${alt}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64(i.html),
    `--${alt}--`,
  ];
  for (const a of i.attachments ?? []) {
    const clean = oneLine(a.filename).replace(/["\\/]/g, "_") || "attachment";
    const ascii = clean.replace(/[^\x20-\x7e]/g, "_");
    body.push(
      `--${mixed}`,
      `Content-Type: ${typeFor(clean)}; name="${ascii}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`,
      "",
      b64(a.content),
    );
  }
  body.push(`--${mixed}--`, "");
  return h.join("\r\n") + "\r\n\r\n" + body.join("\r\n");
}

/** What Gmail's send call wants: the message as URL-safe base64. */
export const toRaw = (mime: string) => Buffer.from(mime, "utf8").toString("base64url");
