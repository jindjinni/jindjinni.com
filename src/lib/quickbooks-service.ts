// QuickBooks reports: pull them from a company's QuickBooks Online, or take an uploaded Desktop / Enterprise export, and keep the
// copy. Pages only READ the saved copies; the Refresh and Upload actions are the only writers. Every query is scoped by company.

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { accountingSnapshots } from "@/db/schema";
import { featureOn } from "@/lib/features";
import { newId } from "@/lib/ids";
import { accountingView, qboRead } from "@/lib/quickbooks";
import {
  KEEP_COPIES, MAX_FILE_BYTES, REPORT_META, fileOk, fromQboPayments, fromQboReport, lastDays, refreshWait, tableFromGrid,
  type QboReport, type ReportKind, type ReportTable,
} from "@/lib/quickbooks-rules";
import { parseCsvGrid } from "@/lib/spreadsheet-import";
import { todayFor } from "@/lib/receivable-service";

export const quickbooksOn = (organizationId: string) => featureOn("quickbooks", organizationId);

export type Snapshot = {
  id: string;
  kind: ReportKind;
  source: "QBO" | "FILE";
  title: string;
  periodLabel: string | null;
  fileName: string | null;
  table: ReportTable;
  rowCount: number;
  takenByName: string | null;
  takenAt: string;
};

type Row = typeof accountingSnapshots.$inferSelect;

function toSnapshot(r: Row): Snapshot {
  let columns: string[] = [];
  let rows: string[][] = [];
  let bold: number[] = [];
  try {
    columns = JSON.parse(r.columnsJson) as string[];
    const body = JSON.parse(r.rowsJson) as { rows?: string[][]; bold?: number[] };
    rows = body.rows ?? [];
    bold = body.bold ?? [];
  } catch {
    // A damaged copy shows as empty; pulling again replaces it.
  }
  return { id: r.id, kind: r.kind, source: r.source, title: r.title, periodLabel: r.periodLabel, fileName: r.fileName, table: { columns, rows, bold }, rowCount: r.rowCount, takenByName: r.takenByName, takenAt: r.takenAt };
}

/** The newest saved copy of each report. */
export async function latestSnapshots(organizationId: string, kinds: ReportKind[]): Promise<Partial<Record<ReportKind, Snapshot>>> {
  const out: Partial<Record<ReportKind, Snapshot>> = {};
  for (const k of kinds) {
    const [r] = await db
      .select()
      .from(accountingSnapshots)
      .where(and(eq(accountingSnapshots.organizationId, organizationId), eq(accountingSnapshots.kind, k)))
      .orderBy(desc(accountingSnapshots.takenAt), desc(accountingSnapshots.id))
      .limit(1);
    if (r) out[k] = toSnapshot(r);
  }
  return out;
}

async function save(organizationId: string, s: { kind: ReportKind; source: "QBO" | "FILE"; title: string; periodLabel: string | null; fileName: string | null; table: ReportTable; by: { userId: string; name: string | null } }): Promise<string> {
  const id = newId("qbs");
  await db.insert(accountingSnapshots).values({
    id, organizationId, kind: s.kind, source: s.source, title: s.title, periodLabel: s.periodLabel, fileName: s.fileName,
    columnsJson: JSON.stringify(s.table.columns), rowsJson: JSON.stringify({ rows: s.table.rows, bold: s.table.bold }), rowCount: s.table.rows.length,
    takenByUserId: s.by.userId, takenByName: s.by.name, takenAt: new Date().toISOString(),
  });
  // Only the newest few copies of a report are kept. These are copies of QuickBooks' own data, not company records.
  const all = await db
    .select({ id: accountingSnapshots.id })
    .from(accountingSnapshots)
    .where(and(eq(accountingSnapshots.organizationId, organizationId), eq(accountingSnapshots.kind, s.kind)))
    .orderBy(desc(accountingSnapshots.takenAt), desc(accountingSnapshots.id));
  const old = all.slice(KEEP_COPIES).map((r) => r.id);
  if (old.length) await db.delete(accountingSnapshots).where(and(eq(accountingSnapshots.organizationId, organizationId), inArray(accountingSnapshots.id, old)));
  return id;
}

export type PullResult = { ok: true; rows: number } | { ok: false; error: string; reconnect?: boolean };

/** Pulls one report from the company's QuickBooks Online and saves it. At most once a minute per report. */
export async function pullReport(organizationId: string, kind: ReportKind, by: { userId: string; name: string | null }): Promise<PullResult> {
  const view = await accountingView(organizationId);
  if (!view.connected) return { ok: false, error: "QuickBooks isn't connected. Ask an owner or admin to connect it, or upload a file." };
  if (view.status !== "ACTIVE") return { ok: false, error: "QuickBooks needs to be reconnected. Ask an owner or admin to reconnect it in Settings → Connectors.", reconnect: true };

  const [last] = await db
    .select({ takenAt: accountingSnapshots.takenAt })
    .from(accountingSnapshots)
    .where(and(eq(accountingSnapshots.organizationId, organizationId), eq(accountingSnapshots.kind, kind), eq(accountingSnapshots.source, "QBO")))
    .orderBy(desc(accountingSnapshots.takenAt))
    .limit(1);
  const wait = refreshWait(last?.takenAt);
  if (wait > 0) return { ok: false, error: `This report was just pulled. You can pull it again in ${wait} second${wait === 1 ? "" : "s"}.` };

  const today = await todayFor(organizationId);
  const range = lastDays(today, 90);
  let table: ReportTable;
  let period: string;
  if (kind === "PAID") {
    const payments: unknown[] = [];
    for (let page = 0; page < 5; page++) {
      const q = `select * from Payment where TxnDate >= '${range.start}' and TxnDate <= '${range.end}' orderby TxnDate desc startposition ${page * 1000 + 1} maxresults 1000`;
      const r = await qboRead(organizationId, "query", { query: q });
      if (!r.ok) return { ok: false, error: r.error, reconnect: r.reconnect };
      const list = ((r.json as { QueryResponse?: { Payment?: unknown[] } }).QueryResponse?.Payment ?? []) as unknown[];
      payments.push(...list);
      if (list.length < 1000) break;
    }
    table = fromQboPayments(payments as Parameters<typeof fromQboPayments>[0]);
    period = `${range.start} to ${range.end}`;
  } else if (kind === "OWED") {
    const r = await qboRead(organizationId, "reports/AgedReceivables", { report_date: today });
    if (!r.ok) return { ok: false, error: r.error, reconnect: r.reconnect };
    table = fromQboReport(r.json as QboReport, "Customer");
    period = `As of ${today}`;
  } else {
    const r = await qboRead(organizationId, "reports/ProfitAndLoss", { start_date: range.start, end_date: range.end, summarize_column_by: "Total" });
    if (!r.ok) return { ok: false, error: r.error, reconnect: r.reconnect };
    table = fromQboReport(r.json as QboReport, "Account");
    period = `${range.start} to ${range.end}`;
  }
  await save(organizationId, { kind, source: "QBO", title: REPORT_META[kind].qboTitle, periodLabel: period, fileName: null, table, by });
  return { ok: true, rows: table.rows.length };
}

/** Saves an uploaded QuickBooks Desktop / Enterprise export (CSV only). */
export async function takeUpload(organizationId: string, kind: ReportKind, file: { name: string; size: number; text: () => Promise<string> }, by: { userId: string; name: string | null }): Promise<PullResult> {
  if (!fileOk(file.name)) return { ok: false, error: "Please upload a CSV file. In QuickBooks, export the report as a CSV file (not Excel)." };
  if (file.size <= 0) return { ok: false, error: "That file is empty." };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: "That file is larger than 5 MB. Choose a shorter period and export it again." };
  const grid = parseCsvGrid(await file.text());
  const r = tableFromGrid(grid);
  if (!r.ok) return { ok: false, error: r.error };
  await save(organizationId, { kind, source: "FILE", title: REPORT_META[kind].label, periodLabel: null, fileName: file.name.slice(0, 120), table: r.table, by });
  return { ok: true, rows: r.table.rows.length };
}
