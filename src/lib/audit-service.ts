// The Audit Center's database side (rules are in audit-rules.ts, the workbook in audit-workbook.ts). Every query is scoped by
// organizationId, the Sales invoices are only ever READ, and a generated file is saved as a new version (never overwritten).
// Accounts, Distribution operation only: the page and the actions check that before calling anything here.

import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, like, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditAttachments, auditEvents, auditSends, auditVersions, audits, purchasingProducts, salesBuyers, salesDocumentLines, salesDocuments, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { billingDateOf } from "@/lib/billing-schedule";
import {
  COUNTED_INVOICE_STATUSES, MONEY_KEYS, isRegSubtype, regSubtypeLabel, TEMPLATE_VERSION, blockers, buildRows, caseNumber, dropBlankColumns, fileNameFor, isClosed, isDay, lineWarnings, pbmSubject,
  summarize, workingStatus, type AuditEventKind, type AuditStatus, type AuditType, type ColumnDef, type DeviceAnswer, type LineWarning, type ReportRow, type SourceLine,
} from "@/lib/audit-rules";
import { buildAuditWorkbook } from "@/lib/audit-workbook";

export type AuditRow = typeof audits.$inferSelect;
export type VersionRow = typeof auditVersions.$inferSelect;
export type Actor = { organizationId: string; userId: string };

const clean = (s: unknown, max = 200) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");
const nz = (s: string) => (s ? s : null);
export const MAX_ATTACHMENT = 5 * 1024 * 1024;

export async function userNameOf(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.name || u?.email || null;
}

export async function addEvent(a: Actor, auditId: string, kind: AuditEventKind, detail: string | null, oldValue?: string | null, newValue?: string | null) {
  await db.insert(auditEvents).values({
    id: newId("aev"),
    organizationId: a.organizationId,
    auditId,
    kind,
    detail,
    oldValue: oldValue ?? null,
    newValue: newValue ?? null,
    userId: a.userId,
    userName: await userNameOf(a.userId),
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Pharmacies (the buyers in Sales)
// ---------------------------------------------------------------------------------------------------------------------

export type PharmacyOption = { id: string; name: string; ncpdp: string | null; npi: string | null; email: string | null };

/** Active buyers, searchable by name or NCPDP. */
export async function searchPharmacies(organizationId: string, q: string): Promise<PharmacyOption[]> {
  const term = clean(q, 80);
  const where = term
    ? and(eq(salesBuyers.organizationId, organizationId), eq(salesBuyers.active, true), or(like(salesBuyers.companyName, `%${term}%`), like(salesBuyers.ncpdp, `%${term}%`)))
    : and(eq(salesBuyers.organizationId, organizationId), eq(salesBuyers.active, true));
  const rows = await db.select().from(salesBuyers).where(where).orderBy(asc(salesBuyers.companyName)).limit(200);
  return rows.map((b) => ({ id: b.id, name: b.companyName, ncpdp: b.ncpdp, npi: b.npi, email: b.email }));
}

async function buyerOf(organizationId: string, id: string | null) {
  if (!id) return null;
  const [b] = await db.select().from(salesBuyers).where(and(eq(salesBuyers.organizationId, organizationId), eq(salesBuyers.id, id))).limit(1);
  return b ?? null;
}

// ---------------------------------------------------------------------------------------------------------------------
// The records (read only)
// ---------------------------------------------------------------------------------------------------------------------

/** The pharmacy's issued invoice lines inside the date range, optionally only for some products. Never changes anything. */
export async function loadSourceLines(organizationId: string, buyerId: string, start: string, end: string, productKeys: string[] | null): Promise<SourceLine[]> {
  const rows = await db
    .select({
      lineId: salesDocumentLines.id,
      invoiceId: salesDocuments.id,
      invoiceNumber: salesDocuments.number,
      date: salesDocuments.docDate,
      position: salesDocumentLines.position,
      productId: salesDocumentLines.productId,
      productKey: salesDocumentLines.productKey,
      productName: salesDocumentLines.productName,
      lineNdc: salesDocumentLines.ndc,
      productNdc: purchasingProducts.ndc,
      packageDescription: purchasingProducts.packageDescription,
      quantity: salesDocumentLines.quantity,
      unitPrice: salesDocumentLines.unitPrice,
      invoiceShipping: salesDocuments.shipping,
      invoiceDiscount: salesDocuments.discount,
    })
    .from(salesDocumentLines)
    .innerJoin(salesDocuments, eq(salesDocuments.id, salesDocumentLines.documentId))
    .leftJoin(purchasingProducts, eq(purchasingProducts.id, salesDocumentLines.productId))
    .where(
      and(
        eq(salesDocuments.organizationId, organizationId),
        eq(salesDocumentLines.organizationId, organizationId),
        eq(salesDocuments.kind, "INVOICE"),
        inArray(salesDocuments.status, [...COUNTED_INVOICE_STATUSES]),
        eq(salesDocuments.buyerId, buyerId),
        gte(salesDocuments.docDate, start),
        lte(salesDocuments.docDate, end),
      ),
    );
  const keys = productKeys && productKeys.length ? new Set(productKeys) : null;
  return rows
    .filter((r) => !keys || (r.productKey && keys.has(r.productKey)))
    .map((r) => ({
      lineId: r.lineId,
      invoiceId: r.invoiceId,
      invoiceNumber: r.invoiceNumber,
      date: r.date,
      position: r.position,
      productId: r.productId,
      productKey: r.productKey,
      productName: r.productName,
      ndc: (r.lineNdc && r.lineNdc.trim()) || r.productNdc || null,
      packageDescription: r.packageDescription,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      invoiceShipping: r.invoiceShipping ?? 0,
      invoiceDiscount: r.invoiceDiscount ?? 0,
    }));
}

/** The products a pharmacy was sold in a period, for the "choose specific products" list. */
export async function productsSold(organizationId: string, buyerId: string, start: string, end: string): Promise<{ key: string; name: string; ndc: string | null }[]> {
  const lines = await loadSourceLines(organizationId, buyerId, start, end, null);
  const seen = new Map<string, { key: string; name: string; ndc: string | null }>();
  for (const l of lines) {
    const key = l.productKey ?? `name:${l.productName}`;
    if (!seen.has(key)) seen.set(key, { key, name: l.productName, ndc: l.ndc });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------------------------------------------------

export type AuditInputForm = {
  type: AuditType;
  buyerId: string;
  startDate: string;
  endDate: string;
  deviceAnswer: DeviceAnswer | null;
  productScope: "ALL" | "SELECTED";
  productKeys: string[];
  includePharmacy: boolean;
  auditorName: string;
  auditorCompany: string;
  auditorEmail: string;
  auditorPhone: string;
  pbmName: string;
  agency: string;
  auditSubtype: string;
  referenceNumber: string;
  requestReceivedOn: string;
  dueOn: string;
};

const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

function formValues(i: AuditInputForm) {
  return {
    startDate: isDay(i.startDate) ? i.startDate : null,
    endDate: isDay(i.endDate) ? i.endDate : null,
    deviceAnswer: i.type === "INTERNAL" ? null : i.deviceAnswer,
    productScope: i.productScope === "SELECTED" && i.productKeys.length ? "SELECTED" : "ALL",
    productKeysJson: i.productScope === "SELECTED" && i.productKeys.length ? JSON.stringify(i.productKeys.slice(0, 300)) : null,
    includePharmacy: i.type === "PBM" ? true : !!i.includePharmacy,
    auditorName: nz(clean(i.auditorName, 120)),
    auditorCompany: nz(clean(i.auditorCompany, 120)),
    auditorEmail: nz(clean(i.auditorEmail, 160)),
    auditorPhone: nz(clean(i.auditorPhone, 40)),
    pbmName: nz(clean(i.pbmName, 120)),
    agency: nz(clean(i.agency, 120)),
    auditSubtype: i.type === "REGULATORY" && isRegSubtype(i.auditSubtype) ? i.auditSubtype : null,
    referenceNumber: nz(clean(i.referenceNumber, 80)),
    requestReceivedOn: isDay(i.requestReceivedOn) ? i.requestReceivedOn : null,
    dueOn: isDay(i.dueOn) ? i.dueOn : null,
  };
}

function productKeysOf(a: AuditRow): string[] | null {
  if (a.productScope !== "SELECTED" || !a.productKeysJson) return null;
  try {
    const v = JSON.parse(a.productKeysJson);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}

export async function createAudit(a: Actor, input: AuditInputForm): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const buyer = await buyerOf(a.organizationId, input.buyerId);
  if (!buyer) return { ok: false, error: "Choose the pharmacy." };
  if (input.auditorEmail && !looksLikeEmail(clean(input.auditorEmail, 160))) return { ok: false, error: "That auditor email doesn't look right." };
  const v = formValues(input);
  const year = Number(billingDateOf().slice(0, 4));
  for (let attempt = 0; attempt < 3; attempt++) {
    const [m] = await db
      .select({ n: sql<number>`coalesce(max(${audits.caseSeq}), 0)` })
      .from(audits)
      .where(and(eq(audits.organizationId, a.organizationId), eq(audits.caseYear, year)));
    const seq = (m?.n ?? 0) + 1;
    const id = newId("aud");
    const status = workingStatus({ type: input.type, deviceAnswer: v.deviceAnswer as DeviceAnswer | null, hasFile: false, blockers: 0 });
    try {
      await db.insert(audits).values({
        id,
        organizationId: a.organizationId,
        caseYear: year,
        caseSeq: seq,
        caseNumber: caseNumber(year, seq),
        auditType: input.type,
        status,
        buyerId: buyer.id,
        pharmacyName: buyer.companyName,
        pharmacyNcpdp: buyer.ncpdp,
        pharmacyNpi: buyer.npi,
        pharmacyEmail: buyer.email,
        pharmacyAddress: buyer.billingAddress,
        createdByUserId: a.userId,
        createdByName: await userNameOf(a.userId),
        ...v,
      });
      await addEvent(a, id, "CREATED", `${caseNumber(year, seq)} created`);
      const created = await getAudit(a.organizationId, id);
      if (created) await refreshStatus(a, created);
      return { ok: true, id };
    } catch (e) {
      if (attempt === 2) throw e; // two people made a case at the same moment: take the next number
    }
  }
  return { ok: false, error: "Could not save the case. Try again." };
}

export async function getAudit(organizationId: string, id: string): Promise<AuditRow | null> {
  const [r] = await db.select().from(audits).where(and(eq(audits.organizationId, organizationId), eq(audits.id, id))).limit(1);
  return r ?? null;
}

const FIELD_LABEL: Record<string, string> = {
  startDate: "Start date", endDate: "End date", deviceAnswer: "Device records requested", productScope: "Products", includePharmacy: "Pharmacy in the file",
  auditorName: "Auditor name", auditorCompany: "Auditor company", auditorEmail: "Auditor email", auditorPhone: "Auditor phone", pbmName: "PBM", agency: "Agency",
  auditSubtype: "Kind of regulator", referenceNumber: "Reference number", requestReceivedOn: "Request received", dueOn: "Due date", buyerId: "Pharmacy",
};

/** Changes a case's scope or request details while it is still open, recording each old and new value. */
export async function updateAudit(a: Actor, id: string, input: AuditInputForm): Promise<{ ok: true } | { ok: false; error: string }> {
  const cur = await getAudit(a.organizationId, id);
  if (!cur) return { ok: false, error: "That audit wasn't found." };
  if (isClosed(cur.status)) return { ok: false, error: "This audit is closed. Reopen it to change it." };
  if (input.auditorEmail && !looksLikeEmail(clean(input.auditorEmail, 160))) return { ok: false, error: "That auditor email doesn't look right." };
  const buyer = await buyerOf(a.organizationId, input.buyerId);
  if (!buyer) return { ok: false, error: "Choose the pharmacy." };
  const v = formValues({ ...input, type: cur.auditType as AuditType });
  const next: Record<string, unknown> = {
    ...v,
    buyerId: buyer.id,
    pharmacyName: buyer.companyName,
    pharmacyNcpdp: buyer.ncpdp,
    pharmacyNpi: buyer.npi,
    pharmacyEmail: buyer.email,
    pharmacyAddress: buyer.billingAddress,
  };
  for (const k of Object.keys(FIELD_LABEL)) {
    const before = (cur as Record<string, unknown>)[k] ?? null;
    const after = next[k] ?? null;
    if (String(before ?? "") !== String(after ?? "")) await addEvent(a, id, k === "deviceAnswer" ? "DEVICE_ANSWER" : "CHANGED", FIELD_LABEL[k], before === null ? null : String(before), after === null ? null : String(after));
  }
  if (cur.productKeysJson !== (next.productKeysJson ?? null)) await addEvent(a, id, "CHANGED", "Products", cur.productKeysJson, (next.productKeysJson as string | null) ?? null);
  await db.update(audits).set({ ...next, updatedAt: new Date().toISOString() }).where(and(eq(audits.organizationId, a.organizationId), eq(audits.id, id)));
  const fresh = await getAudit(a.organizationId, id);
  if (fresh) await refreshStatus(a, fresh);
  return { ok: true };
}

/** The case with its pharmacy's latest details laid over it (nothing is saved): for showing a preview from a page. */
async function withLatestPharmacy(organizationId: string, cur: AuditRow): Promise<AuditRow> {
  if (isClosed(cur.status) || cur.sentAt) return cur;
  const b = await buyerOf(organizationId, cur.buyerId);
  return b ? { ...cur, pharmacyName: b.companyName, pharmacyNcpdp: b.ncpdp, pharmacyNpi: b.npi, pharmacyEmail: b.email, pharmacyAddress: b.billingAddress } : cur;
}

/** Picks up a pharmacy's latest details (for example an NCPDP added after the case was made) while the case is open, and saves them. */
async function syncPharmacy(a: Actor, cur: AuditRow): Promise<AuditRow> {
  if (isClosed(cur.status) || cur.sentAt) return cur;
  const b = await buyerOf(a.organizationId, cur.buyerId);
  if (!b) return cur;
  if (b.companyName === cur.pharmacyName && (b.ncpdp ?? null) === (cur.pharmacyNcpdp ?? null) && (b.npi ?? null) === (cur.pharmacyNpi ?? null) && (b.email ?? null) === (cur.pharmacyEmail ?? null) && (b.billingAddress ?? null) === (cur.pharmacyAddress ?? null)) return cur;
  if ((b.ncpdp ?? null) !== (cur.pharmacyNcpdp ?? null)) await addEvent(a, cur.id, "CHANGED", "Pharmacy NCPDP (updated from the pharmacy's record)", cur.pharmacyNcpdp, b.ncpdp);
  await db.update(audits).set({ pharmacyName: b.companyName, pharmacyNcpdp: b.ncpdp, pharmacyNpi: b.npi, pharmacyEmail: b.email, pharmacyAddress: b.billingAddress, updatedAt: new Date().toISOString() }).where(eq(audits.id, cur.id));
  return (await getAudit(a.organizationId, cur.id)) ?? cur;
}

const WORKING: AuditStatus[] = ["NEW_REQUEST", "REVIEWING_REQUEST", "DEVICE_CONFIRMATION_NEEDED", "WAITING_FOR_INFORMATION", "RECORDS_BEING_PREPARED", "REVIEW_REQUIRED", "READY_TO_GENERATE", "READY_TO_SEND"];

/** Keeps a working case's status in step with what is known (sent, follow-up, complete and cancelled are only set by hand). */
async function refreshStatus(a: Actor, cur: AuditRow): Promise<void> {
  if (!WORKING.includes(cur.status as AuditStatus)) return;
  const [v] = await db.select({ n: sql<number>`count(*)` }).from(auditVersions).where(eq(auditVersions.auditId, cur.id));
  const b = blockers(inputOf(cur));
  const next = workingStatus({ type: cur.auditType as AuditType, deviceAnswer: cur.deviceAnswer as DeviceAnswer | null, hasFile: (v?.n ?? 0) > 0, blockers: b.length });
  if (next === cur.status) return;
  await db.update(audits).set({ status: next, updatedAt: new Date().toISOString() }).where(eq(audits.id, cur.id));
  await addEvent(a, cur.id, "STATUS", "Status", cur.status, next);
}

const inputOf = (c: AuditRow) => ({
  type: c.auditType as AuditType,
  pharmacyName: c.pharmacyName,
  ncpdp: c.pharmacyNcpdp,
  startDate: c.startDate,
  endDate: c.endDate,
  deviceAnswer: c.deviceAnswer as DeviceAnswer | null,
  auditorName: c.auditorName,
  auditorEmail: c.auditorEmail,
  pbmName: c.pbmName,
  agency: c.agency,
  subtype: c.auditSubtype,
});

// ---------------------------------------------------------------------------------------------------------------------
// Preview and generate
// ---------------------------------------------------------------------------------------------------------------------

export type Preview = {
  blockers: string[];
  warnings: LineWarning[];
  columns: ColumnDef[];
  rows: ReportRow[];
  summary: { rows: number; invoices: number; products: number; units: number };
};

/** Works out the preview. Writes nothing, so a page can call it. */
export async function previewAudit(organizationId: string, cur: AuditRow): Promise<Preview> {
  const c = await withLatestPharmacy(organizationId, cur);
  const b = blockers(inputOf(c));
  let lines: SourceLine[] = [];
  if (c.buyerId && isDay(c.startDate) && isDay(c.endDate)) lines = await loadSourceLines(organizationId, c.buyerId, c.startDate as string, c.endDate as string, productKeysOf(c));
  const { columns, rows } = buildRows(c.auditType as AuditType, lines, { name: c.pharmacyName, ncpdp: c.pharmacyNcpdp, address: c.pharmacyAddress }, { includePharmacy: c.includePharmacy });
  const shown = dropBlankColumns(columns, rows);
  if (b.length === 0 && rows.length === 0) b.push("NO QUALIFYING TRANSACTIONS FOUND for this pharmacy, date range and product choice.");
  return { blockers: b, warnings: lineWarnings(lines), columns: shown, rows, summary: summarize(rows) };
}

/** Builds the Excel file from the current records and saves it as the next version, with the exact rows it was built from. */
export async function generateVersion(a: Actor, id: string): Promise<{ ok: true; versionId: string; version: number } | { ok: false; error: string }> {
  const cur0 = await getAudit(a.organizationId, id);
  if (!cur0) return { ok: false, error: "That audit wasn't found." };
  if (isClosed(cur0.status)) return { ok: false, error: "This audit is closed. Reopen it to generate a new file." };
  const cur = await syncPharmacy(a, cur0);
  const p = await previewAudit(a.organizationId, cur);
  if (p.blockers.length) return { ok: false, error: p.blockers[0] };
  const type = cur.auditType as AuditType;
  const [last] = await db.select({ v: sql<number>`coalesce(max(${auditVersions.version}), 0)` }).from(auditVersions).where(eq(auditVersions.auditId, id));
  const version = (last?.v ?? 0) + 1;
  const today = billingDateOf();
  const by = await userNameOf(a.userId);
  const buf = await buildAuditWorkbook(
    {
      type,
      caseNumber: cur.caseNumber,
      pharmacyName: type === "PBM" || cur.includePharmacy || type === "INTERNAL" ? cur.pharmacyName : null,
      ncpdp: cur.pharmacyNcpdp,
      start: cur.startDate as string,
      end: cur.endDate as string,
      auditor: [cur.auditorName, cur.auditorCompany].filter(Boolean).join(", ") || null,
      requestingOrganization: cur.pbmName || cur.agency || cur.auditorCompany || null,
      subtype: regSubtypeLabel(cur.auditSubtype),
      reference: cur.referenceNumber,
      generatedOn: today,
      generatedBy: by,
    },
    p.columns,
    p.rows,
  );
  const fileName = fileNameFor(type, cur.pharmacyName, cur.pharmacyNcpdp, cur.startDate as string, cur.endDate as string, version, { includePharmacy: cur.includePharmacy, caseNumber: cur.caseNumber });
  const hash = createHash("sha256").update(buf).digest("hex");
  const versionId = newId("aver");
  await db.insert(auditVersions).values({
    id: versionId,
    organizationId: a.organizationId,
    auditId: id,
    version,
    templateVersion: TEMPLATE_VERSION[type],
    fileName,
    fileData: buf.toString("base64"),
    fileBytes: buf.length,
    fileHash: hash,
    rowCount: p.rows.length,
    invoiceCount: p.summary.invoices,
    snapshotJson: JSON.stringify({ columns: p.columns, rows: p.rows, warnings: p.warnings.length }),
    filtersJson: JSON.stringify({ start: cur.startDate, end: cur.endDate, productScope: cur.productScope, products: productKeysOf(cur), includePharmacy: cur.includePharmacy, deviceAnswer: cur.deviceAnswer, moneyFree: !p.columns.some((c) => (MONEY_KEYS as readonly string[]).includes(c.key)) }),
    createdByUserId: a.userId,
    createdByName: by,
  });
  await addEvent(a, id, "GENERATED", `Excel version ${version} (${p.rows.length} rows, ${p.summary.invoices} invoices, ${TEMPLATE_VERSION[type]})`, null, fileName);
  const fresh = await getAudit(a.organizationId, id);
  if (fresh) await refreshStatus(a, fresh);
  return { ok: true, versionId, version };
}

export async function listVersions(organizationId: string, auditId: string): Promise<Omit<VersionRow, "fileData" | "snapshotJson">[]> {
  const rows = await db
    .select({
      id: auditVersions.id, organizationId: auditVersions.organizationId, auditId: auditVersions.auditId, version: auditVersions.version, templateVersion: auditVersions.templateVersion,
      fileName: auditVersions.fileName, fileBytes: auditVersions.fileBytes, fileHash: auditVersions.fileHash, rowCount: auditVersions.rowCount, invoiceCount: auditVersions.invoiceCount,
      filtersJson: auditVersions.filtersJson, createdByUserId: auditVersions.createdByUserId, createdByName: auditVersions.createdByName, sentAt: auditVersions.sentAt, createdAt: auditVersions.createdAt,
    })
    .from(auditVersions)
    .where(and(eq(auditVersions.organizationId, organizationId), eq(auditVersions.auditId, auditId)))
    .orderBy(desc(auditVersions.version));
  return rows;
}

/** The saved file, for the download route. Logs who downloaded it. */
export async function readVersionFile(a: Actor, versionId: string): Promise<{ fileName: string; bytes: Buffer; auditId: string; version: number } | null> {
  const [v] = await db.select().from(auditVersions).where(and(eq(auditVersions.organizationId, a.organizationId), eq(auditVersions.id, versionId))).limit(1);
  if (!v) return null;
  await addEvent(a, v.auditId, "DOWNLOADED", `Downloaded version ${v.version}`, null, v.fileName);
  return { fileName: v.fileName, bytes: Buffer.from(v.fileData, "base64"), auditId: v.auditId, version: v.version };
}

/** The saved rows of one version (what was really exported), for showing an old audit exactly as it was sent. */
export async function versionSnapshot(organizationId: string, versionId: string): Promise<{ columns: ColumnDef[]; rows: ReportRow[] } | null> {
  const [v] = await db.select({ s: auditVersions.snapshotJson }).from(auditVersions).where(and(eq(auditVersions.organizationId, organizationId), eq(auditVersions.id, versionId))).limit(1);
  if (!v) return null;
  try {
    const j = JSON.parse(v.s);
    return { columns: j.columns ?? [], rows: j.rows ?? [] };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Attachments, notes, sending, finishing
// ---------------------------------------------------------------------------------------------------------------------

export async function addAttachment(a: Actor, auditId: string, f: { fileName: string; contentType: string; bytes: Buffer; kind: "REQUEST" | "OTHER" }): Promise<{ ok: true } | { ok: false; error: string }> {
  const cur = await getAudit(a.organizationId, auditId);
  if (!cur) return { ok: false, error: "That audit wasn't found." };
  if (f.bytes.length === 0) return { ok: false, error: "That file is empty." };
  if (f.bytes.length > MAX_ATTACHMENT) return { ok: false, error: "That file is over 5 MB. Send a smaller copy." };
  const name = clean(f.fileName, 160) || "document";
  await db.insert(auditAttachments).values({
    id: newId("aatt"), organizationId: a.organizationId, auditId, kind: f.kind, fileName: name, contentType: clean(f.contentType, 80) || "application/octet-stream",
    fileData: f.bytes.toString("base64"), fileBytes: f.bytes.length, uploadedByUserId: a.userId, uploadedByName: await userNameOf(a.userId),
  });
  await addEvent(a, auditId, "FILE_ADDED", f.kind === "REQUEST" ? "Original audit request attached" : "Document attached", null, name);
  return { ok: true };
}

export async function listAttachments(organizationId: string, auditId: string) {
  return db
    .select({ id: auditAttachments.id, kind: auditAttachments.kind, fileName: auditAttachments.fileName, fileBytes: auditAttachments.fileBytes, uploadedByName: auditAttachments.uploadedByName, createdAt: auditAttachments.createdAt })
    .from(auditAttachments)
    .where(and(eq(auditAttachments.organizationId, organizationId), eq(auditAttachments.auditId, auditId)))
    .orderBy(asc(auditAttachments.createdAt));
}

export async function readAttachment(a: Actor, id: string): Promise<{ fileName: string; contentType: string; bytes: Buffer } | null> {
  const [r] = await db.select().from(auditAttachments).where(and(eq(auditAttachments.organizationId, a.organizationId), eq(auditAttachments.id, id))).limit(1);
  if (!r) return null;
  await addEvent(a, r.auditId, "DOWNLOADED", "Downloaded an attachment", null, r.fileName);
  return { fileName: r.fileName, contentType: r.contentType, bytes: Buffer.from(r.fileData, "base64") };
}

export async function addNote(a: Actor, auditId: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = clean(text, 2000);
  if (!t) return { ok: false, error: "Write the note first." };
  if (!(await getAudit(a.organizationId, auditId))) return { ok: false, error: "That audit wasn't found." };
  await addEvent(a, auditId, "NOTE", t);
  return { ok: true };
}

export async function listEvents(organizationId: string, auditId: string) {
  return db.select().from(auditEvents).where(and(eq(auditEvents.organizationId, organizationId), eq(auditEvents.auditId, auditId))).orderBy(desc(auditEvents.createdAt), desc(auditEvents.id));
}

/** Records that the file went out (sent by hand in this phase): who it went to and which version. */
export async function markSent(a: Actor, auditId: string, versionId: string, to: string, cc: string, subject: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const cur = await getAudit(a.organizationId, auditId);
  if (!cur) return { ok: false, error: "That audit wasn't found." };
  if (isClosed(cur.status)) return { ok: false, error: "This audit is closed." };
  const [v] = await db.select().from(auditVersions).where(and(eq(auditVersions.organizationId, a.organizationId), eq(auditVersions.auditId, auditId), eq(auditVersions.id, versionId))).limit(1);
  if (!v) return { ok: false, error: "Choose which file version was sent." };
  const toC = clean(to, 300);
  if (!toC) return { ok: false, error: "Enter who it was sent to." };
  if (cur.auditType === "PBM") {
    // The last check before a PBM file goes out: the saved columns hold no money, and the pharmacy's NCPDP is on the case.
    const snap = await versionSnapshot(a.organizationId, versionId);
    if (!snap || snap.columns.some((c) => (MONEY_KEYS as readonly string[]).includes(c.key) || c.kind === "money")) return { ok: false, error: "That file has pricing or shipping in it, so it can't go to a PBM. Generate it again." };
    if (!cur.pharmacyNcpdp) return { ok: false, error: "This PBM audit has no NCPDP number." };
    if (cur.deviceAnswer !== "YES") return { ok: false, error: "The device question hasn't been answered YES." };
  }
  const now = new Date().toISOString();
  await db.update(auditVersions).set({ sentAt: now }).where(eq(auditVersions.id, versionId));
  await db.update(audits).set({ status: "SENT", sentTo: toC, sentCc: nz(clean(cc, 300)), sentSubject: nz(clean(subject, 200)), sentAt: now, sentByUserId: a.userId, updatedAt: now }).where(eq(audits.id, auditId));
  await addEvent(a, auditId, "SENT", `Version ${v.version} (${v.fileName}) sent to ${toC}${cc ? `, copy to ${clean(cc, 300)}` : ""}`);
  await db.insert(auditSends).values({
    id: newId("asnd"), organizationId: a.organizationId, auditId, versionId, method: "HAND", fromAddress: null, toAddresses: toC, ccAddresses: nz(clean(cc, 300)),
    subject: clean(subject, 200) || suggestedSubject(cur), bodyText: null,
    attachmentsJson: JSON.stringify([{ name: v.fileName, bytes: v.fileBytes, sha256: v.fileHash, kind: "EXCEL", refId: v.id }]), checksJson: null, sentByUserId: a.userId, sentByName: await userNameOf(a.userId),
  });
  return { ok: true };
}

export async function setStatus(a: Actor, auditId: string, to: "FOLLOW_UP_REQUIRED" | "COMPLETE" | "CANCELLED" | "SENT"): Promise<{ ok: true } | { ok: false; error: string }> {
  const cur = await getAudit(a.organizationId, auditId);
  if (!cur) return { ok: false, error: "That audit wasn't found." };
  if (isClosed(cur.status)) return { ok: false, error: "This audit is already closed." };
  if (to === "COMPLETE" && !cur.sentAt && cur.status !== "FOLLOW_UP_REQUIRED") return { ok: false, error: "Mark it as sent first, or cancel it if it was never sent." };
  const now = new Date().toISOString();
  await db.update(audits).set({ status: to, updatedAt: now, ...(to === "COMPLETE" ? { completedAt: now, completedByUserId: a.userId } : {}) }).where(eq(audits.id, auditId));
  await addEvent(a, auditId, "STATUS", "Status", cur.status, to);
  return { ok: true };
}

/** Management reopens a closed case. A reason is required and recorded. */
export async function reopenAudit(a: Actor, auditId: string, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const cur = await getAudit(a.organizationId, auditId);
  if (!cur) return { ok: false, error: "That audit wasn't found." };
  if (!isClosed(cur.status)) return { ok: false, error: "This audit isn't closed." };
  const why = clean(reason, 500);
  if (why.length < 5) return { ok: false, error: "Say why you are reopening it (at least a few words)." };
  await db.update(audits).set({ status: "REVIEW_REQUIRED", completedAt: null, completedByUserId: null, updatedAt: new Date().toISOString() }).where(eq(audits.id, auditId));
  await addEvent(a, auditId, "REOPENED", why, cur.status, "REVIEW_REQUIRED");
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------------------------------------------------

export type AuditFilters = { q?: string; type?: string; status?: string; from?: string; to?: string };

export async function listAudits(organizationId: string, f: AuditFilters = {}, limit = 200): Promise<AuditRow[]> {
  const conds = [eq(audits.organizationId, organizationId)];
  const q = clean(f.q ?? "", 80);
  if (q) conds.push(or(like(audits.caseNumber, `%${q}%`), like(audits.pharmacyName, `%${q}%`), like(audits.pharmacyNcpdp, `%${q}%`), like(audits.auditorName, `%${q}%`), like(audits.auditorCompany, `%${q}%`), like(audits.pbmName, `%${q}%`), like(audits.agency, `%${q}%`), like(audits.referenceNumber, `%${q}%`))!);
  if (f.type) conds.push(eq(audits.auditType, f.type));
  if (f.status) conds.push(eq(audits.status, f.status));
  if (f.from && isDay(f.from)) conds.push(gte(sql`substr(${audits.createdAt}, 1, 10)`, f.from));
  if (f.to && isDay(f.to)) conds.push(lte(sql`substr(${audits.createdAt}, 1, 10)`, f.to));
  return db.select().from(audits).where(and(...conds)).orderBy(desc(audits.createdAt)).limit(limit);
}

export async function statusCounts(organizationId: string): Promise<Record<string, number>> {
  const rows = await db.select({ s: audits.status, n: sql<number>`count(*)` }).from(audits).where(eq(audits.organizationId, organizationId)).groupBy(audits.status);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.s] = r.n;
  return out;
}

/** Subject line suggestion for the send record. */
export const suggestedSubject = (c: AuditRow) => (c.auditType === "PBM" && c.pharmacyNcpdp ? pbmSubject(c.pharmacyName, c.pharmacyNcpdp) : `${c.pharmacyName} purchase records ${c.startDate ?? ""} to ${c.endDate ?? ""}`.trim());
