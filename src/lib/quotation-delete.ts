// Deleting quotations on purpose: a few picked from the list, or all of them.
//
//  * A quotation with NO history (nothing received against it, no payment, no shipping label bought) is erased for good,
//    with what hangs off it (its lines, receipt files, tracking).
//  * A quotation that already has history -- a receiving package (received stock, lot/serial numbers, recall checks,
//    photos), a payment record, or a bought shipping label -- is NEVER erased here. It is hidden (archived) instead, the same
//    as everywhere else in the platform, and can be restored from Settings -> Archive. (Settings -> Start fresh is the owner-only
//    way to clear test data completely.)
//  * Customers, products, prices and settings are never touched. The change history (audit log) is kept, and one summary line
//    is added. Website requests that pointed at an erased quotation are kept and just lose the link.

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingAuditLog, purchasingQuotationLabels, purchasingQuotations, receivingPackages, websiteRequests } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { DeletionPreview } from "@/lib/quotation-delete-text";

export { DELETE_ALL_PHRASE, type DeletionPreview } from "@/lib/quotation-delete-text";

const chunks = <T,>(xs: T[], n = 400) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Only ids that really belong to this company. */
export async function ownQuotationIds(organizationId: string, ids: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const part of chunks([...new Set(ids)])) {
    const rows = await db
      .select({ id: purchasingQuotations.id })
      .from(purchasingQuotations)
      .where(and(eq(purchasingQuotations.organizationId, organizationId), inArray(purchasingQuotations.id, part)));
    out.push(...rows.map((r) => r.id));
  }
  return out;
}

export async function allQuotationIds(organizationId: string): Promise<string[]> {
  return (await db.select({ id: purchasingQuotations.id }).from(purchasingQuotations).where(eq(purchasingQuotations.organizationId, organizationId))).map((r) => r.id);
}

type Split = { toDelete: string[]; toHide: string[]; withReceiving: number; paid: number; labels: number };

/** Which of these quotations have history (kept, hidden) and which don't (erased). */
async function splitByHistory(organizationId: string, own: string[]): Promise<Split> {
  const hasReceiving = new Set<string>();
  const hasPaid = new Set<string>();
  const hasLabel = new Set<string>();
  for (const part of chunks(own)) {
    const pk = await db
      .select({ q: receivingPackages.quotationId, paid: receivingPackages.accountsStatus })
      .from(receivingPackages)
      .where(and(eq(receivingPackages.organizationId, organizationId), inArray(receivingPackages.quotationId, part)));
    for (const r of pk) {
      hasReceiving.add(r.q);
      if (r.paid === "PAID") hasPaid.add(r.q);
    }
    const lb = await db
      .select({ q: purchasingQuotationLabels.quotationId })
      .from(purchasingQuotationLabels)
      .where(and(eq(purchasingQuotationLabels.organizationId, organizationId), inArray(purchasingQuotationLabels.quotationId, part)));
    for (const r of lb) hasLabel.add(r.q);
    // A label bought before the per-label records existed is only on the quotation itself.
    const old = await db
      .select({ q: purchasingQuotations.id })
      .from(purchasingQuotations)
      .where(and(inArray(purchasingQuotations.id, part), sql`(${purchasingQuotations.labelStatus} = 'GENERATED' or ${purchasingQuotations.shippoTransactionId} is not null)`));
    for (const r of old) hasLabel.add(r.q);
  }
  const toHide = own.filter((id) => hasReceiving.has(id) || hasPaid.has(id) || hasLabel.has(id));
  const hide = new Set(toHide);
  return { toDelete: own.filter((id) => !hide.has(id)), toHide, withReceiving: hasReceiving.size, paid: hasPaid.size, labels: hasLabel.size };
}

export async function previewQuotationDeletion(organizationId: string, ids: string[]): Promise<DeletionPreview> {
  const own = await ownQuotationIds(organizationId, ids);
  const s = await splitByHistory(organizationId, own);
  return { quotations: own.length, toDelete: s.toDelete.length, toHide: s.toHide.length, withReceiving: s.withReceiving, paid: s.paid, labels: s.labels };
}

/** Erases the ones with no history, hides the rest, all-or-nothing. Returns what happened. */
export async function deleteQuotationsById(organizationId: string, userId: string, ids: string[], how: string): Promise<DeletionPreview> {
  const own = await ownQuotationIds(organizationId, ids);
  const s = await splitByHistory(organizationId, own);
  const result: DeletionPreview = { quotations: own.length, toDelete: s.toDelete.length, toHide: s.toHide.length, withReceiving: s.withReceiving, paid: s.paid, labels: s.labels };
  if (own.length === 0) return result;

  const now = new Date().toISOString();
  type Stmt = Parameters<typeof db.batch>[0][number];
  const stmts: Stmt[] = [
    ...chunks(s.toDelete).map((part) => db.update(websiteRequests).set({ quotationId: null }).where(and(eq(websiteRequests.organizationId, organizationId), inArray(websiteRequests.quotationId, part)))),
    ...chunks(s.toDelete).map((part) => db.delete(purchasingQuotations).where(and(eq(purchasingQuotations.organizationId, organizationId), inArray(purchasingQuotations.id, part)))),
    ...chunks(s.toHide).map((part) => db.update(purchasingQuotations).set({ archivedAt: now }).where(and(eq(purchasingQuotations.organizationId, organizationId), inArray(purchasingQuotations.id, part), isNull(purchasingQuotations.archivedAt)))),
    db.insert(purchasingAuditLog).values({
      id: newId("paudit"),
      organizationId,
      userId,
      recordType: "quotation_delete",
      recordId: organizationId,
      fieldName: "deleted",
      previousValue: String(own.length),
      newValue: String(s.toHide.length),
      note: `Deleted ${s.toDelete.length} quotation(s) (${how}); ${s.toHide.length} had received stock, a payment or a bought label, so they were hidden in Archive instead.`,
      changedAt: now,
    }),
  ];
  await db.batch(stmts as [Stmt, ...Stmt[]]);
  return result;
}
