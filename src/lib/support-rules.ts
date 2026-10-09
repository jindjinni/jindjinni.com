// Plain rules for the support center (no database here, so they are easy to test).

export const TICKET_STATUSES = ["open", "waiting", "solved"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const STATUS_LABELS: Record<TicketStatus, string> = { open: "Needs us", waiting: "Waiting on company", solved: "Solved" };
export const isStatus = (v: unknown): v is TicketStatus => typeof v === "string" && (TICKET_STATUSES as readonly string[]).includes(v);

export const PRIORITIES = ["normal", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CATEGORIES = [
  "Question: how do I...",
  "Something is broken",
  "Billing and plan",
  "My account and sign-in",
  "Feature idea",
  "Other",
] as const;
export const isCategory = (v: unknown): v is (typeof CATEGORIES)[number] => typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);

export const SUBJECT_MIN = 3;
export const SUBJECT_MAX = 150;
export const BODY_MAX = 5000;
export const EMAIL_BODY_MAX = 10_000;

/** "#1042" */
export const ticketLabel = (no: number) => `#${no}`;

/** "[#1042] Subject" -- what goes in the subject line of emails, so a reply finds its way back to the ticket. */
export const emailSubject = (no: number, subject: string) => `[#${no}] ${subject}`;

/** The ticket number named in an email subject like "Re: [#1042] Printer", or null. */
export function ticketNoFromSubject(subject: string): number | null {
  const m = /\[#(\d{1,9})\]/.exec(subject) ?? /(?:^|\s)#(\d{3,9})(?:\s|$)/.exec(subject);
  return m ? Number(m[1]) : null;
}

/** A subject cleaned for saving: no Re:/Fwd: prefixes or ticket tags, one line, trimmed. */
export function cleanSubject(raw: string): string {
  let s = String(raw ?? "").replace(/[\r\n\t]+/g, " ");
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(/^\s*(re|fwd?|aw)\s*:\s*/i, "").replace(/\[#\d{1,9}\]\s*/g, "");
  }
  return s.replace(/\s+/g, " ").trim().slice(0, SUBJECT_MAX);
}

/** Why a new ticket can't be sent yet, or null when it is fine. */
export function ticketProblem(subject: string, body: string): string | null {
  const s = cleanSubject(subject);
  if (s.length < SUBJECT_MIN) return "Give your question a short title (at least a few letters).";
  if (String(subject ?? "").trim().length > SUBJECT_MAX) return `Keep the title under ${SUBJECT_MAX} letters.`;
  const b = String(body ?? "").trim();
  if (!b) return "Tell us what you need help with.";
  if (b.length > BODY_MAX) return `That message is too long (the limit is ${BODY_MAX.toLocaleString("en-US")} letters). Please shorten it.`;
  return null;
}

/** Trims the quoted earlier messages and signatures off an emailed reply, keeping what the person just wrote. */
export function stripQuotedReply(text: string): string {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*>/.test(line)) break;
    if (/^\s*-{2,}\s*original message\s*-{2,}/i.test(line)) break;
    if (/^\s*on .{5,200}wrote:\s*$/i.test(line)) break;
    if (/^\s*on .{5,120}$/i.test(line) && /wrote:\s*$/i.test(lines[i + 1] ?? "")) break;
    if (/^\s*from:\s.+/i.test(line) && /^\s*(sent|date):/i.test(lines[i + 1] ?? "")) break;
    if (/^--\s?$/.test(line)) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

// ---- "View as company" -----------------------------------------------------------------------------------------------
/** How long one look at a company's account lasts. */
export const VIEW_MINUTES = 30;
/** How long a company's OK lasts: the choices on the ticket. */
export const CONSENT_CHOICES: { days: number; label: string }[] = [
  { days: 1, label: "1 day" },
  { days: 3, label: "3 days" },
  { days: 7, label: "7 days" },
];
export const isConsentDays = (n: number) => CONSENT_CHOICES.some((c) => c.days === n);

/** Is the company's OK still good at this moment? */
export function consentActive(consentUntil: string | null | undefined, nowMs: number): boolean {
  if (!consentUntil) return false;
  const t = Date.parse(consentUntil);
  return Number.isFinite(t) && t > nowMs;
}

export function minutesLeft(expiresAt: string, nowMs: number): number {
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t) || t <= nowMs) return 0;
  return Math.ceil((t - nowMs) / 60000);
}

/** Short "Oct 8, 2026, 3:15 PM" in US Eastern for the support screens. */
export function whenText(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso.replace(" ", "T") + "Z");
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** consentActive() for right now (a helper so pages don't read the clock themselves). */
export const consentActiveNow = (consentUntil: string | null | undefined) => consentActive(consentUntil, Date.now());
