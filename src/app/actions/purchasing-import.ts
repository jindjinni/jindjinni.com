"use server";

// Quotation Summary -> Import. Two steps so nothing is written by surprise:
//   previewQuotationImport  - reads the file, writes nothing, reports what would happen
//   importQuotations        - re-reads the file on the server and applies the same plan
// Orders that already exist (same reference # or tracking #) are skipped and
// listed in the report; new customers are added automatically.

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingCustomers, purchasingQuotations, purchasingAuditLog } from "@/db/schema";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";
import { canWritePurchasing } from "@/lib/permissions";
import { newId } from "@/lib/ids";
import { parseSpreadsheetFile, type ParsedSheet } from "@/lib/spreadsheet-import";
import {
  planQuotationImport,
  splitName,
  type ImportPlan,
  type ImportPlanEntry,
  type ImportRow,
} from "@/lib/purchasing-quotation-import";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const REPORT_ROW_CAP = 300;

export type QuotationImportReportLine = {
  rowNumber: number;
  reference: string;
  status: "new" | "duplicate" | "error";
  detail: string;
};

export type QuotationImportState =
  | undefined
  | { error: string }
  | {
      kind: "preview";
      fileName: string;
      total: number;
      newCount: number;
      duplicateCount: number;
      errorCount: number;
      newCustomers: number;
      existingCustomers: number;
      warningCount: number;
      lines: QuotationImportReportLine[];
      linesTruncated: boolean;
    }
  | {
      kind: "done";
      fileName: string;
      imported: number;
      duplicateCount: number;
      errorCount: number;
      newCustomers: number;
      lines: QuotationImportReportLine[];
      linesTruncated: boolean;
    };

async function requireWriter(): Promise<CurrentOrg> {
  const org = await requireOrg();
  if (!canWritePurchasing(org.role)) throw new Error("Your role can't make changes in Purchasing.");
  return org;
}

async function readSheet(formData: FormData): Promise<{ sheet: ParsedSheet; fileName: string } | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV or Excel file to import." };
  if (file.size > MAX_FILE_BYTES) return { error: "That file is over 5 MB. Split it into smaller files and import them one at a time." };
  try {
    const sheet = parseSpreadsheetFile(Buffer.from(await file.arrayBuffer()), file.name);
    return { sheet, fileName: file.name };
  } catch {
    return { error: "Couldn't read that file -- make sure it's a CSV or Excel export." };
  }
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const nameKey = (first: string, last: string | null) => `${first} ${last ?? ""}`.replace(/\s+/g, " ").trim().toLowerCase();

async function loadExisting(organizationId: string) {
  const quotes = await db
    .select({ n: purchasingQuotations.quotationNumber, t: purchasingQuotations.trackingNumber })
    .from(purchasingQuotations)
    .where(eq(purchasingQuotations.organizationId, organizationId));
  const customers = await db
    .select({
      id: purchasingCustomers.id,
      firstName: purchasingCustomers.firstName,
      lastName: purchasingCustomers.lastName,
      email: purchasingCustomers.email,
    })
    .from(purchasingCustomers)
    .where(eq(purchasingCustomers.organizationId, organizationId));
  const byEmail = new Map<string, string>();
  const nameCount = new Map<string, { id: string; count: number }>();
  for (const c of customers) {
    if (c.email) byEmail.set(c.email.toLowerCase(), c.id);
    const k = nameKey(c.firstName, c.lastName);
    const cur = nameCount.get(k);
    nameCount.set(k, cur ? { id: cur.id, count: cur.count + 1 } : { id: c.id, count: 1 });
  }
  return {
    references: new Set(quotes.map((q) => q.n.toLowerCase())),
    trackingNumbers: new Set(quotes.map((q) => (q.t ?? "").replace(/\s+/g, "").toUpperCase()).filter(Boolean)),
    byEmail,
    byName: nameCount,
  };
}

type Existing = Awaited<ReturnType<typeof loadExisting>>;

/** Which customer each new row belongs to: an existing one (email, then name) or a to-be-created one (one per email/name). */
function matchCustomers(rows: ImportRow[], existing: Existing) {
  const toCreate = new Map<string, ImportRow>(); // key -> first row that mentions the customer
  const assignment = new Map<number, { existingId: string } | { key: string }>();
  const keyByEmail = new Map<string, string>();
  const keyByName = new Map<string, string>();
  for (const row of rows) {
    const { firstName, lastName } = splitName(row.name);
    const nk = nameKey(firstName, lastName);
    if (row.email && existing.byEmail.has(row.email)) {
      assignment.set(row.rowNumber, { existingId: existing.byEmail.get(row.email)! });
      continue;
    }
    // Name match only when it is unambiguous, and only when the file's email doesn't point to a different known person.
    const nameHit = existing.byName.get(nk);
    if (nameHit && nameHit.count === 1 && !row.email) {
      assignment.set(row.rowNumber, { existingId: nameHit.id });
      continue;
    }
    let key = row.email ? keyByEmail.get(row.email) : undefined;
    if (!key && !row.email) key = keyByName.get(nk);
    if (!key) {
      key = `c${toCreate.size}`;
      toCreate.set(key, row);
      if (row.email) keyByEmail.set(row.email, key);
      else keyByName.set(nk, key);
    }
    assignment.set(row.rowNumber, { key });
  }
  return { toCreate, assignment };
}

function buildLines(entries: ImportPlanEntry[]): { lines: QuotationImportReportLine[]; truncated: boolean } {
  const problems: QuotationImportReportLine[] = [];
  for (const e of entries) {
    if (e.status === "new") {
      if (e.row.warnings.length > 0) problems.push({ rowNumber: e.row.rowNumber, reference: e.row.reference, status: "new", detail: e.row.warnings.join(" ") });
    } else {
      problems.push({ rowNumber: e.rowNumber, reference: e.reference, status: e.status, detail: e.reason });
    }
  }
  problems.sort((a, b) => a.rowNumber - b.rowNumber);
  return { lines: problems.slice(0, REPORT_ROW_CAP), truncated: problems.length > REPORT_ROW_CAP };
}

async function makePlan(formData: FormData, organizationId: string): Promise<{ plan: Extract<ImportPlan, { ok: true }>; existing: Existing; fileName: string } | { error: string }> {
  const read = await readSheet(formData);
  if ("error" in read) return read;
  const existing = await loadExisting(organizationId);
  const plan = planQuotationImport(read.sheet, existing, todayIso());
  if (!plan.ok) return { error: plan.error };
  return { plan, existing, fileName: read.fileName };
}

export async function previewQuotationImport(_prev: QuotationImportState, formData: FormData): Promise<QuotationImportState> {
  const org = await requireWriter();
  const made = await makePlan(formData, org.organizationId);
  if ("error" in made) return { error: made.error };
  const { plan, existing, fileName } = made;
  const newRows = plan.entries.flatMap((e) => (e.status === "new" ? [e.row] : []));
  const { toCreate, assignment } = matchCustomers(newRows, existing);
  const { lines, truncated } = buildLines(plan.entries);
  return {
    kind: "preview",
    fileName,
    total: plan.counts.total,
    newCount: plan.counts.new,
    duplicateCount: plan.counts.duplicate,
    errorCount: plan.counts.error,
    newCustomers: toCreate.size,
    existingCustomers: new Set([...assignment.values()].flatMap((a) => ("existingId" in a ? [a.existingId] : []))).size,
    warningCount: newRows.filter((r) => r.warnings.length > 0).length,
    lines,
    linesTruncated: truncated,
  };
}

export async function importQuotations(_prev: QuotationImportState, formData: FormData): Promise<QuotationImportState> {
  const org = await requireWriter();
  const made = await makePlan(formData, org.organizationId);
  if ("error" in made) return { error: made.error };
  const { plan, existing, fileName } = made;
  const newRows = plan.entries.flatMap((e) => (e.status === "new" ? [e.row] : []));
  if (newRows.length === 0) {
    const { lines, truncated } = buildLines(plan.entries);
    return { kind: "done", fileName, imported: 0, duplicateCount: plan.counts.duplicate, errorCount: plan.counts.error, newCustomers: 0, lines, linesTruncated: truncated };
  }

  const { toCreate, assignment } = matchCustomers(newRows, existing);
  const nowIso = new Date().toISOString().replace("T", " ").slice(0, 19);

  // 1) New customers (address comes from the file).
  const createdIds = new Map<string, string>();
  const customerValues = [...toCreate.entries()].map(([key, row]) => {
    const id = newId("pcust");
    createdIds.set(key, id);
    const { firstName, lastName } = splitName(row.name);
    return {
      id,
      organizationId: org.organizationId,
      firstName,
      lastName: lastName || null,
      email: row.email,
      phone: row.phone,
      addressStreet1: row.address.street1 || null,
      addressCity: row.address.city || null,
      addressState: row.address.state || null,
      addressZip: row.address.zip || null,
      notes: "Added automatically by a Quotation Summary import.",
    };
  });
  for (let i = 0; i < customerValues.length; i += 100) {
    await db.insert(purchasingCustomers).values(customerValues.slice(i, i + 100));
  }

  // 2) Quotations.
  const quoteValues = newRows.map((row) => {
    const a = assignment.get(row.rowNumber)!;
    const customerId = "existingId" in a ? a.existingId : createdIds.get(a.key)!;
    return {
      id: newId("pquote"),
      organizationId: org.organizationId,
      quotationNumber: row.reference,
      customerId,
      customerNameSnapshot: row.name,
      customerEmailSnapshot: row.email,
      customerPhoneSnapshot: row.phone,
      quotationDate: row.date,
      status: "QUOTED" as const,
      itemsTotal: row.total,
      grandTotal: row.total,
      carrier: row.carrier,
      trackingNumber: row.tracking || null,
      source: "IMPORTED",
      importedItemsText: row.itemsText || null,
      importedShippingAddress: row.shippingRaw || null,
      importedAt: nowIso,
      createdByUserId: org.userId,
      createdAt: `${row.date} 12:00:00`,
    };
  });
  let imported = 0;
  for (let i = 0; i < quoteValues.length; i += 50) {
    const chunk = quoteValues.slice(i, i + 50);
    await db.insert(purchasingQuotations).values(chunk);
    imported += chunk.length;
  }

  await db.insert(purchasingAuditLog).values({
    id: newId("paudit"),
    organizationId: org.organizationId,
    userId: org.userId,
    recordType: "quotation_import",
    recordId: fileName.slice(0, 120),
    fieldName: "import",
    previousValue: null,
    newValue: String(imported),
    note: `Imported ${imported} order(s) from ${fileName}; skipped ${plan.counts.duplicate} already in the list; ${plan.counts.error} row(s) had problems; added ${createdIds.size} new customer(s).`,
  });

  revalidatePath("/dashboard/purchasing/quotations");
  revalidatePath("/dashboard/purchasing/customers");
  const { lines, truncated } = buildLines(plan.entries);
  return {
    kind: "done",
    fileName,
    imported,
    duplicateCount: plan.counts.duplicate,
    errorCount: plan.counts.error,
    newCustomers: createdIds.size,
    lines,
    linesTruncated: truncated,
  };
}
