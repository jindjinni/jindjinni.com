// Deleting quotations on purpose: a few picked from the list, or all of them. This removes the quotations and what hangs
// off them (the database cascades): their lines, receipt files, shipping labels and tracking, and the receiving packages
// made from them with photos, intake scans, adjustments and payment records. It does NOT remove customers, products, prices
// or settings. Website requests that pointed at a deleted quotation are kept and simply lose the link.
//
// (Settings -> Start fresh is the bigger version that also clears customers.)

import { and, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  purchasingAuditLog,
  purchasingQuotationLabels,
  purchasingQuotations,
  purchasingQuotedItems,
  receivingPackagePhotos,
  receivingPackages,
  websiteRequests,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import { storage } from "@/lib/receiving-storage";

export { DELETE_ALL_PHRASE, DELETE_PAID_PHRASE, type DeletionPreview } from "@/lib/quotation-delete-text";
import type { DeletionPreview } from "@/lib/quotation-delete-text";

const chunks = <T,>(xs: T[], n = 400) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const num = (rows: { n: number | string | null }[]) => Number(rows[0]?.n ?? 0);

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

export async function previewQuotationDeletion(organizationId: string, ids: string[]): Promise<DeletionPreview> {
  const own = await ownQuotationIds(organizationId, ids);
  let withReceiving = 0;
  let paid = 0;
  let labels = 0;
  for (const part of chunks(own)) {
    const [pk, pd, lb, lbq] = await Promise.all([
      db.select({ n: count() }).from(receivingPackages).where(and(eq(receivingPackages.organizationId, organizationId), inArray(receivingPackages.quotationId, part))),
      db.select({ n: count() }).from(receivingPackages).where(and(eq(receivingPackages.organizationId, organizationId), inArray(receivingPackages.quotationId, part), eq(receivingPackages.accountsStatus, "PAID"))),
      db.select({ n: count() }).from(purchasingQuotationLabels).where(and(eq(purchasingQuotationLabels.organizationId, organizationId), inArray(purchasingQuotationLabels.quotationId, part))),
      db.select({ n: count() }).from(purchasingQuotations).where(and(inArray(purchasingQuotations.id, part), eq(purchasingQuotations.labelStatus, "GENERATED"), sql`not exists (select 1 from purchasing_quotation_labels l where l.quotation_id = purchasing_quotations.id)`)),
    ]);
    withReceiving += num(pk);
    paid += num(pd);
    labels += num(lb) + num(lbq);
  }
  return { quotations: own.length, withReceiving, paid, labels };
}

/** Removes the quotations and what they created, all-or-nothing. Returns what was removed. */
export async function deleteQuotationsById(organizationId: string, userId: string, ids: string[], how: string): Promise<DeletionPreview> {
  const own = await ownQuotationIds(organizationId, ids);
  const before = await previewQuotationDeletion(organizationId, own);
  if (own.length === 0) return before;

  // Things to clean up that the database can't do by itself.
  const photoPaths: string[] = [];
  const itemIds: string[] = [];
  for (const part of chunks(own)) {
    const pkgs = await db.select({ id: receivingPackages.id }).from(receivingPackages).where(and(eq(receivingPackages.organizationId, organizationId), inArray(receivingPackages.quotationId, part)));
    for (const p2 of chunks(pkgs.map((p) => p.id))) {
      const ph = await db.select({ path: receivingPackagePhotos.storagePath }).from(receivingPackagePhotos).where(inArray(receivingPackagePhotos.packageId, p2));
      photoPaths.push(...ph.map((r) => r.path));
    }
    const items = await db.select({ id: purchasingQuotedItems.id }).from(purchasingQuotedItems).where(inArray(purchasingQuotedItems.quotationId, part));
    itemIds.push(...items.map((r) => r.id));
  }

  const parts = chunks(own);
  type Stmt = Parameters<typeof db.batch>[0][number];
  const stmts: Stmt[] = [
    ...parts.map((ids2) => db.update(websiteRequests).set({ quotationId: null }).where(and(eq(websiteRequests.organizationId, organizationId), inArray(websiteRequests.quotationId, ids2)))),
    ...parts.map((ids2) => db.delete(purchasingAuditLog).where(and(eq(purchasingAuditLog.organizationId, organizationId), eq(purchasingAuditLog.recordType, "quotation"), inArray(purchasingAuditLog.recordId, ids2)))),
    ...chunks(itemIds).map((ids2) => db.delete(purchasingAuditLog).where(and(eq(purchasingAuditLog.organizationId, organizationId), eq(purchasingAuditLog.recordType, "quoted_item"), inArray(purchasingAuditLog.recordId, ids2)))),
    ...parts.map((ids2) => db.delete(receivingPackages).where(and(eq(receivingPackages.organizationId, organizationId), inArray(receivingPackages.quotationId, ids2)))),
    ...parts.map((ids2) => db.delete(purchasingQuotations).where(and(eq(purchasingQuotations.organizationId, organizationId), inArray(purchasingQuotations.id, ids2)))),
    db.insert(purchasingAuditLog).values({
      id: newId("paudit"),
      organizationId,
      userId,
      recordType: "quotation_delete",
      recordId: organizationId,
      fieldName: "deleted",
      previousValue: String(before.quotations),
      newValue: "0",
      note: `Deleted ${before.quotations} quotation(s) (${how}); ${before.withReceiving} receiving package(s) and ${before.labels} label record(s) went with them.`,
      changedAt: new Date().toISOString(),
    }),
  ];
  await db.batch(stmts as [Stmt, ...Stmt[]]);
  // The photo files themselves, once the records are gone. A file that can't be removed is left harmlessly (nothing points at it).
  if (photoPaths.length && storage.configured()) await Promise.allSettled(photoPaths.map((p) => storage.remove(p)));
  return before;
}
