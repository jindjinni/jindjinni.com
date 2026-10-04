// Receiving's server-side workflows that more than one action needs:
// the inventory log written on submit, and sending the customer emails.
// Nothing here checks the signed-in user -- callers (the actions) do that and
// pass the company in.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  purchasingAuditLog,
  receivingIntakeLines,
  receivingIntakeLogs,
  receivingPackagePhotos,
  receivingPackages,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import { sendCustomerEmail, type EmailAttachment } from "@/lib/email";
import { getReceivingPackage } from "@/lib/receiving-queries";
import { buildCustomerEmail, buildPackagingWarning } from "@/lib/receiving-emails";
import { finalPayout, pickEmailTemplate, weekOf } from "@/lib/receiving-rules";
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
  for (const i of data.items) {
    if (i.wasReceived === "NO" || !i.quantityReceived || i.quantityReceived <= 0) continue;
    const dates = [i.expirationDate, ...i.lots.flatMap((l) => [l.expirationDate, l.expirationEndDate])].filter(Boolean).sort();
    await db.insert(receivingIntakeLines).values({
      id: newId("rline"),
      organizationId: org.organizationId,
      logId,
      productId: i.productId,
      productName: i.productName,
      ndc: i.ndc || null,
      lotNumber: i.lotNumber || i.lots.map((l) => l.lotNumber).find(Boolean) || null,
      quantity: i.quantityReceived,
      condition: i.condition || null,
      expirationEarliest: dates[0] ?? null,
      expirationLatest: dates[dates.length - 1] ?? null,
      weekOf: weekOf(data.pkg.receivedAt),
      receivedFrom,
      receivedAt: data.pkg.receivedAt,
      receivedByUserId: data.pkg.receivedByUserId ?? data.pkg.startedByUserId ?? null,
      needsReturn: i.needsReturn || null,
      quantityToReturn: i.quantityToReturn ?? null,
    });
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

/**
 * Sends the shipment's customer email.
 *  - "STATUS": the "package received & processed" email that matches the shipment (standard / packaging notice / adjustment).
 *  - "WARNING": the stand-alone packaging requirements warning.
 * Stamps customerNotifiedAt / packagingWarningSentAt only when the send worked.
 */
export async function deliverCustomerEmail(org: OrgRef, packageId: string, kind: "STATUS" | "WARNING"): Promise<DeliverResult> {
  const data = await getReceivingPackage(org.organizationId, packageId);
  if (!data) return { ok: false, error: "That shipment wasn't found." };
  if (!data.settings.emailsEnabled) return { ok: false, error: "Customer emails are turned off. An admin can turn them on under Email Settings." };
  const to = data.brief.email?.trim();
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { ok: false, error: "This customer has no valid email address on the order." };

  const { pkg, brief, settings } = data;
  const companyName = settings.fromName.trim() || org.organizationName;
  const orderLabel = [brief.quotationNumber, pkg.trackingNumber ?? brief.trackingNumber].filter(Boolean).join(" — ");

  let built;
  let template: string;
  if (kind === "WARNING") {
    template = "PACKAGING_WARNING";
    built = buildPackagingWarning({ companyName, customerName: brief.customerName, orderLabel, packagingGuideUrl: settings.packagingGuideUrl || null });
  } else {
    if (pkg.status === "IN_PROGRESS") return { ok: false, error: "Submit receiving first. The customer isn't told anything until the package is processed." };
    if (pkg.accountsStatus !== "PAID") return { ok: false, error: "Accounts Status must be Paid before the customer is notified." };
    const key = pickEmailTemplate(pkg);
    template = key;
    built = buildCustomerEmail(key, {
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
  }

  // Attachments: the payment confirmation, revised invoice and note photos that apply to this email.
  const attachments: EmailAttachment[] = [];
  let skipped = 0;
  let bytes = 0;
  // Adjustment emails also carry the inspection photos (damage / discrepancy / packaging issue) the email refers to.
  const isAdjustment = template === "ADJUSTMENT_ONLY" || template === "ADJUSTMENT_PACKAGING";
  const inspectionKinds = ["DAMAGE", "PACKAGING_ISSUE", "ITEM_DAMAGE", "ITEM_DISCREPANCY"];
  const wanted = data.photos
    .filter((p) => (!p.itemId && (built.attachKinds as string[]).includes(p.kind)) || (isAdjustment && inspectionKinds.includes(p.kind)))
    .slice(0, MAX_ATTACH_FILES);
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

  const sent = await sendCustomerEmail({
    to,
    subject: built.subject,
    text: built.text,
    html: built.html,
    fromName: settings.fromName.trim() || null,
    replyTo: settings.replyTo.trim() || null,
    bcc: splitEmails(settings.bccEmails),
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
  await auditReceiving(org, pkg.quotationId, "receiving", `Customer email sent (${template}) to ${to}${attachments.length ? `, ${attachments.length} attachment(s)` : ""}`);
  return { ok: true, template, attached: attachments.length, skipped };
}

