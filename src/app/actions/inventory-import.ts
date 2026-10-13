"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/tenant";
import { canWriteInventory } from "@/lib/permissions";
import { featureOn } from "@/lib/features";
import { MANUAL_CONDITIONS } from "@/lib/inventory-conditions";
import { parseSpreadsheetFile } from "@/lib/spreadsheet-import";
import { todayIn } from "@/lib/payment-due";
import { getPaymentTerms } from "@/lib/accounts-queries";
import { logActivity } from "@/lib/hr-service";
import {
  MAX_IMPORT_FILE_BYTES, STOCK_FIELDS, guessStockColumns, importFingerprint, readStockRows,
  type ImportRow, type StockColumnMap, type StockField,
} from "@/lib/inventory-import-rules";
import { activeImport, commitStockImport, importProducts, undoStockImport } from "@/lib/inventory-import-service";

export type StockPreview =
  | {
      ok: true;
      fileName: string;
      headers: string[];
      map: StockColumnMap;
      defaultCondition: string;
      conditionColumn: boolean;
      rows: ImportRow[];
      counts: { ok: number; match: number; problem: number; units: number; blank: number };
      /** Set when this exact file is already in stock from an earlier import. */
      alreadyImportedAt: string | null;
    }
  | { ok: false; error: string };

export type StockImportState = { ok?: boolean; error?: string; message?: string };

async function writer() {
  const org = await requireOrg();
  if (org.viewAs) return { error: "Viewing a company is read-only." } as const;
  if (!canWriteInventory(org.role, org.access)) return { error: "Only a Purchasing Manager, Admin or the Owner can import stock." } as const;
  if (!(await featureOn("inventory-import", org.organizationId))) return { error: "Stock import isn't switched on for this company yet." } as const;
  return { org } as const;
}

/** The file, read again on every call: the server never trusts what the page showed. */
async function readRequest(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose your stock file (Excel or CSV)." } as const;
  if (file.size > MAX_IMPORT_FILE_BYTES) return { error: "That file is over 5MB. Split it into smaller files." } as const;
  if (!/\.(csv|txt|xlsx|xls)$/i.test(file.name)) return { error: "Use an Excel (.xlsx) or CSV file." } as const;
  const buffer = Buffer.from(await file.arrayBuffer());
  let sheet;
  try {
    sheet = parseSpreadsheetFile(buffer, file.name);
  } catch {
    return { error: "I couldn't read that file. Save it as .csv or .xlsx and try again." } as const;
  }
  if (!sheet.headers.length || !sheet.rows.length) return { error: "That file looks empty." } as const;
  const chosen: Partial<Record<StockField, string>> = {};
  const guessed = guessStockColumns(sheet.headers);
  for (const f of STOCK_FIELDS) {
    const v = formData.get(`col_${f}`);
    // a person's choice wins ("" means "none"); with no choice yet, the guess is used
    chosen[f] = typeof v === "string" ? v : (guessed[f] ?? "");
  }
  const dc = String(formData.get("defaultCondition") ?? "Mint");
  const defaultCondition = MANUAL_CONDITIONS.find((c) => c.toLowerCase() === dc.toLowerCase()) ?? "Mint";
  let matches: Record<string, string> = {};
  try {
    const raw = JSON.parse(String(formData.get("matches") ?? "{}"));
    if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw)) if (/^\d{1,5}$/.test(k) && typeof v === "string") matches[k] = v;
  } catch {
    matches = {};
  }
  return { file, buffer, sheet, chosen, defaultCondition, matches } as const;
}

async function readAll(orgId: string, req: Exclude<Awaited<ReturnType<typeof readRequest>>, { error: string }>) {
  const [products, terms] = await Promise.all([importProducts(orgId), getPaymentTerms(orgId)]);
  const today = todayIn(terms.timeZone ?? "America/New_York");
  const guessedMap = { ...guessStockColumns(req.sheet.headers) };
  for (const f of STOCK_FIELDS) guessedMap[f] = req.chosen[f] ? req.chosen[f] ?? null : null;
  return readStockRows(req.sheet, guessedMap, products, { today, conditions: [...MANUAL_CONDITIONS], defaultCondition: req.defaultCondition, matches: req.matches });
}

/** Step 1: read the file and show what would be added. Nothing is saved. */
export async function previewStockImportAction(formData: FormData): Promise<StockPreview> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error ?? "" };
  const req = await readRequest(formData);
  if ("error" in req) return { ok: false, error: req.error ?? "" };
  const res = await readAll(w.org.organizationId, req);
  const prior = await activeImport(w.org.organizationId, importFingerprint(req.buffer));
  if (res.error) return { ok: false, error: res.error };
  return {
    ok: true,
    fileName: req.file.name,
    headers: req.sheet.headers.filter(Boolean),
    map: res.map,
    defaultCondition: req.defaultCondition,
    conditionColumn: !!res.map.condition,
    rows: res.rows,
    counts: res.counts,
    alreadyImportedAt: prior?.at ?? null,
  };
}

/** Step 2: add the lines. Every line is read and checked again here; lines that still need attention are only left out when asked. */
export async function commitStockImportAction(formData: FormData): Promise<StockImportState> {
  const w = await writer();
  if ("error" in w) return { error: w.error ?? "" };
  const req = await readRequest(formData);
  if ("error" in req) return { error: req.error ?? "" };
  const res = await readAll(w.org.organizationId, req);
  if (res.error) return { error: res.error };
  const bad = res.counts.match + res.counts.problem;
  if (bad > 0 && formData.get("leaveOut") !== "1") return { error: `${bad} ${bad === 1 ? "line needs" : "lines need"} attention. Fix ${bad === 1 ? "it" : "them"}, or tick "Leave out the lines that need attention".` };
  if (!res.counts.ok) return { error: "None of the lines can be added yet." };
  const out = await commitStockImport(w.org, res.rows, { fileName: req.file.name, refId: importFingerprint(req.buffer) });
  if (!out.ok) return { error: out.error };
  await logActivity(w.org, "STOCK_CHANGE", `Imported ${out.units} ${out.units === 1 ? "unit" : "units"} of stock from ${req.file.name.slice(0, 60)}`, null);
  revalidatePath("/dashboard/inventory", "layout");
  const left = bad ? ` ${bad} ${bad === 1 ? "line was" : "lines were"} left out.` : "";
  return { ok: true, message: `Added ${out.units} ${out.units === 1 ? "unit" : "units"} on ${out.lines} ${out.lines === 1 ? "line" : "lines"} to your stock.${left}` };
}

/** Takes an import back out of stock (reversing entries; nothing is deleted). */
export async function undoStockImportAction(refId: string): Promise<StockImportState> {
  const w = await writer();
  if ("error" in w) return { error: w.error ?? "" };
  if (!/^imp_[0-9a-f]{32}$/.test(String(refId))) return { error: "That import wasn't found." };
  const out = await undoStockImport(w.org, refId);
  if (!out.ok) return { error: out.error };
  await logActivity(w.org, "STOCK_CHANGE", `Undid a stock import (${out.units} ${out.units === 1 ? "unit" : "units"} taken back out)`, null);
  revalidatePath("/dashboard/inventory", "layout");
  return { ok: true, message: `Undone. ${out.units} ${out.units === 1 ? "unit was" : "units were"} taken back out of stock.` };
}
