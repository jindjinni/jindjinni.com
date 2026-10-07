// Marketing rules, pure (reads and writes nothing): addresses and phone numbers, who a campaign reaches, how a message
// is filled in and built, and the limits. The pages, the service and the tests all use this one place.

export type Channel = "EMAIL" | "TEXT";
export type Audience = "ALL" | "CUSTOMERS" | "UPLOADED";

export const AUDIENCE_LABELS: Record<Audience, string> = {
  ALL: "Everyone (customers and uploaded contacts)",
  CUSTOMERS: "Customers from quotations only",
  UPLOADED: "Uploaded and typed-in contacts only",
};
export const isAudience = (v: unknown): v is Audience => v === "ALL" || v === "CUSTOMERS" || v === "UPLOADED";

export const MAX_RECIPIENTS = 2000;
export const BATCH_SIZE = 25;
export const MAX_SUBJECT = 150;
export const MAX_EMAIL_BODY = 20000;
export const MAX_TEXT_BODY = 640;
export const MAX_DAILY_LIMIT = 2000;
export const DEFAULT_DAILY_LIMIT = 500;
export const STOP_LINE = "Reply STOP to opt out.";
export const MERGE_FIELDS = ["first_name", "last_name", "name", "company"] as const;

export const cleanText = (v: unknown, max: number): string => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
/** Lower-case address, or null when it isn't one. */
export function normEmail(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase();
  return s && s.length <= 254 && EMAIL_RE.test(s) ? s : null;
}

/** A US number as +1XXXXXXXXXX (10 digits, or 11 starting with 1), or an international +number of 8-15 digits; otherwise null. */
export function normPhone(v: unknown): string | null {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10 && !/^[01]/.test(digits)) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1") && !/^1[01]/.test(digits)) return `+${digits}`;
  return null;
}

/** "(334) 555-0100" for a US number, unchanged otherwise. */
export function fmtPhone(e164: string | null | undefined): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164 ?? "");
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164 ?? "";
}

export type Person = {
  key: string; // customer or contact id
  source: "CUSTOMER" | "CONTACT";
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company?: string | null;
};

export type Recipient = { source: Person["source"]; sourceId: string; firstName: string; lastName: string | null; to: string };

export type AudienceResult = {
  recipients: Recipient[];
  /** People in the chosen group with no usable address for this channel. */
  noAddress: number;
  /** People who asked not to be contacted by this channel. */
  optedOut: number;
  /** The same address appearing again (a customer who is also an uploaded contact); each address is sent once. */
  duplicates: number;
  /** More people than one campaign may reach; the list was cut at the limit. */
  cut: number;
};

/** Who a campaign reaches: the chosen group, one entry per address, minus the opted-out and the ones without an address. */
export function resolveAudience(channel: Channel, audience: Audience, people: Person[], optouts: Set<string>): AudienceResult {
  const out: AudienceResult = { recipients: [], noAddress: 0, optedOut: 0, duplicates: 0, cut: 0 };
  const seen = new Set<string>();
  for (const p of people) {
    if (audience === "CUSTOMERS" && p.source !== "CUSTOMER") continue;
    if (audience === "UPLOADED" && p.source !== "CONTACT") continue;
    const to = channel === "EMAIL" ? normEmail(p.email) : normPhone(p.phone);
    if (!to) {
      out.noAddress++;
      continue;
    }
    if (optouts.has(to)) {
      out.optedOut++;
      continue;
    }
    if (seen.has(to)) {
      out.duplicates++;
      continue;
    }
    seen.add(to);
    if (out.recipients.length >= MAX_RECIPIENTS) {
      out.cut++;
      continue;
    }
    out.recipients.push({ source: p.source, sourceId: p.key, firstName: p.firstName, lastName: p.lastName, to });
  }
  return out;
}

// ---- Filling in a message ----

export type MergeValues = { first_name: string; last_name: string; name: string; company: string };

export function mergeValues(p: { firstName?: string | null; lastName?: string | null }, company: string): MergeValues {
  const first = cleanText(p.firstName, 80);
  const last = cleanText(p.lastName, 80);
  return { first_name: first, last_name: last, name: [first, last].filter(Boolean).join(" "), company: cleanText(company, 120) };
}

/** Replaces {first_name} {last_name} {name} {company}. A blank value leaves nothing behind (and tidies the space before a comma). */
export function fillMerge(template: string, v: MergeValues): string {
  return template
    .replace(/\{\s*(first_name|last_name|name|company)\s*\}/gi, (_m, k: string) => v[k.toLowerCase() as keyof MergeValues] ?? "")
    .replace(/[ \t]+,/g, ",")
    .replace(/[ \t]{2,}/g, " ");
}

/** Fields written in braces that we don't know, so a typo like {firstname} is caught before sending. */
export function unknownFields(template: string): string[] {
  const out = new Set<string>();
  for (const m of template.matchAll(/\{\s*([^{}\s]+)\s*\}/g)) if (!(MERGE_FIELDS as readonly string[]).includes(m[1].toLowerCase())) out.add(m[1]);
  return [...out];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Plain words to a simple email: blank lines become paragraphs, single line breaks stay, web addresses become links. Everything else is escaped. */
export function bodyToHtml(body: string): string {
  const link = (t: string) =>
    esc(t).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, (u) => `<a href="${u}" style="color:#1a56db">${u}</a>`);
  return body
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 14px 0">${para.split("\n").map(link).join("<br>")}</p>`)
    .join("");
}

export type EmailSettings = { senderName: string | null; businessAddress: string | null; footerText: string | null };

export type BuiltEmail = { subject: string; text: string; html: string };

/** One recipient's email: their name filled in, then a footer with who sent it, the mailing address and the unsubscribe link. */
export function buildEmail(args: { subject: string; body: string; person: { firstName?: string | null; lastName?: string | null }; company: string; settings: EmailSettings; unsubscribeUrl: string }): BuiltEmail {
  const v = mergeValues(args.person, args.company);
  const subject = fillMerge(args.subject, v).replace(/[\r\n]+/g, " ").trim();
  const body = fillMerge(args.body, v);
  const footerLines = [cleanText(args.settings.footerText, 300), cleanText(args.settings.senderName || args.company, 120), String(args.settings.businessAddress ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(", ")].filter(Boolean);
  const text = `${body.trim()}\n\n--\n${footerLines.join("\n")}\nTo stop getting these emails, unsubscribe here: ${args.unsubscribeUrl}\n`;
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1a1d21">${bodyToHtml(body)}` +
    `<hr style="border:none;border-top:1px solid #e3e6ea;margin:22px 0 12px 0">` +
    `<p style="margin:0;font-size:12px;color:#6b7280">${footerLines.map(esc).join("<br>")}<br>` +
    `<a href="${esc(args.unsubscribeUrl)}" style="color:#6b7280">Unsubscribe</a> from these emails.</p></div>`;
  return { subject, text, html };
}

// ---- Text messages ----

const GSM_BASIC = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;

/** How many text segments a message takes: 160 characters (153 when split) for plain text, 70 (67) when it has emoji or other symbols. */
export function smsInfo(text: string): { chars: number; segments: number; unicode: boolean } {
  const chars = [...text].length;
  const unicode = !GSM_BASIC.test(text);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  const segments = chars === 0 ? 0 : chars <= single ? 1 : Math.ceil(chars / multi);
  return { chars, segments, unicode };
}

/** The text exactly as it would go out: name filled in and the opt-out line added when the message doesn't already say STOP. */
export function buildText(body: string, person: { firstName?: string | null; lastName?: string | null }, company: string, optOutLine: string): string {
  const v = mergeValues(person, company);
  const t = fillMerge(body, v).trim();
  const line = cleanText(optOutLine, 120) || STOP_LINE;
  return /\bSTOP\b/i.test(t) ? t : `${t}\n${line}`;
}

// ---- Why a campaign can't be sent yet (plain words), or null ----

export function emailProblem(c: { subject: string | null; body: string }, s: { businessAddress: string | null } | null, recipients: number, sentLast24h: number, dailyLimit: number): string | null {
  if (!cleanText(c.subject, MAX_SUBJECT)) return "Add a subject line.";
  if (!c.body.trim()) return "Write the message.";
  if (!cleanText(s?.businessAddress, 300)) return "Add your business mailing address in Email Settings first. Email law requires it on every marketing email.";
  const bad = unknownFields(`${c.subject ?? ""} ${c.body}`);
  if (bad.length) return `{${bad[0]}} isn't a field we know. Use {first_name}, {last_name}, {name} or {company}.`;
  if (recipients === 0) return "No one would receive this: pick a group that has email addresses.";
  if (sentLast24h + recipients > dailyLimit) return `That would pass your limit of ${dailyLimit} emails a day (${sentLast24h} already sent in the last 24 hours). Choose a smaller group or raise the limit in Email Settings.`;
  return null;
}

// ---- Reading an uploaded sheet ----

export type SheetContact = { firstName: string; lastName: string | null; email: string | null; phone: string | null; company: string | null };
export type SheetRead = { contacts: SheetContact[]; skipped: number; badEmail: number; badPhone: number; duplicate: number };

const HEAD = {
  first: ["first name", "firstname", "first", "given name", "name"],
  last: ["last name", "lastname", "last", "surname", "family name"],
  full: ["full name", "customer", "contact", "contact name", "name"],
  email: ["email", "e-mail", "email address", "e mail"],
  phone: ["phone", "phone number", "mobile", "cell", "cell phone", "telephone", "tel"],
  company: ["company", "company name", "business", "organization"],
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
function col(headers: string[], names: string[]): string | null {
  for (const h of headers) if (names.includes(norm(h))) return h;
  return null;
}

/** Turns a parsed spreadsheet into contacts. Rows with neither a usable email nor a phone are skipped; bad values are dropped, not guessed. */
export function contactsFromSheet(headers: string[], rows: Record<string, string>[]): SheetRead {
  const first = col(headers, HEAD.first.filter((n) => n !== "name")) ?? null;
  const last = col(headers, HEAD.last);
  const full = col(headers, HEAD.full);
  const email = col(headers, HEAD.email);
  const phone = col(headers, HEAD.phone);
  const company = col(headers, HEAD.company);
  const out: SheetRead = { contacts: [], skipped: 0, badEmail: 0, badPhone: 0, duplicate: 0 };
  const seen = new Set<string>();
  for (const r of rows) {
    const e = email ? normEmail(r[email]) : null;
    const p = phone ? normPhone(r[phone]) : null;
    if (email && cleanText(r[email], 300) && !e) out.badEmail++;
    if (phone && cleanText(r[phone], 60) && !p) out.badPhone++;
    if (!e && !p) {
      out.skipped++;
      continue;
    }
    const key = e ? `e:${e}` : `p:${p}`;
    if (seen.has(key)) {
      out.duplicate++;
      continue;
    }
    seen.add(key);
    let fn = first ? cleanText(r[first], 80) : "";
    let ln = last ? cleanText(r[last], 80) : "";
    if (!fn && full) {
      const parts = cleanText(r[full], 160).split(" ");
      fn = parts[0] ?? "";
      ln = ln || parts.slice(1).join(" ");
    }
    out.contacts.push({ firstName: fn || (e ? e.split("@")[0] : fmtPhone(p)), lastName: ln || null, email: e, phone: p, company: company ? cleanText(r[company], 120) || null : null });
  }
  return out;
}
