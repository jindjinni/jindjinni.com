// Audit Center phase 3, the pure rules (no database): deadline reminders, the dashboard's numbers and the auditor directory's checks.
// Everything here is plain calculation so the screens and the tests agree. Reminders are shown inside the app only; nothing is emailed.

import { isDay, type ColumnKey, type ReportRow } from "@/lib/audit-rules";

// ---- deadlines ---------------------------------------------------------------------------------------------------------

/** A due date this many days away or closer counts as "due soon". */
export const SOON_DAYS = 7;

/** Statuses where the answer has gone out or the case is finished: the deadline no longer needs a reminder. */
const ANSWERED = new Set(["SENT", "COMPLETE", "CANCELLED"]);

export type DueKind = "OVERDUE" | "TODAY" | "SOON" | "LATER" | "NONE" | "DONE";
export type DueInfo = { kind: DueKind; days: number | null; label: string };

const MS_DAY = 86400000;
const dayNumber = (d: string) => Math.round(Date.parse(d + "T00:00:00Z") / MS_DAY);

/** Whole days from `today` to `due` (negative = already past). */
export const daysBetween = (today: string, due: string) => dayNumber(due) - dayNumber(today);

export function addDaysYmd(day: string, n: number): string {
  return new Date(Date.parse(day + "T00:00:00Z") + n * MS_DAY).toISOString().slice(0, 10);
}

/** Where a case stands against its due date, with the words the screens show. */
export function dueInfo(dueOn: string | null | undefined, status: string, today: string): DueInfo {
  if (ANSWERED.has(status)) return { kind: "DONE", days: null, label: "" };
  if (!dueOn || !isDay(dueOn)) return { kind: "NONE", days: null, label: "No due date" };
  const d = daysBetween(today, dueOn);
  if (d < 0) return { kind: "OVERDUE", days: d, label: `Overdue by ${-d} ${-d === 1 ? "day" : "days"}` };
  if (d === 0) return { kind: "TODAY", days: 0, label: "Due today" };
  if (d === 1) return { kind: "SOON", days: 1, label: "Due tomorrow" };
  if (d <= SOON_DAYS) return { kind: "SOON", days: d, label: `Due in ${d} days` };
  return { kind: "LATER", days: d, label: `Due in ${d} days` };
}

export type DueCase = { id: string; status: string; dueOn: string | null };

/** Cases that need attention now, most urgent first: overdue (oldest first), due today, then due soon. */
export function reminders<T extends DueCase>(cases: T[], today: string): { overdue: T[]; today: T[]; soon: T[]; count: number } {
  const by = (kind: DueKind) => cases.filter((c) => dueInfo(c.dueOn, c.status, today).kind === kind).sort((a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? ""));
  const overdue = by("OVERDUE");
  const dueToday = by("TODAY");
  const soon = by("SOON");
  return { overdue, today: dueToday, soon, count: overdue.length + dueToday.length + soon.length };
}

// ---- dashboard ---------------------------------------------------------------------------------------------------------

/** The last `n` calendar months ending with the month of `today`, oldest first ("2026-10"). */
export function lastMonths(today: string, n: number): string[] {
  let y = Number(today.slice(0, 4));
  let m = Number(today.slice(5, 7));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}

export const monthLabel = (ym: string) => new Date(Date.parse(ym + "-01T00:00:00Z")).toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });

export type MonthRow = { month: string; INTERNAL: number; PBM: number; REGULATORY: number; total: number };

/** Cases started per month, split by type, for the given months (cases outside them are not counted). */
export function casesByMonth(cases: { auditType: string; createdAt: string }[], months: string[]): MonthRow[] {
  const rows = new Map(months.map((m) => [m, { month: m, INTERNAL: 0, PBM: 0, REGULATORY: 0, total: 0 } as MonthRow]));
  for (const c of cases) {
    const r = rows.get(c.createdAt.slice(0, 7));
    if (!r) continue;
    if (c.auditType === "INTERNAL" || c.auditType === "PBM" || c.auditType === "REGULATORY") r[c.auditType] += 1;
    else continue;
    r.total += 1;
  }
  return months.map((m) => rows.get(m)!);
}

/** Average whole days from "request received" (or the day the case was started) to the day the answer was sent; null when nothing was sent. */
export function averageDaysToAnswer(cases: { requestReceivedOn: string | null; createdAt: string; sentAt: string | null }[]): number | null {
  const days: number[] = [];
  for (const c of cases) {
    if (!c.sentAt) continue;
    const from = c.requestReceivedOn && isDay(c.requestReceivedOn) ? c.requestReceivedOn : c.createdAt.slice(0, 10);
    const d = daysBetween(from, c.sentAt.slice(0, 10));
    if (d >= 0) days.push(d);
  }
  if (!days.length) return null;
  return Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10;
}

export type Count = { name: string; count: number };

/** The most common values, biggest first (ties by name); blanks are left out. */
export function topCounts(values: (string | null | undefined)[], limit = 10): Count[] {
  const m = new Map<string, number>();
  for (const v of values) {
    const k = (v ?? "").replace(/\s+/g, " ").trim();
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit);
}

/** Who asked: the PBM or agency, else the auditor's company, else the auditor's name. */
export const auditorLabel = (c: { pbmName: string | null; agency: string | null; auditorCompany: string | null; auditorName: string | null }) => c.pbmName || c.agency || c.auditorCompany || c.auditorName || null;

export type MissingKind = "ndc" | "description" | "invoiceNumber" | "quantity" | "date";
export const MISSING_LABEL: Record<MissingKind, string> = {
  ndc: "Missing NDC/NRC",
  description: "Missing product description",
  invoiceNumber: "Missing invoice number",
  quantity: "Missing quantity",
  date: "Missing transaction date",
};
const MISSING_COLUMN: Record<MissingKind, ColumnKey> = { ndc: "ndc", description: "productDescription", invoiceNumber: "invoiceNumber", quantity: "quantity", date: "date" };

export type MissingSummary = { rows: number; byKind: Record<MissingKind, number>; products: Count[] };

/**
 * Data-quality gaps across generated files. Each file is judged only on the columns it actually has (a PBM file has no price, an
 * internal file may have no description column), so a column that was left out is never counted as "missing".
 */
export function missingSummary(files: { columns: { key: string }[]; rows: ReportRow[] }[]): MissingSummary {
  const byKind: Record<MissingKind, number> = { ndc: 0, description: 0, invoiceNumber: 0, quantity: 0, date: 0 };
  const products: string[] = [];
  let rows = 0;
  for (const f of files) {
    const has = new Set(f.columns.map((c) => c.key));
    for (const r of f.rows) {
      rows += 1;
      for (const k of Object.keys(MISSING_COLUMN) as MissingKind[]) {
        const col = MISSING_COLUMN[k];
        if (!has.has(col)) continue;
        const v = r[col];
        const blank = v === null || v === undefined || String(v).trim() === "" || (k === "quantity" && Number(v) <= 0);
        if (!blank) continue;
        byKind[k] += 1;
        if (k === "ndc") products.push(String(r.productName ?? ""));
      }
    }
  }
  return { rows, byKind, products: topCounts(products, 10) };
}

// ---- auditor directory -------------------------------------------------------------------------------------------------

export const AUDITOR_KINDS = ["PBM", "STATE", "FEDERAL", "OTHER"] as const;
export type AuditorKind = (typeof AUDITOR_KINDS)[number];
export const AUDITOR_KIND_LABEL: Record<AuditorKind, string> = { PBM: "PBM / health plan", STATE: "State agency", FEDERAL: "Federal agency", OTHER: "Other" };
export const isAuditorKind = (v: unknown): v is AuditorKind => typeof v === "string" && (AUDITOR_KINDS as readonly string[]).includes(v);

export type AuditorInput = { kind: string; name: string; company: string; email: string; phone: string; notes: string };
export type AuditorClean = { kind: AuditorKind; name: string | null; company: string | null; email: string | null; phone: string | null; notes: string | null };

const squeeze = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/** Checks and tidies a directory entry. Needs a name or a company; an email, when given, must look like one. */
export function checkAuditor(i: AuditorInput): { ok: true; value: AuditorClean } | { ok: false; error: string } {
  const kind: AuditorKind = isAuditorKind(i.kind) ? i.kind : "OTHER";
  const name = squeeze(i.name, 120);
  const company = squeeze(i.company, 160);
  const email = squeeze(i.email, 160).toLowerCase();
  const phone = squeeze(i.phone, 40);
  const notes = String(i.notes ?? "").replace(/\r/g, "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, 1000);
  if (!name && !company) return { ok: false, error: "Enter a name or a company (agency)." };
  if (email && !EMAIL.test(email)) return { ok: false, error: "That email address doesn't look right." };
  return { ok: true, value: { kind, name: name || null, company: company || null, email: email || null, phone: phone || null, notes: notes || null } };
}

/** The line shown in a picker: "Express Scripts — Pat Lee (pat@x.com)". */
export function auditorTitle(a: { name: string | null; company: string | null; email: string | null }): string {
  const who = [a.company, a.name].filter(Boolean).join(" — ");
  return a.email ? `${who} (${a.email})` : who;
}
