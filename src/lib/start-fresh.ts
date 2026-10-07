// "Start fresh": clears the TEST quotations and everything they created in the other departments, so the company is ready for
// real quotations and real packages. It is one company only and never touches the setup: products, brands (categories), prices,
// conditions, expiration ranges, templates, recalls, settings, the team and their logins stay exactly as they are.
//
// Deleting a company's quotations removes (the database cascades, so nothing is left behind): their items, files, shipping
// labels and tracking, and the receiving packages made from them with their photos, intake scans, serial numbers, recall
// checks, adjustments, customer emails and payment records. The customers those quotations were for go too (a customer that
// no quotation uses is left alone), and the audit-log lines about those quotations.

import { and, count, eq, inArray, isNotNull, min, max, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  purchasingAuditLog,
  purchasingCategories,
  purchasingConditions,
  purchasingCustomers,
  purchasingProducts,
  purchasingQuotationDocuments,
  purchasingQuotations,
  purchasingTracking,
  memberships,
  receivingPackagePhotos,
  receivingPackages,
  receivingRecalls,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import { storage } from "@/lib/receiving-storage";

export const START_FRESH_PHRASE = "START FRESH";

export type FreshPreview = {
  /** What will be removed. */
  quotations: number;
  firstDay: string | null;
  lastDay: string | null;
  receivingPackages: number;
  photos: number;
  files: number;
  tracking: number;
  customers: number;
  auditLines: number;
  paidOrders: number;
  /** What stays. */
  keep: { products: number; brands: number; conditions: number; recalls: number; team: number };
};

const chunks = <T,>(xs: T[], n = 400) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const num = (rows: { n: number | string | null }[]) => Number(rows[0]?.n ?? 0);

/** The audit-log lines that are about quotations (the ones that go). Price-override and setup lines stay. */
const quotationAudit = (organizationId: string) => and(eq(purchasingAuditLog.organizationId, organizationId), inArray(purchasingAuditLog.recordType, ["quotation", "quoted_item"]));

export async function previewStartFresh(organizationId: string): Promise<FreshPreview> {
  const q = eq(purchasingQuotations.organizationId, organizationId);
  const [[span], pk, ph, fl, tr, au, paid, cu, pr, br, co, rc, tm] = await Promise.all([
    db.select({ n: count(), a: min(purchasingQuotations.quotationDate), b: max(purchasingQuotations.quotationDate) }).from(purchasingQuotations).where(q),
    db.select({ n: count() }).from(receivingPackages).where(eq(receivingPackages.organizationId, organizationId)),
    db.select({ n: count() }).from(receivingPackagePhotos).where(eq(receivingPackagePhotos.organizationId, organizationId)),
    db.select({ n: count() }).from(purchasingQuotationDocuments).where(eq(purchasingQuotationDocuments.organizationId, organizationId)),
    db.select({ n: count() }).from(purchasingTracking).where(eq(purchasingTracking.organizationId, organizationId)),
    db.select({ n: count() }).from(purchasingAuditLog).where(quotationAudit(organizationId)),
    db.select({ n: count() }).from(receivingPackages).where(and(eq(receivingPackages.organizationId, organizationId), eq(receivingPackages.accountsStatus, "PAID"))),
    db.select({ n: count() }).from(purchasingCustomers).where(and(eq(purchasingCustomers.organizationId, organizationId), sql`${purchasingCustomers.id} in (select customer_id from purchasing_quotations where organization_id = ${organizationId} and customer_id is not null)`)),
    db.select({ n: count() }).from(purchasingProducts).where(eq(purchasingProducts.organizationId, organizationId)),
    db.select({ n: count() }).from(purchasingCategories).where(eq(purchasingCategories.organizationId, organizationId)),
    db.select({ n: count() }).from(purchasingConditions).where(eq(purchasingConditions.organizationId, organizationId)),
    db.select({ n: count() }).from(receivingRecalls).where(eq(receivingRecalls.organizationId, organizationId)),
    db.select({ n: count() }).from(memberships).where(eq(memberships.organizationId, organizationId)),
  ]);
  return {
    quotations: Number(span?.n ?? 0),
    firstDay: span?.a ?? null,
    lastDay: span?.b ?? null,
    receivingPackages: num(pk),
    photos: num(ph),
    files: num(fl),
    tracking: num(tr),
    customers: num(cu),
    auditLines: num(au),
    paidOrders: num(paid),
    keep: { products: num(pr), brands: num(br), conditions: num(co), recalls: num(rc), team: num(tm) },
  };
}

/** Removes the quotations and what they created, in one all-or-nothing step. Returns what it removed. */
export async function runStartFresh(organizationId: string, userId: string): Promise<FreshPreview> {
  const before = await previewStartFresh(organizationId);
  const customerIds = (
    await db
      .selectDistinct({ id: purchasingQuotations.customerId })
      .from(purchasingQuotations)
      .where(and(eq(purchasingQuotations.organizationId, organizationId), isNotNull(purchasingQuotations.customerId)))
  )
    .map((r) => r.id)
    .filter((x): x is string => !!x);

  const photoPaths = (await db.select({ path: receivingPackagePhotos.storagePath }).from(receivingPackagePhotos).where(eq(receivingPackagePhotos.organizationId, organizationId))).map((r) => r.path);

  // Receiving packages are deleted by their company first, so a package whose quotation link was lost is cleared as well.
  await db.batch([
    db.delete(receivingPackages).where(eq(receivingPackages.organizationId, organizationId)),
    db.delete(purchasingQuotations).where(eq(purchasingQuotations.organizationId, organizationId)),
    ...chunks(customerIds).map((ids) => db.delete(purchasingCustomers).where(and(eq(purchasingCustomers.organizationId, organizationId), inArray(purchasingCustomers.id, ids)))),
    db.delete(purchasingAuditLog).where(quotationAudit(organizationId)),
    // A note that this happened (the audit log is kept for setup changes).
    db.insert(purchasingAuditLog).values({
      id: newId("audit"),
      organizationId,
      userId,
      recordType: "start_fresh",
      recordId: organizationId,
      fieldName: "test data cleared",
      previousValue: `${before.quotations} quotations, ${before.receivingPackages} receiving packages, ${before.customers} customers`,
      newValue: "0",
      note: "Start fresh: test quotations and what they created were removed. Setup was kept.",
      changedAt: new Date().toISOString(),
    }),
  ]);
  // The photo files themselves, once the records are gone. A file that can't be removed is left behind harmlessly (nothing points at it).
  if (photoPaths.length && storage.configured()) await Promise.allSettled(photoPaths.map((p) => storage.remove(p)));
  return before;
}
