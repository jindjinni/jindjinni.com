import { and, desc, eq, inArray, isNotNull, ne, or, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingCustomers, purchasingQuotations, receivingPackagePhotos, receivingPackages } from "@/db/schema";
import { finalPayout } from "@/lib/receiving-rules";
import type { AccountsOrder } from "@/lib/accounts-rules";

// What the Accounts department reads. Every query is limited to the signed-in company.

const select = {
  id: receivingPackages.id,
  quotationNumber: purchasingQuotations.quotationNumber,
  nameSnap: purchasingQuotations.customerNameSnapshot,
  firstName: purchasingCustomers.firstName,
  lastName: purchasingCustomers.lastName,
  quotationTracking: purchasingQuotations.trackingNumber,
  packageTracking: receivingPackages.trackingNumber,
  receivedAt: receivingPackages.receivedAt,
  createdAt: receivingPackages.createdAt,
  paidAt: receivingPackages.paidAt,
  grandTotal: purchasingQuotations.grandTotal,
  adjustedTotal: receivingPackages.adjustedOrderTotal,
};

async function receiptsFor(organizationId: string, packageIds: string[]) {
  const out = new Map<string, { count: number; first: string }>();
  if (packageIds.length === 0) return out;
  const rows = await db
    .select({ id: receivingPackagePhotos.id, packageId: receivingPackagePhotos.packageId })
    .from(receivingPackagePhotos)
    .where(and(eq(receivingPackagePhotos.organizationId, organizationId), eq(receivingPackagePhotos.kind, "PAYMENT_CONFIRMATION"), inArray(receivingPackagePhotos.packageId, packageIds)))
    .orderBy(receivingPackagePhotos.createdAt);
  for (const r of rows) {
    const cur = out.get(r.packageId);
    out.set(r.packageId, { count: (cur?.count ?? 0) + 1, first: cur?.first ?? r.id });
  }
  return out;
}

type Row = {
  id: string;
  quotationNumber: string;
  nameSnap: string;
  firstName: string | null;
  lastName: string | null;
  quotationTracking: string | null;
  packageTracking: string | null;
  receivedAt: string | null;
  createdAt: string;
  paidAt: string | null;
  grandTotal: number;
  adjustedTotal: number | null;
};

function toOrder(r: Row, receipts: Map<string, { count: number; first: string }>): AccountsOrder {
  const rc = receipts.get(r.id);
  return {
    id: r.id,
    quotationNumber: r.quotationNumber,
    customerName: r.firstName ? [r.firstName, r.lastName].filter(Boolean).join(" ") : r.nameSnap,
    trackingNumber: r.packageTracking ?? r.quotationTracking,
    receivedAt: r.receivedAt ?? r.createdAt,
    paidAt: r.paidAt,
    amount: finalPayout(r.grandTotal, r.adjustedTotal),
    adjusted: r.adjustedTotal != null && r.adjustedTotal !== r.grandTotal,
    receipts: rc?.count ?? 0,
    receiptId: rc?.first ?? null,
  };
}

/** Submitted orders Receiving sent to Accounts ("Need to Be Paid") that are not paid yet. Oldest first. */
export async function getToBePaid(organizationId: string): Promise<AccountsOrder[]> {
  const rows = await db
    .select(select)
    .from(receivingPackages)
    .innerJoin(purchasingQuotations, eq(purchasingQuotations.id, receivingPackages.quotationId))
    .leftJoin(purchasingCustomers, eq(purchasingCustomers.id, purchasingQuotations.customerId))
    .where(
      and(
        eq(receivingPackages.organizationId, organizationId),
        ne(receivingPackages.status, "IN_PROGRESS"),
        eq(receivingPackages.accountsDecision, "NEED_TO_BE_PAID"),
        or(isNull(receivingPackages.accountsStatus), ne(receivingPackages.accountsStatus, "PAID")),
      ),
    )
    .orderBy(receivingPackages.receivedAt, receivingPackages.createdAt);
  const receipts = await receiptsFor(organizationId, rows.map((r) => r.id));
  return rows.map((r) => toOrder(r, receipts));
}

export const PAID_LIMIT = 5000;

/** Every order Accounts marked Paid, newest payment first (the most recent PAID_LIMIT). */
export async function getPaidOrders(organizationId: string): Promise<AccountsOrder[]> {
  const rows = await db
    .select(select)
    .from(receivingPackages)
    .innerJoin(purchasingQuotations, eq(purchasingQuotations.id, receivingPackages.quotationId))
    .leftJoin(purchasingCustomers, eq(purchasingCustomers.id, purchasingQuotations.customerId))
    .where(and(eq(receivingPackages.organizationId, organizationId), eq(receivingPackages.accountsStatus, "PAID"), isNotNull(receivingPackages.paidAt)))
    .orderBy(desc(receivingPackages.paidAt))
    .limit(PAID_LIMIT);
  const receipts = await receiptsFor(organizationId, rows.map((r) => r.id));
  return rows.map((r) => toOrder(r, receipts));
}
