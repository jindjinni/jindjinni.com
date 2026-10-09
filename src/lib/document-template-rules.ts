// How a company's Quotation and Purchase Order documents look, and the standing notice that rides on every one of them.
// Pure: no database, no clock (the caller passes today's day), so it is easy to test.

import type { DocType } from "@/lib/operation-type";

export const TEMPLATE_DEPARTMENTS = ["purchasing", "sales"] as const;
export type TemplateDepartment = (typeof TEMPLATE_DEPARTMENTS)[number];

export const isTemplateDepartment = (v: unknown): v is TemplateDepartment => v === "purchasing" || v === "sales";
export const isDocType = (v: unknown): v is DocType => v === "QUOTATION" || v === "PURCHASE_ORDER";

/** What the person can type, and how long each piece may be. */
export const TEMPLATE_LIMITS = { displayName: 80, title: 40, intro: 600, terms: 1500, footer: 300, notice: 400 } as const;

export type TemplateText = {
  displayName: string | null;
  showLogo: boolean;
  titleText: string | null;
  introText: string | null;
  termsText: string | null;
  footerText: string | null;
  noticeText: string | null;
  noticeEnabled: boolean;
  noticeUntil: string | null;
};

export const EMPTY_TEMPLATE: TemplateText = {
  displayName: null,
  showLogo: true,
  titleText: null,
  introText: null,
  termsText: null,
  footerText: null,
  noticeText: null,
  noticeEnabled: false,
  noticeUntil: null,
};

/** The word printed big at the top of the document when the company has not chosen its own. */
export const DEFAULT_TITLE: Record<DocType, string> = { QUOTATION: "QUOTATION", PURCHASE_ORDER: "PURCHASE ORDER" };

const clean = (v: unknown, max: number, keepLines: boolean) => {
  let s = String(v ?? "").replace(/\r/g, "");
  s = keepLines ? s.replace(/[\u0000-\u0009\u000b-\u001f\u007f<>]/g, " ") : s.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ");
  if (keepLines) s = s.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n");
  return s.trim().slice(0, max);
};

export const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

export type TemplateInput = {
  displayName?: unknown;
  showLogo?: unknown;
  titleText?: unknown;
  introText?: unknown;
  termsText?: unknown;
  footerText?: unknown;
  noticeText?: unknown;
  noticeEnabled?: unknown;
  noticeUntil?: unknown;
};

/** What was typed on the form, made safe, or the plain sentence to show when something is wrong. */
export function cleanTemplate(i: TemplateInput): { ok: true; value: TemplateText } | { ok: false; error: string } {
  const over = (v: unknown, max: number) => String(v ?? "").trim().length > max;
  if (over(i.displayName, TEMPLATE_LIMITS.displayName)) return { ok: false, error: `Keep the company name to ${TEMPLATE_LIMITS.displayName} characters or fewer.` };
  if (over(i.titleText, TEMPLATE_LIMITS.title)) return { ok: false, error: `Keep the title to ${TEMPLATE_LIMITS.title} characters or fewer.` };
  if (over(i.introText, TEMPLATE_LIMITS.intro)) return { ok: false, error: `Keep the opening wording to ${TEMPLATE_LIMITS.intro} characters or fewer.` };
  if (over(i.termsText, TEMPLATE_LIMITS.terms)) return { ok: false, error: `Keep the terms to ${TEMPLATE_LIMITS.terms} characters or fewer.` };
  if (over(i.footerText, TEMPLATE_LIMITS.footer)) return { ok: false, error: `Keep the footer to ${TEMPLATE_LIMITS.footer} characters or fewer.` };
  if (over(i.noticeText, TEMPLATE_LIMITS.notice)) return { ok: false, error: `Keep the notice to ${TEMPLATE_LIMITS.notice} characters or fewer.` };
  const until = String(i.noticeUntil ?? "").trim();
  if (until && !isDay(until)) return { ok: false, error: "The last day for the notice isn't a date I can read. Pick it from the calendar or leave it empty." };
  const notice = clean(i.noticeText, TEMPLATE_LIMITS.notice, true);
  const enabled = i.noticeEnabled === true || i.noticeEnabled === "on" || i.noticeEnabled === "true";
  if (enabled && !notice) return { ok: false, error: "Type the notice you want to show, or switch it off." };
  return {
    ok: true,
    value: {
      displayName: clean(i.displayName, TEMPLATE_LIMITS.displayName, false) || null,
      showLogo: !(i.showLogo === false || i.showLogo === "off" || i.showLogo === "false"),
      titleText: clean(i.titleText, TEMPLATE_LIMITS.title, false) || null,
      introText: clean(i.introText, TEMPLATE_LIMITS.intro, true) || null,
      termsText: clean(i.termsText, TEMPLATE_LIMITS.terms, true) || null,
      footerText: clean(i.footerText, TEMPLATE_LIMITS.footer, true) || null,
      noticeText: notice || null,
      noticeEnabled: enabled,
      noticeUntil: until || null,
    },
  };
}

/**
 * The standing notice that prints today, or null. It shows only while it is switched on, has words, and today is not past
 * the last day. "Today" is the company's own day (YYYY-MM-DD).
 */
export function activeNotice(t: Pick<TemplateText, "noticeText" | "noticeEnabled" | "noticeUntil"> | null | undefined, today: string): string | null {
  if (!t || !t.noticeEnabled) return null;
  const text = (t.noticeText ?? "").trim();
  if (!text) return null;
  if (t.noticeUntil && today > t.noticeUntil) return null;
  return text;
}

/** "PO-1005" or "PO-1005 Rev 2". Revision 0, null and nonsense show the plain number. */
export function numberWithRevision(number: string, revision: number | null | undefined): string {
  return revision && revision > 0 ? `${number} Rev ${Math.floor(revision)}` : number;
}

/** The next revision number for a document that is at `current` (null = the original). */
export const nextRevision = (current: number | null | undefined) => Math.max(0, Math.floor(current ?? 0)) + 1;

/** The note that must go with a revision: at least a few characters, at most 1000. */
export function cleanRevisionNote(v: unknown): { ok: true; note: string } | { ok: false; error: string } {
  const note = clean(v, 1000, true);
  if (note.length < 3) return { ok: false, error: "Tell them what changed or what is wrong, so the revision makes sense to them." };
  if (String(v ?? "").trim().length > 1000) return { ok: false, error: "Keep the revision note to 1,000 characters or fewer." };
  return { ok: true, note };
}
