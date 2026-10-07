// Receiving's server-side workflows that more than one action needs:
// the inventory log written on submit, and sending the customer emails.
// Nothing here checks the signed-in user -- callers (the actions) do that and
// pass the company in.

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  purchasingAuditLog,
  purchasingCategories,
  purchasingProducts,
  receivingIntakeLines,
  receivingIntakeLogs,
  receivingPackagePhotos,
  receivingCustomerEmails,
  receivingPackages,
  receivingRecallChecks,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import { sendCustomerEmail, type EmailAttachment } from "@/lib/email";
import { getReceivingPackage } from "@/lib/receiving-queries";
import { buildCustomerEmail, buildPackagingWarning } from "@/lib/receiving-emails";
import { isRecalledResult, rowRecallState } from "@/lib/receiving-recall";
import { buildDbLines, finalPayout, pickEmailTemplate, weekOf } from "@/lib/receiving-rules";
import { storage } from "@/lib/receiving-storage";

export type OrgRef = { organizationId: string; userId: string; organizationName: string };

export async function auditReceiving(org: OrgRef, quotationId: string, field: string, note: string) {
  await db.insert(purchasingAuditLog).values({
    id: newId("paudit"),
    organizationId: org.organizationId,
    userId: org.userId,
    recordType: "quotation",
    recordId: quotationId,
    fieldName: field,
    previousValue: null,
    newValue: null,
    note,
  });
}

// ---- inventory log ---------------------------------------------------------

export async function deleteIntakeLog(packageId: string) {
  // Lines go with the header (cascade).
  await db.delete(receivingIntakeLogs).where(eq(receivingIntakeLogs.packageId, packageId));
}

/** (Re)writes the ledger for a submitted shipment: one header, one line per product that actually arrived. */
export async function writeIntakeLog(org: OrgRef, packageId: string) {
  const data = await getReceivingPackage(org.organizationId, packageId);
  if (!data) return;
  await deleteIntakeLog(packageId);
  const logId = newId("rlog");
  const receivedFrom = data.brief.customerName;
  await db.insert(receivingIntakeLogs).values({
    id: logId,
    organizationId: org.organizationId,
    packageId,
    receivedFrom,
    receivedAt: data.pkg.receivedAt,
    receivedByUserId: data.pkg.receivedByUserId ?? data.pkg.startedByUserId ?? null,
    startedAt: data.pkg.startedAt ?? data.pkg.createdAt,
    pricePaid: finalPayout(data.brief.grandTotal, data.pkg.adjustedOrderTotal),
    notes: `Auto-logged from Receiving. Order: ${data.brief.quotationNumber}`,
    loggedByUserId: org.userId,
  });
  // Product code + brand as they are right now, saved on the line so later catalog edits never rewrite history.
  const productIds = Array.from(new Set(data.items.map((i) => i.productId).filter((x): x is string => !!x)));
  const meta = new Map<string, { code: string | null; brand: string | null }>();
  if (productIds.length > 0) {
    const rows = await db
      .select({ id: purchasingProducts.id, code: purchasingProducts.productCode, brand: purchasingCategories.name })
      .from(purchasingProducts)
      .leftJoin(purchasingCategories, eq(purchasingCategories.id, purchasingProducts.categoryId))
      .where(and(inArray(purchasingProducts.id, productIds), eq(purchasingProducts.organizationId, org.organizationId)));
    for (const r of rows) meta.set(r.id, { code: r.code, brand: r.brand });
  }
  const agent = data.pkg.receivedByUserId ?? data.pkg.startedByUserId ?? null;
  const checks = await db.select().from(receivingRecallChecks).where(and(eq(receivingRecallChecks.packageId, packageId), eq(receivingRecallChecks.organizationId, org.organizationId)));
  for (const i of data.items) {
    if (!i.productName.trim() || i.wasReceived === "NO" || !i.quantityReceived || i.quantityReceived <= 0) continue;
    const m = i.productId ? meta.get(i.productId) : undefined;
    const rowChecks = checks.filter((c) => c.itemId === i.id);
    const recallState = rowRecallState(rowChecks);
    const recallName = rowChecks.filter((c) => isRecalledResult(c.result) && c.recallName).map((c) => c.recallName as string)[0] ?? null;
    for (const l of buildDbLines({
      quantityReceived: i.quantityReceived,
      needsReturn: i.needsReturn,
      quantityToReturn: i.quantityToReturn,
      lotNumber: i.lotNumber,
      expirationDate: i.expirationDate,
      lots: i.lots,
    })) {
      await db.insert(receivingIntakeLines).values({
        id: newId("rline"),
        organizationId: org.organizationId,
        logId,
        productId: i.productId,
        productName: i.productName,
        productCode: m?.code ?? null,
        brand: m?.brand ?? null,
        ndc: i.ndc || null,
        lotNumber: l.lotNumber,
        quantity: l.quantity,
        condition: i.condition || null,
        expirationDate: l.expirationDate,
        expirationEarliest: l.expirationEarliest,
        expirationLatest: l.expirationLatest,
        weekOf: weekOf(data.pkg.receivedAt),
        receivedFrom,
        receivedAt: data.pkg.receivedAt,
        receivedByUserId: agent,
        needsReturn: i.needsReturn || null,
        quantityToReturn: l.quantityToReturn,
        quantityAccepted: l.quantityAccepted,
        returnStatus: i.returnStatus || null,
        itemNotes: i.notes || null,
        sourceItemId: i.id,
        recallStatus: recallState === "NONE" ? null : recallState,
        recallName,
      });
    }
  }
}

/** When Accounts changes the payout after submission, keep the ledger's "price paid" in step. */
export async function refreshIntakeLogPrice(packageId: string, price: number) {
  await db.update(receivingIntakeLogs).set({ pricePaid: price, updatedAt: sql`(current_timestamp)` }).where(eq(receivingIntakeLogs.packageId, packageId));
}

// ---- customer emails -------------------------------------------------------

const MAX_ATTACH_BYTES = 20 * 1024 * 1024;
const MAX_ATTACH_FILES = 20;

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  return Buffer.from(await new Response(stream as unknown as BodyInit).arrayBuffer());
}

function splitEmails(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
}

export type DeliverResult = { ok: true; template: string; attached: number; skipped: number } | { ok: false; error: string };

type PackageData = NonNullable<Awaited<ReturnType<typeof getReceivingPackage>>>;
const INSPECTION_KINDS = ["DAMAGE", "PACKAGING_ISSUE", "ITEM_DAMAGE", "ITEM_DISCREPANCY"];

export type EmailPlan = {
  template: string;
  built: ReturnType<typeof buildCustomerEmail>;
  to: string | null;
  isAdjustment: boolean;
  /** The stored files that go with this email (payment receipt, revised invoice, note photos, inspection photos). */
  wanted: PackageData["photos"];
};

/**
 * What the email for this shipment looks like and what goes with it -- subject, body, the files to attach.
 * Nothing is read from storage and nothing is sent, so the Customer Service screen can show exactly what the
 * customer will get, and deliverCustomerEmail sends the very same thing.
 */
export function planCustomerEmail(orgName: string, data: PackageData, kind: "STATUS" | "WARNING"): EmailPlan {
  const { pkg, brief, settings } = data;
  const companyName = settings.fromName.trim() || orgName;
  const orderLabel = [brief.quotationNumber, pkg.trackingNumber ?? brief.trackingNumber].filter(Boolean).join(" — ");
  const to = brief.email?.trim() || null;
  if (kind === "WARNING") {
    const built = buildPackagingWarning({ companyName, customerName: brief.customerName, orderLabel, packagingGuideUrl: settings.packagingGuideUrl || null });
    return { template: "PACKAGING_WARNING", built, to, isAdjustment: false, wanted: [] };
  }
  const template = pickEmailTemplate(pkg);
  const built = buildCustomerEmail(template, {
    companyName,
    customerName: brief.customerName,
    orderLabel,
    orderTotal: brief.grandTotal,
    adjustedOrderTotal: pkg.adjustedOrderTotal,
    adjustmentAmount: pkg.adjustmentAmountEmail,
    customerNote: pkg.customerEmailNote,
    adjustmentDetails: pkg.adjustmentDetails,
    quoteLinkUrl: settings.quoteLinkUrl || null,
    packagingGuideUrl: settings.packagingGuideUrl || null,
  });
  // Adjustment emails also carry the inspection photos (damage / discrepancy / packaging issue) the email refers to.
  const isAdjustment = template === "ADJUSTMENT_ONLY" || template === "ADJUSTMENT_PACKAGING";
  const wanted = data.photos
    .filter((p) => (!p.itemId && (built.attachKinds as string[]).includes(p.kind)) || (isAdjustment && INSPECTION_KINDS.includes(p.kind)))
    .slice(0, MAX_ATTACH_FILES);
  return { template, built, to, isAdjustment, wanted };
}

/**
 * Sends the shipment's customer email.
 *  - "STATUS": the "package received & processed" email that matches the shipment (standard / packaging notice / adjustment).
 *  - "WARNING": the stand-alone packaging requirements warning.
 * Stamps customerNotifiedAt / packagingWarningSentAt and writes the email log only when the send worked.
 */
export async function deliverCustomerEmail(org: OrgRef, packageId: string, kind: "STATUS" | "WARNING"): Promise<DeliverResult> {
  const data = await getReceivingPackage(org.organizationId, packageId);
  if (!data) return { ok: false, error: "That shipment wasn't found." };
  if (!data.settings.emailsEnabled) return { ok: false, error: "Customer emails are turned off. An admin can turn them on under Email Settings." };
  const { pkg, settings } = data;
  const plan = planCustomerEmail(org.organizationName, data, kind);
  const to = plan.to;
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { ok: false, error: "This customer has no valid email address on the order." };
  if (kind === "STATUS") {
    if (pkg.status === "IN_PROGRESS") return { ok: false, error: "Submit receiving first. The customer isn't told anything until the package is processed." };
    if (pkg.accountsStatus !== "PAID") return { ok: false, error: "Accounts Status must be Paid before the customer is notified." };
  }
  const { template, built, isAdjustment, wanted } = plan;

  // Attachments: the payment confirmation, revised invoice and note photos that apply to this email.
  const attachments: EmailAttachment[] = [];
  let skipped = 0;
  let bytes = 0;
  for (const p of wanted) {
    const [row] = await db.select().from(receivingPackagePhotos).where(and(eq(receivingPackagePhotos.id, p.id), eq(receivingPackagePhotos.organizationId, org.organizationId))).limit(1);
    if (!row) continue;
    try {
      const file = await storage.read(row.storagePath);
      if (!file) { skipped++; continue; }
      const buf = await readAll(file.stream);
      if (bytes + buf.length > MAX_ATTACH_BYTES) { skipped++; continue; }
      bytes += buf.length;
      attachments.push({ filename: row.filename, content: buf });
    } catch {
      skipped++;
    }
  }

  // A finalized adjustment quotation always goes with an adjustment email -- the stored copy if it was attached
  // above, otherwise one built right now (storage not connected, or the stored file couldn't be read).
  if (isAdjustment) {
    const { getAdjustmentForPackage, renderAdjustmentPdf } = await import("@/lib/receiving-adjustment-service");
    const adj = await getAdjustmentForPackage(org.organizationId, packageId);
    if (adj && adj.status === "FINAL") {
      const stored = !!adj.documentPhotoId && wanted.some((w) => w.id === adj.documentPhotoId) && attachments.some((a) => a.filename.startsWith("Adjusted-Quotation-"));
      if (!stored) {
        const pdf = await renderAdjustmentPdf(org.organizationId, org.organizationName, adj.id);
        if (pdf) attachments.unshift({ filename: pdf.filename, content: Buffer.from(pdf.bytes) });
      }
    }
  }

  const bcc = splitEmails(settings.bccEmails);
  const sent = await sendCustomerEmail({
    to,
    subject: built.subject,
    text: built.text,
    html: built.html,
    fromName: settings.fromName.trim() || null,
    replyTo: settings.replyTo.trim() || null,
    bcc,
    attachments,
  });
  if (!sent.ok) return { ok: false, error: sent.error };

  if (kind === "WARNING") {
    await db.update(receivingPackages).set({ packagingWarningSentAt: sql`(current_timestamp)`, updatedAt: sql`(current_timestamp)` }).where(eq(receivingPackages.id, packageId));
  } else {
    const warned = template === "STANDARD_PACKAGING_NOTICE" || template === "ADJUSTMENT_PACKAGING";
    await db
      .update(receivingPackages)
      .set({
        customerNotifiedAt: sql`(current_timestamp)`,
        ...(warned ? { packagingWarningSentAt: sql`(current_timestamp)` } : {}),
        updatedAt: sql`(current_timestamp)`,
      })
      .where(eq(receivingPackages.id, packageId));
  }
  // The log: exactly what went out, who sent it, when.
  await db.insert(receivingCustomerEmails).values({
    id: newId("remail"),
    organizationId: org.organizationId,
    packageId,
    kind,
    template,
    toEmail: to,
    bccEmails: bcc.length ? bcc.join(", ") : null,
    subject: built.subject,
    bodyHtml: built.html,
    attachmentNames: JSON.stringify(attachments.map((a) => a.filename)),
    skippedAttachments: skipped,
    sentByUserId: org.userId,
  });
  await auditReceiving(org, pkg.quotationId, "customer-service", `Customer email sent (${template}) to ${to}${attachments.length ? `, ${attachments.length} attachment(s)` : ""}`);
  return { ok: true, template, attached: attachments.length, skipped };
}
