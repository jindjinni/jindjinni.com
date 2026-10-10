// Audit Center phase 3, the database side: deadline reminders, the dashboard's numbers and the auditor directory.
// Everything starts from one organizationId. Reading only, except the directory (which hides instead of deleting).

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditAuditors, auditVersions, audits } from "@/db/schema";
import { newId } from "@/lib/ids";
import { getPaymentTerms } from "@/lib/accounts-queries";
import { todayIn } from "@/lib/payment-due";
import { auditorLabel, averageDaysToAnswer, casesByMonth, checkAuditor, dueInfo, lastMonths, missingSummary, reminders, topCounts, type AuditorInput, type DueKind } from "@/lib/audit-insights";
import type { ColumnDef, ReportRow } from "@/lib/audit-rules";
import type { AuditRow } from "@/lib/audit-service";

/** Today's calendar day in the company's own time zone (the one Accounts uses for due dates). */
export async function todayFor(organizationId: string): Promise<string> {
  return todayIn((await getPaymentTerms(organizationId)).timeZone);
}

const OPEN_FOR_REMINDERS = ["NEW_REQUEST", "REVIEWING_REQUEST", "DEVICE_CONFIRMATION_NEEDED", "WAITING_FOR_INFORMATION", "RECORDS_BEING_PREPARED", "REVIEW_REQUIRED", "READY_TO_GENERATE", "READY_TO_SEND", "FOLLOW_UP_REQUIRED"];

/** Cases that are overdue, due today or due within a week, for the Audit Center home and the menu number. */
export async function reminderCases(organizationId: string, today?: string): Promise<{ today: string; overdue: AuditRow[]; dueToday: AuditRow[]; soon: AuditRow[]; count: number }> {
  const day = today ?? (await todayFor(organizationId));
  const rows = await db
    .select()
    .from(audits)
    .where(and(eq(audits.organizationId, organizationId), inArray(audits.status, OPEN_FOR_REMINDERS), sql`${audits.dueOn} is not null`))
    .orderBy(asc(audits.dueOn))
    .limit(500);
  const r = reminders(rows, day);
  return { today: day, overdue: r.overdue, dueToday: r.today, soon: r.soon, count: r.count };
}

/** Just the number for the Audit Center tab. */
export async function reminderCount(organizationId: string): Promise<number> {
  return (await reminderCases(organizationId)).count;
}

export type Dashboard = {
  today: string;
  open: { total: number; byStatus: Record<string, number>; due: Record<DueKind, number> };
  months: ReturnType<typeof casesByMonth>;
  totals: { all: number; sent: number; averageDays: number | null; byType: Record<string, number> };
  pharmacies: { name: string; count: number }[];
  auditors: { name: string; count: number }[];
  gaps: ReturnType<typeof missingSummary> & { cases: number };
};

/** All the dashboard's numbers in one go (cases from the last 12 months for the trend and the gaps; everything for the totals). */
export async function dashboardData(organizationId: string): Promise<Dashboard> {
  const today = await todayFor(organizationId);
  const all = await db.select().from(audits).where(eq(audits.organizationId, organizationId)).orderBy(desc(audits.createdAt)).limit(5000);
  const months = lastMonths(today, 12);
  const since = months[0] + "-01";
  const recent = all.filter((c) => c.createdAt.slice(0, 10) >= since);

  const byStatus: Record<string, number> = {};
  const due: Record<DueKind, number> = { OVERDUE: 0, TODAY: 0, SOON: 0, LATER: 0, NONE: 0, DONE: 0 };
  let openTotal = 0;
  for (const c of all) {
    if (c.status === "COMPLETE" || c.status === "CANCELLED") continue;
    byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
    openTotal += 1;
    due[dueInfo(c.dueOn, c.status, today).kind] += 1;
  }
  const byType: Record<string, number> = {};
  for (const c of all) byType[c.auditType] = (byType[c.auditType] ?? 0) + 1;

  // Data gaps: the newest generated file of each recent case, judged on the columns it has.
  const files: { columns: ColumnDef[]; rows: ReportRow[] }[] = [];
  let casesWithFile = 0;
  for (const c of recent.slice(0, 60)) {
    const [v] = await db.select({ s: auditVersions.snapshotJson }).from(auditVersions).where(and(eq(auditVersions.organizationId, organizationId), eq(auditVersions.auditId, c.id))).orderBy(desc(auditVersions.version)).limit(1);
    if (!v) continue;
    try {
      const j = JSON.parse(v.s) as { columns?: ColumnDef[]; rows?: ReportRow[] };
      files.push({ columns: j.columns ?? [], rows: j.rows ?? [] });
      casesWithFile += 1;
    } catch {
      // A file that can't be read is skipped, never counted.
    }
  }

  return {
    today,
    open: { total: openTotal, byStatus, due },
    months: casesByMonth(recent, months),
    totals: { all: all.length, sent: all.filter((c) => !!c.sentAt).length, averageDays: averageDaysToAnswer(all), byType },
    pharmacies: topCounts(all.map((c) => c.pharmacyName), 10),
    auditors: topCounts(all.map(auditorLabel), 10),
    gaps: { ...missingSummary(files), cases: casesWithFile },
  };
}

// ---- auditor directory -------------------------------------------------------------------------------------------------

export type AuditorRow = typeof auditAuditors.$inferSelect;

/** Saved auditors, A to Z by company then name. Hidden ones only when asked for. */
export async function listAuditors(organizationId: string, opts: { hidden?: boolean } = {}): Promise<AuditorRow[]> {
  const rows = await db
    .select()
    .from(auditAuditors)
    .where(and(eq(auditAuditors.organizationId, organizationId), opts.hidden ? sql`${auditAuditors.hiddenAt} is not null` : isNull(auditAuditors.hiddenAt)))
    .limit(1000);
  return rows.sort((a, b) => `${a.company ?? ""} ${a.name ?? ""}`.toLowerCase().localeCompare(`${b.company ?? ""} ${b.name ?? ""}`.toLowerCase()));
}

export async function getAuditor(organizationId: string, id: string): Promise<AuditorRow | null> {
  if (!id) return null;
  const [r] = await db.select().from(auditAuditors).where(and(eq(auditAuditors.organizationId, organizationId), eq(auditAuditors.id, id))).limit(1);
  return r ?? null;
}

type R = { ok: true; id: string } | { ok: false; error: string };

export async function saveAuditor(a: { organizationId: string; userId: string }, input: AuditorInput, id?: string | null): Promise<R> {
  const c = checkAuditor(input);
  if (!c.ok) return c;
  const v = c.value;
  if (id) {
    const have = await getAuditor(a.organizationId, id);
    if (!have) return { ok: false, error: "That entry wasn't found." };
    await db.update(auditAuditors).set({ ...v, updatedAt: new Date().toISOString() }).where(and(eq(auditAuditors.organizationId, a.organizationId), eq(auditAuditors.id, id)));
    return { ok: true, id };
  }
  const dupe = v.email ? (await listAuditors(a.organizationId)).find((x) => x.email === v.email) : null;
  if (dupe) return { ok: false, error: `${v.email} is already saved.` };
  const nid = newId("aud_who");
  await db.insert(auditAuditors).values({ id: nid, organizationId: a.organizationId, ...v, createdByUserId: a.userId });
  return { ok: true, id: nid };
}

/** Hide (or bring back) an entry. Nothing is deleted; cases keep the auditor details they were started with. */
export async function setAuditorHidden(organizationId: string, id: string, hidden: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const have = await getAuditor(organizationId, id);
  if (!have) return { ok: false, error: "That entry wasn't found." };
  await db.update(auditAuditors).set({ hiddenAt: hidden ? new Date().toISOString() : null, updatedAt: new Date().toISOString() }).where(and(eq(auditAuditors.organizationId, organizationId), eq(auditAuditors.id, id)));
  return { ok: true };
}

