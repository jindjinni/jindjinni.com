// Sending an audit by email from the company's own connected mailbox (Accounts -> Audit Center, Distribution only).
// Nothing is sent without a person pressing SEND on the review screen, every check is run again here on the server, the Sales invoices
// are only read, and every send is written once to `audit_sends` (never changed, never deleted) together with the exact files.

import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { auditAttachments, auditSends, auditVersions, audits, salesDocuments } from "@/db/schema";
import { newId } from "@/lib/ids";
import { COUNTED_INVOICE_STATUSES, MONEY_KEYS, isClosed, type AuditType, type ColumnDef, type ReportRow } from "@/lib/audit-rules";
import { MAX_EMAIL_BYTES, bodyToHtml, defaultBody, defaultRecipients, defaultSubject, fileIsCurrent, parseAddresses, sendChecks, type CaseForEmail, type FileFilters, type SendCheck } from "@/lib/audit-email";
import { mergePdfs } from "@/lib/audit-pdf";
import { addEvent, getAudit, userNameOf, type Actor, type AuditRow } from "@/lib/audit-service";
import { getConnection, sendOrgEmail } from "@/lib/email-connector";
import { buildSalesPdf } from "@/lib/sales-pdf";
import { getDocument, pdfInputFor, resolveFrom } from "@/lib/sales-service";

const clean = (s: unknown, max = 200) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");

export type InvoiceMode = "NONE" | "ALL" | "SELECTED";

const caseForEmail = (c: AuditRow): CaseForEmail => ({
  caseNumber: c.caseNumber,
  type: c.auditType as AuditType,
  pharmacyName: c.pharmacyName,
  pharmacyEmail: c.pharmacyEmail,
  pharmacyNcpdp: c.pharmacyNcpdp,
  auditorName: c.auditorName,
  auditorEmail: c.auditorEmail,
  agency: c.agency,
  referenceNumber: c.referenceNumber,
  startDate: c.startDate,
  endDate: c.endDate,
  includePharmacy: c.includePharmacy,
});

function productKeys(c: AuditRow): string[] | null {
  if (c.productScope !== "SELECTED" || !c.productKeysJson) return null;
  try {
    const v = JSON.parse(c.productKeysJson);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}

type LoadedVersion = { id: string; version: number; fileName: string; fileData: string; fileBytes: number; fileHash: string; columns: ColumnDef[]; rows: ReportRow[]; filters: FileFilters | null; warnings: number };

async function loadVersion(organizationId: string, auditId: string, versionId: string): Promise<LoadedVersion | null> {
  const [v] = await db.select().from(auditVersions).where(and(eq(auditVersions.organizationId, organizationId), eq(auditVersions.auditId, auditId), eq(auditVersions.id, versionId))).limit(1);
  if (!v) return null;
  let columns: ColumnDef[] = [];
  let rows: ReportRow[] = [];
  let warnings = 0;
  let filters: FileFilters | null = null;
  try {
    const j = JSON.parse(v.snapshotJson);
    columns = j.columns ?? [];
    rows = j.rows ?? [];
    warnings = Number(j.warnings) || 0;
  } catch {
    /* an unreadable snapshot means the checks below fail closed */
  }
  try {
    const f = JSON.parse(v.filtersJson ?? "null");
    if (f) filters = { start: f.start ?? null, end: f.end ?? null, productScope: f.productScope ?? "ALL", products: Array.isArray(f.products) ? f.products : null, includePharmacy: !!f.includePharmacy, deviceAnswer: f.deviceAnswer ?? null };
  } catch {
    filters = null;
  }
  return { id: v.id, version: v.version, fileName: v.fileName, fileData: v.fileData, fileBytes: v.fileBytes, fileHash: v.fileHash, columns, rows, filters, warnings };
}

// ---------------------------------------------------------------------------------------------------------------------
// Invoice copies
// ---------------------------------------------------------------------------------------------------------------------

export type InvoiceInFile = { number: string; date: string | null; docId: string | null; available: boolean };

/** The invoices that appear in a version's rows, matched to this pharmacy's real invoices (read only). */
export async function invoicesInFile(organizationId: string, c: AuditRow, rows: ReportRow[]): Promise<InvoiceInFile[]> {
  const dates = new Map<string, string | null>();
  for (const r of rows) {
    const n = typeof r.invoiceNumber === "string" ? r.invoiceNumber : "";
    if (n && !dates.has(n)) dates.set(n, typeof r.date === "string" ? r.date : null);
  }
  const numbers = [...dates.keys()];
  if (!numbers.length || !c.buyerId) return [];
  const docs = await db
    .select({ id: salesDocuments.id, number: salesDocuments.number, status: salesDocuments.status })
    .from(salesDocuments)
    .where(and(eq(salesDocuments.organizationId, organizationId), eq(salesDocuments.kind, "INVOICE"), eq(salesDocuments.buyerId, c.buyerId), inArray(salesDocuments.number, numbers)));
  const byNumber = new Map(docs.map((d) => [d.number, d]));
  return numbers.map((n) => {
    const d = byNumber.get(n);
    const ok = !!d && (COUNTED_INVOICE_STATUSES as readonly string[]).includes(d.status);
    return { number: n, date: dates.get(n) ?? null, docId: ok && d ? d.id : null, available: ok };
  });
}

/** One PDF holding the chosen invoices (in file order). Invoices that can't be found are listed, never silently skipped. */
async function buildInvoiceCopies(organizationId: string, list: InvoiceInFile[], mode: InvoiceMode, chosen: string[]): Promise<{ pdf: Buffer | null; included: string[]; missing: string[] }> {
  if (mode === "NONE") return { pdf: null, included: [], missing: [] };
  const wanted = mode === "ALL" ? list : list.filter((i) => chosen.includes(i.number));
  const parts: Uint8Array[] = [];
  const included: string[] = [];
  const missing: string[] = [];
  for (const inv of wanted) {
    const d = inv.docId ? await getDocument(organizationId, inv.docId) : null;
    if (!d) {
      missing.push(inv.number);
      continue;
    }
    parts.push(await buildSalesPdf(await pdfInputFor(organizationId, d)));
    included.push(inv.number);
  }
  return { pdf: parts.length ? Buffer.from(await mergePdfs(parts)) : null, included, missing };
}

// ---------------------------------------------------------------------------------------------------------------------
// The review screen
// ---------------------------------------------------------------------------------------------------------------------

export type SendRow = typeof auditSends.$inferSelect;

export async function listSends(organizationId: string, auditId: string): Promise<SendRow[]> {
  return db.select().from(auditSends).where(and(eq(auditSends.organizationId, organizationId), eq(auditSends.auditId, auditId))).orderBy(desc(auditSends.sentAt), desc(auditSends.id));
}

export type MailboxState = { state: "NONE" | "ACTIVE" | "NEEDS_RECONNECT"; email: string | null };
export async function mailboxOf(organizationId: string): Promise<MailboxState> {
  const c = await getConnection(organizationId);
  if (!c) return { state: "NONE", email: null };
  return { state: c.status === "ACTIVE" ? "ACTIVE" : "NEEDS_RECONNECT", email: c.accountEmail };
}

export type ReviewData = {
  audit: AuditRow;
  versions: { id: string; version: number; fileName: string; fileBytes: number; rowCount: number; invoiceCount: number; createdAt: string; createdByName: string | null; sentAt: string | null }[];
  versionId: string | null;
  attachments: { id: string; kind: string; fileName: string; fileBytes: number }[];
  invoices: InvoiceInFile[];
  defaults: { to: string; cc: string; subject: string; body: string };
  mailbox: MailboxState;
  sends: SendRow[];
};

/** Everything the review screen shows (reads only). */
export async function reviewData(organizationId: string, audit: AuditRow, wantedVersionId: string | null): Promise<ReviewData> {
  const versions = await db
    .select({ id: auditVersions.id, version: auditVersions.version, fileName: auditVersions.fileName, fileBytes: auditVersions.fileBytes, rowCount: auditVersions.rowCount, invoiceCount: auditVersions.invoiceCount, createdAt: auditVersions.createdAt, createdByName: auditVersions.createdByName, sentAt: auditVersions.sentAt })
    .from(auditVersions)
    .where(and(eq(auditVersions.organizationId, organizationId), eq(auditVersions.auditId, audit.id)))
    .orderBy(desc(auditVersions.version));
  const versionId = versions.find((v) => v.id === wantedVersionId)?.id ?? versions[0]?.id ?? null;
  const attachments = await db
    .select({ id: auditAttachments.id, kind: auditAttachments.kind, fileName: auditAttachments.fileName, fileBytes: auditAttachments.fileBytes })
    .from(auditAttachments)
    .where(and(eq(auditAttachments.organizationId, organizationId), eq(auditAttachments.auditId, audit.id), inArray(auditAttachments.kind, ["REQUEST", "OTHER"])))
    .orderBy(asc(auditAttachments.createdAt));
  const v = versionId ? await loadVersion(organizationId, audit.id, versionId) : null;
  const invoices = v ? await invoicesInFile(organizationId, audit, v.rows) : [];
  const from = await resolveFrom(organizationId);
  const ce = caseForEmail(audit);
  const rec = defaultRecipients(ce);
  return {
    audit,
    versions,
    versionId,
    attachments,
    invoices,
    defaults: { to: rec.to, cc: rec.cc, subject: defaultSubject(ce), body: defaultBody(ce, from.name) },
    mailbox: await mailboxOf(organizationId),
    sends: await listSends(organizationId, audit.id),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Checking and sending
// ---------------------------------------------------------------------------------------------------------------------

export type SendForm = {
  versionId: string;
  to: string;
  cc: string;
  subject: string;
  body: string;
  attachmentIds: string[];
  invoiceMode: InvoiceMode;
  invoiceNumbers: string[];
};

export type CheckResult = { ok: true; checks: SendCheck[]; warnings: string[]; canSend: boolean; sizeBytes: number } | { ok: false; error: string };

type Prepared = {
  audit: AuditRow;
  version: LoadedVersion;
  to: string[];
  cc: string[];
  attachments: { id: string; kind: string; fileName: string; contentType: string; data: Buffer }[];
  invoices: { pdf: Buffer | null; included: string[]; missing: string[] };
  result: Extract<CheckResult, { ok: true }>;
};

async function prepare(a: Actor, isManager: boolean, auditId: string, f: SendForm): Promise<{ ok: true; p: Prepared } | { ok: false; error: string }> {
  const audit = await getAudit(a.organizationId, auditId);
  if (!audit) return { ok: false, error: "That audit wasn't found." };
  if (isClosed(audit.status)) return { ok: false, error: "This audit is closed. Reopen it to send." };
  const version = await loadVersion(a.organizationId, auditId, f.versionId);
  if (!version) return { ok: false, error: "Choose which Excel file version to send." };
  const type = audit.auditType as AuditType;

  const toP = parseAddresses(f.to);
  const ccP = parseAddresses(f.cc);
  if (toP.bad.length || ccP.bad.length) return { ok: false, error: `"${[...toP.bad, ...ccP.bad][0]}" doesn't look like an email address.` };
  if (toP.list.length > 1) return { ok: false, error: "Put one address in To. Put anyone else in CC." };
  if (ccP.tooMany) return { ok: false, error: "That's too many people in CC (10 at most)." };
  if (type === "REGULATORY" && !isManager) {
    const extra = ccP.list.filter((x) => x !== (audit.auditorEmail ?? "").toLowerCase());
    if (extra.length) return { ok: false, error: "Only an Admin or the Owner can copy someone on a regulatory email." };
  }

  // The request and other documents chosen for this email must belong to this case.
  const atts: Prepared["attachments"] = [];
  if (f.attachmentIds.length) {
    const rows = await db
      .select()
      .from(auditAttachments)
      .where(and(eq(auditAttachments.organizationId, a.organizationId), eq(auditAttachments.auditId, auditId), inArray(auditAttachments.id, f.attachmentIds), inArray(auditAttachments.kind, ["REQUEST", "OTHER"])));
    for (const r of rows) atts.push({ id: r.id, kind: r.kind, fileName: r.fileName, contentType: r.contentType, data: Buffer.from(r.fileData, "base64") });
  }
  const allRequests = await db
    .select({ id: auditAttachments.id })
    .from(auditAttachments)
    .where(and(eq(auditAttachments.organizationId, a.organizationId), eq(auditAttachments.auditId, auditId), eq(auditAttachments.kind, "REQUEST")));

  const mode: InvoiceMode = f.invoiceMode;
  const list = await invoicesInFile(a.organizationId, audit, version.rows);
  const chosen = mode === "SELECTED" ? f.invoiceNumbers.filter((n) => list.some((i) => i.number === n)) : [];
  if (mode === "SELECTED" && chosen.length === 0) return { ok: false, error: "Tick the invoices to include, or choose None." };
  const invoices = await buildInvoiceCopies(a.organizationId, list, mode, chosen);

  const excel = Buffer.from(version.fileData, "base64");
  const total = excel.length + atts.reduce((n, x) => n + x.data.length, 0) + (invoices.pdf?.length ?? 0);
  const box = await mailboxOf(a.organizationId);
  const res = sendChecks({
    type,
    pharmacyName: audit.pharmacyName,
    pharmacyEmail: audit.pharmacyEmail,
    ncpdp: audit.pharmacyNcpdp,
    startDate: audit.startDate,
    endDate: audit.endDate,
    deviceAnswer: audit.deviceAnswer,
    auditorEmail: audit.auditorEmail,
    to: toP.list,
    cc: ccP.list,
    columns: version.columns,
    fileCurrent: fileIsCurrent(version.filters, { start: audit.startDate, end: audit.endDate, productScope: audit.productScope, products: productKeys(audit), includePharmacy: audit.includePharmacy, deviceAnswer: audit.deviceAnswer, type }),
    isManager,
    requestOnCase: allRequests.length > 0,
    requestTicked: atts.some((x) => x.kind === "REQUEST"),
    invoiceCopies: mode,
    invoiceCopiesMissing: invoices.missing.length + (mode === "ALL" ? list.filter((i) => !i.available && !invoices.missing.includes(i.number)).length : 0),
    fileWarnings: version.warnings,
    totalBytes: total,
    mailboxReady: box.state === "ACTIVE",
  });
  // A file with money in it never goes to a PBM, whatever the checks say.
  if (type === "PBM" && version.columns.some((c) => (MONEY_KEYS as readonly string[]).includes(c.key) || c.kind === "money")) res.canSend = false;
  return { ok: true, p: { audit, version, to: toP.list, cc: ccP.list, attachments: atts, invoices, result: { ok: true, checks: res.checks, warnings: res.warnings, canSend: res.canSend, sizeBytes: total } } };
}

/** Runs the checks for the screen. Reads only: it builds the invoice copies in memory to measure them and sends nothing. */
export async function checkSend(a: Actor, isManager: boolean, auditId: string, f: SendForm): Promise<CheckResult> {
  const r = await prepare(a, isManager, auditId, f);
  return r.ok ? r.p.result : r;
}

export type SendOutcome = { ok: true; sendId: string; warning?: string } | { ok: false; error: string };

/** The one place an audit email is sent. Re-checks everything, sends from the company's mailbox, then records exactly what went out. */
export async function sendAudit(a: Actor, isManager: boolean, auditId: string, f: SendForm): Promise<SendOutcome> {
  const subject = clean(f.subject, 200);
  const body = (f.body ?? "").replace(/\r/g, "").trim().slice(0, 10000);
  if (!subject) return { ok: false, error: "Enter a subject." };
  if (!body) return { ok: false, error: "Write the message." };
  const r = await prepare(a, isManager, auditId, f);
  if (!r.ok) return r;
  const { p } = r;
  if (!p.result.canSend) {
    const bad = p.result.checks.find((c) => !c.ok);
    return { ok: false, error: bad ? `${bad.label}: ${bad.note ?? "not ready"}` : "Not every check is green yet." };
  }
  if (p.result.sizeBytes > MAX_EMAIL_BYTES) return { ok: false, error: "The attachments are too large for one email." };

  const from = await resolveFrom(a.organizationId);
  const excel = Buffer.from(p.version.fileData, "base64");
  const files: { filename: string; content: Buffer }[] = [{ filename: p.version.fileName, content: excel }];
  const record: { name: string; bytes: number; sha256: string; kind: string; refId: string | null }[] = [{ name: p.version.fileName, bytes: excel.length, sha256: p.version.fileHash, kind: "EXCEL", refId: p.version.id }];
  for (const x of p.attachments) {
    files.push({ filename: x.fileName, content: x.data });
    record.push({ name: x.fileName, bytes: x.data.length, sha256: createHash("sha256").update(x.data).digest("hex"), kind: x.kind, refId: x.id });
  }
  let copiesName: string | null = null;
  if (p.invoices.pdf) {
    copiesName = `${p.audit.caseNumber}_InvoiceCopies.pdf`;
    files.push({ filename: copiesName, content: p.invoices.pdf });
    record.push({ name: copiesName, bytes: p.invoices.pdf.length, sha256: createHash("sha256").update(p.invoices.pdf).digest("hex"), kind: "INVOICE_COPIES", refId: null });
  }

  // Only the connected mailbox: there is no fallback to anyone else's address.
  const box = await mailboxOf(a.organizationId);
  if (box.state !== "ACTIVE") return { ok: false, error: "Connect the company's email in Settings → Connectors first." };
  const sent = await sendOrgEmail(a.organizationId, {
    to: p.to[0],
    cc: p.cc,
    subject,
    text: body,
    html: bodyToHtml(body),
    fromName: from.name,
    replyTo: from.email,
    attachments: files,
  });
  if (!sent.ok) {
    await addEvent(a, auditId, "EMAIL_FAILED", `Email to ${p.to[0]} was not sent: ${sent.error}`);
    return { ok: false, error: sent.error };
  }

  // From here the email is out: record it. A problem while recording is reported, never hidden.
  const id = newId("asnd");
  const now = new Date().toISOString();
  const by = await userNameOf(a.userId);
  let warning: string | undefined;
  try {
    if (p.invoices.pdf && copiesName) {
      await db.insert(auditAttachments).values({
        id: newId("aatt"), organizationId: a.organizationId, auditId, kind: "INVOICE_COPIES", fileName: copiesName, contentType: "application/pdf",
        fileData: p.invoices.pdf.toString("base64"), fileBytes: p.invoices.pdf.length, uploadedByUserId: a.userId, uploadedByName: by,
      });
    }
    await db.insert(auditSends).values({
      id, organizationId: a.organizationId, auditId, versionId: p.version.id, method: "EMAIL", fromAddress: sent.from, toAddresses: p.to.join(", "), ccAddresses: p.cc.length ? p.cc.join(", ") : null,
      subject, bodyText: body, attachmentsJson: JSON.stringify(record), checksJson: JSON.stringify(p.result.checks.map((c) => c.label)), sentByUserId: a.userId, sentByName: by, sentAt: now,
    });
    await db.update(auditVersions).set({ sentAt: now }).where(eq(auditVersions.id, p.version.id));
    await db
      .update(audits)
      .set({ status: "SENT", sentTo: p.to.join(", "), sentCc: p.cc.length ? p.cc.join(", ") : null, sentSubject: subject, sentAt: now, sentByUserId: a.userId, updatedAt: now })
      .where(and(eq(audits.organizationId, a.organizationId), eq(audits.id, auditId)));
    await addEvent(a, auditId, "SENT", `Version ${p.version.version} (${p.version.fileName}) emailed to ${p.to.join(", ")}${p.cc.length ? `, copy to ${p.cc.join(", ")}` : ""} from ${sent.from ?? "the company mailbox"}`, null, subject);
  } catch (e) {
    console.error("[audit-send] email went out but recording failed:", e);
    warning = "The email was sent, but saving the record failed. Add a note on the case saying it was sent.";
  }
  if (p.invoices.missing.length && !warning) warning = `Invoice copies left out (not available): ${p.invoices.missing.join(", ")}.`;
  return { ok: true, sendId: id, warning };
}

/** The saved invoice copies / any file that went out in a send, for showing the exact file again. */
export async function sendFiles(organizationId: string, auditId: string, sendId: string) {
  const [s] = await db.select().from(auditSends).where(and(eq(auditSends.organizationId, organizationId), eq(auditSends.auditId, auditId), eq(auditSends.id, sendId))).limit(1);
  if (!s) return null;
  try {
    return JSON.parse(s.attachmentsJson ?? "[]") as { name: string; bytes: number; sha256: string; kind: string; refId: string | null }[];
  } catch {
    return [];
  }
}
