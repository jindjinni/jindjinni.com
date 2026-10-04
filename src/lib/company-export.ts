// Builds the "Download all my data" workbook: one sheet per kind of record the
// company owns. Discovers every table that has an organizationId column, so
// new departments are included automatically.

import * as XLSX from "xlsx";
import { eq, getTableColumns, is } from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { getTeamMembers } from "@/lib/team-queries";

/** Columns that are secrets or bulky binary data -- never exported. */
const SKIP_COLUMNS = new Set(["tokenHash", "logoData", "passwordHash", "codeHash"]);
const CELL_LIMIT = 32000;

export function orgScopedTables(): { key: string; table: SQLiteTable }[] {
  const out: { key: string; table: SQLiteTable }[] = [];
  for (const [key, value] of Object.entries(schema)) {
    if (is(value, SQLiteTable) && "organizationId" in getTableColumns(value)) out.push({ key, table: value });
  }
  return out;
}

function humanize(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
}

function cell(v: unknown): string | number | boolean {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object") return JSON.stringify(v).slice(0, CELL_LIMIT);
  return String(v).slice(0, CELL_LIMIT);
}

export async function buildCompanyWorkbook(organizationId: string, organizationName: string): Promise<Buffer> {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  const contents: string[][] = [["Sheet", "Rows"]];

  const addSheet = (name: string, rows: Record<string, unknown>[]) => {
    let sheetName = name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || "Sheet";
    let n = 2;
    while (used.has(sheetName.toLowerCase())) sheetName = `${sheetName.slice(0, 28)} ${n++}`;
    used.add(sheetName.toLowerCase());
    const clean = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, cell(v)])));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clean), sheetName);
    contents.push([sheetName, String(rows.length)]);
  };

  const team = await getTeamMembers(organizationId);
  addSheet(
    "Team",
    team.map((m) => ({ name: m.name, email: m.email, role: m.role, accessOff: m.deactivatedAt ? "yes" : "", lastSignIn: m.lastLoginAt })),
  );

  for (const { key, table } of orgScopedTables()) {
    const cols = getTableColumns(table) as Record<string, import("drizzle-orm").Column>;
    const rows = (await db.select().from(table).where(eq(cols.organizationId, organizationId))) as Record<string, unknown>[];
    if (rows.length === 0) continue;
    addSheet(
      humanize(key),
      rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !SKIP_COLUMNS.has(k)))),
    );
  }

  const readme = [
    [`Data export for ${organizationName}`],
    [`Created ${new Date().toISOString()}`],
    ["Logos and password information are not included. Each sheet below is one kind of record."],
    [],
    ...contents,
  ];
  const readmeSheet = XLSX.utils.aoa_to_sheet(readme);
  XLSX.utils.book_append_sheet(wb, readmeSheet, "About this file");
  // Put the explainer first.
  wb.SheetNames.unshift(wb.SheetNames.pop() as string);

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
