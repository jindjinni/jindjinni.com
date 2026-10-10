// Department mailboxes: the plain rules (pure: no database, no clock unless one is passed in). Which departments have a mailbox, how a
// compose form is checked, how a "send later" date and time in a person's own time zone becomes the exact moment to send, and how
// long to keep trying. The services and pages only call these.

import { oneLine } from "@/lib/gmail-mime";
import { parseAddresses } from "@/lib/audit-email";

export const MAIL_DEPTS = ["purchasing", "sales", "receiving", "accounts", "customer-service"] as const;
export type MailDept = (typeof MAIL_DEPTS)[number];
export const isMailDept = (v: unknown): v is MailDept => typeof v === "string" && (MAIL_DEPTS as readonly string[]).includes(v);

export const DEPT_LABEL: Record<MailDept, string> = {
  purchasing: "Purchasing",
  sales: "Sales",
  receiving: "Receiving",
  accounts: "Accounts",
  "customer-service": "Customer Service",
};

/** What each department's mailbox is for, in a line (shown when it is first set up). */
export const DEPT_MAIL_BLURB: Record<MailDept, string> = {
  purchasing: "Mail with suppliers: purchase orders, quotes and questions about orders.",
  sales: "Mail with the pharmacies and buyers you sell to: quotations, invoices and questions.",
  receiving: "Mail about deliveries: carriers, suppliers and anything that arrives at the dock.",
  accounts: "Mail about money: payment notices, receipts and statements. Works hand in hand with Customer Service.",
  "customer-service": "Mail with customers: telling them they have been paid and answering their questions.",
};

export const mailPath = (dept: MailDept) => `/dashboard/${dept}/mail`;

export type MailKind = "SHARED" | "PERSONAL";
export type MailboxStatus = "NOT_CONNECTED" | "ACTIVE" | "NEEDS_RECONNECT";
export const STATUS_LABEL: Record<MailboxStatus, string> = { NOT_CONNECTED: "Not connected yet", ACTIVE: "Connected", NEEDS_RECONNECT: "Needs to be reconnected" };

export const FOLDERS = ["inbox", "sent", "drafts", "scheduled"] as const;
export type Folder = (typeof FOLDERS)[number];
export const FOLDER_LABEL: Record<Folder, string> = { inbox: "Inbox", sent: "Sent", drafts: "Drafts", scheduled: "Scheduled" };
export const isFolder = (v: unknown): v is Folder => typeof v === "string" && (FOLDERS as readonly string[]).includes(v);

export type OutboxStatus = "DRAFT" | "SCHEDULED" | "SENDING" | "SENT" | "FAILED" | "CANCELLED";

// ---------------------------------------------------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------------------------------------------------

export const MAX_MAILBOX_NAME = 60;
export function cleanMailboxName(v: unknown): string {
  return String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_MAILBOX_NAME);
}

// ---------------------------------------------------------------------------------------------------------------------
// Composing
// ---------------------------------------------------------------------------------------------------------------------

export const MAX_RECIPIENTS_PER_FIELD = 20;
export const MAX_RECIPIENTS_TOTAL = 40;
export const MAX_SUBJECT = 200;
export const MAX_BODY = 50_000;
export const MAX_FILES = 8;
/** All files on one email together. Kept under the 10 MB the app accepts in one request. */
export const MAX_MAIL_BYTES = 8 * 1024 * 1024;
const BLOCKED_EXT = new Set(["exe", "bat", "cmd", "com", "scr", "pif", "vbs", "vbe", "js", "jse", "wsf", "wsh", "msi", "msp", "jar", "ps1", "lnk", "hta", "cpl", "reg", "dll"]);

/** A file name that is safe to keep and to put in a header. */
export function safeFileName(name: string): string {
  const n = oneLine(String(name ?? "")).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "").slice(0, 120);
  return n || "attachment";
}

export const blockedFile = (name: string) => BLOCKED_EXT.has(safeFileName(name).toLowerCase().split(".").pop() ?? "");

export type ComposeInput = { to: string; cc?: string; bcc?: string; subject: string; body: string };
export type ComposeCheck = { ok: boolean; errors: string[]; to: string[]; cc: string[]; bcc: string[]; subject: string };

const nice = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

/** Checks what was typed before an email is sent. Saving a draft does not need this (a draft can be half done). */
export function checkCompose(i: ComposeInput, files: { name: string; bytes: number }[] = []): ComposeCheck {
  const errors: string[] = [];
  const field = (label: string, raw: string | undefined, required: boolean) => {
    const p = parseAddresses(raw, MAX_RECIPIENTS_PER_FIELD);
    if (required && p.list.length === 0 && p.bad.length === 0) errors.push(`Enter who it goes to.`);
    if (p.bad.length) errors.push(`${label}: "${p.bad[0]}" isn't an email address.`);
    if (p.tooMany) errors.push(`${label}: at most ${MAX_RECIPIENTS_PER_FIELD} addresses.`);
    return p.list;
  };
  const to = field("To", i.to, true);
  const cc = field("Cc", i.cc, false);
  const bcc = field("Bcc", i.bcc, false);
  if (to.length + cc.length + bcc.length > MAX_RECIPIENTS_TOTAL) errors.push(`At most ${MAX_RECIPIENTS_TOTAL} people on one email.`);
  const subject = oneLine(i.subject ?? "");
  if (!subject) errors.push("Add a subject.");
  if (subject.length > MAX_SUBJECT) errors.push(`The subject is too long (at most ${MAX_SUBJECT} characters).`);
  const body = String(i.body ?? "");
  if (!body.trim() && files.length === 0) errors.push("Write a message or attach a file.");
  if (body.length > MAX_BODY) errors.push("The message is too long.");
  if (files.length > MAX_FILES) errors.push(`At most ${MAX_FILES} files on one email.`);
  const bad = files.find((f) => blockedFile(f.name));
  if (bad) errors.push(`"${safeFileName(bad.name)}" is a kind of file that mail providers block. Send it another way.`);
  const total = files.reduce((n, f) => n + f.bytes, 0);
  if (total > MAX_MAIL_BYTES) errors.push(`The files add up to ${nice(total)}; the limit is ${nice(MAX_MAIL_BYTES)}.`);
  if (files.some((f) => f.bytes === 0)) errors.push("One of the files is empty.");
  return { ok: errors.length === 0, errors, to, cc, bcc, subject };
}

/** A short line of the message for lists. */
export function snippetOf(text: string | null | undefined, max = 140): string {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

// ---------------------------------------------------------------------------------------------------------------------
// Send later
// ---------------------------------------------------------------------------------------------------------------------

export const MIN_LEAD_MS = 2 * 60 * 1000;
export const MAX_LEAD_DAYS = 366;
export const DEFAULT_ZONE = "America/New_York";

/** The zone name when it is a real time zone, else null. */
export function validZone(z: string | null | undefined): string | null {
  const s = String(z ?? "").trim();
  if (!s || s.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: s });
    return s;
  } catch {
    return null;
  }
}

function zoneOffsetMs(utcMs: number, zone: string): number {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(utcMs))) p[x.type] = x.value;
  const asIfUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asIfUtc - Math.floor(utcMs / 1000) * 1000;
}

/** "2026-10-12" + "09:30" as the clock reads in `zone` -> the exact moment (ISO, UTC), or null when the date or time isn't real. */
export function zonedToUtc(date: string, time: string, zone: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const t = /^(\d{2}):(\d{2})$/.exec(time.trim());
  const z = validZone(zone);
  if (!d || !t || !z) return null;
  const [y, mo, da, h, mi] = [+d[1], +d[2], +d[3], +t[1], +t[2]];
  const probe = new Date(Date.UTC(y, mo - 1, da, h, mi));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== da || h > 23 || mi > 59) return null;
  const guess = probe.getTime();
  let utc = guess - zoneOffsetMs(guess, z);
  utc = guess - zoneOffsetMs(utc, z); // a second pass settles the days the clocks change
  return new Date(utc).toISOString();
}

export type ScheduleCheck = { ok: true; iso: string; zone: string } | { ok: false; error: string };

/** The "send later" choice: a real future moment, not too soon and not more than a year away. */
export function checkSchedule(date: string, time: string, zone: string, nowMs: number): ScheduleCheck {
  const z = validZone(zone) ?? DEFAULT_ZONE;
  if (!date.trim() || !time.trim()) return { ok: false, error: "Pick the day and the time to send it." };
  const iso = zonedToUtc(date, time, z);
  if (!iso) return { ok: false, error: "That date or time isn't valid." };
  const at = Date.parse(iso);
  if (at < nowMs + MIN_LEAD_MS) return { ok: false, error: "Pick a time at least two minutes from now." };
  if (at > nowMs + MAX_LEAD_DAYS * 86_400_000) return { ok: false, error: "Scheduled emails can be at most a year ahead." };
  return { ok: true, iso, zone: z };
}

/** The clock's day ("YYYY-MM-DD") and time ("HH:MM") of a moment in a zone: how a scheduled email is shown again for editing. */
export function partsInZone(iso: string | null | undefined, zone: string | null | undefined): { date: string; time: string } | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const z = validZone(zone) ?? DEFAULT_ZONE;
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("en-US", { timeZone: z, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(t))) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** "Mon, Oct 12, 9:30 AM EDT" for a moment, in a zone. */
export function formatInZone(iso: string | null | undefined, zone: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(t)) return "";
  const z = validZone(zone) ?? DEFAULT_ZONE;
  return new Intl.DateTimeFormat("en-US", { timeZone: z, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(t));
}

/** A date for a list: time today, else the day. */
export function shortWhen(iso: string | null | undefined, zone: string | null | undefined, nowMs = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(t)) return "";
  const z = validZone(zone) ?? DEFAULT_ZONE;
  const day = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: z, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  if (day(t) === day(nowMs)) return new Intl.DateTimeFormat("en-US", { timeZone: z, hour: "numeric", minute: "2-digit" }).format(new Date(t));
  const sameYear = day(t).slice(0, 4) === day(nowMs).slice(0, 4);
  return new Intl.DateTimeFormat("en-US", { timeZone: z, month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(new Date(t));
}

// ---------------------------------------------------------------------------------------------------------------------
// Sending later: what the background check does
// ---------------------------------------------------------------------------------------------------------------------

/** A scheduled email that fails is tried again this many times (a few minutes apart) before it is shown as failed. */
export const MAX_ATTEMPTS = 3;
export const RETRY_AFTER_MS = 5 * 60 * 1000;
/** A message stuck "sending" this long was interrupted; it is shown as failed so nobody sends it twice by accident. */
export const STUCK_AFTER_MS = 15 * 60 * 1000;

/** What to do with a scheduled email whose send just failed. */
export function afterFailure(attempts: number, nowMs: number): { status: "SCHEDULED" | "FAILED"; retryAt: string | null } {
  if (attempts >= MAX_ATTEMPTS) return { status: "FAILED", retryAt: null };
  return { status: "SCHEDULED", retryAt: new Date(nowMs + RETRY_AFTER_MS).toISOString() };
}

/** The sender line people see: the name (or the mailbox's name) and the address. */
export function fromLine(name: string | null | undefined, address: string | null | undefined): string {
  const n = oneLine(name ?? "");
  return n && address ? `${n} <${address}>` : address || n;
}
