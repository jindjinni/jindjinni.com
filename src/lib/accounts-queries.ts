import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, or } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingCustomers, purchasingQuotations, purchasingQuotedItems, receivingPackagePhotos, receivingPackages } from "@/db/schema";
import { finalPayout } from "@/lib/receiving-rules";
import type { AccountsOrder, ReportOrder } from "@/lib/accounts-rules";

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

async function coversFor(organizationId: string, packageIds: string[]) {
  const out = new Map<string, string>();
  if (packageIds.length === 0) return out;
  const rows = await db
    .select({ id: receivingPackagePhotos.id, packageId: receivingPackagePhotos.packageId })
    .from(receivingPackagePhotos)
    .where(and(eq(receivingPackagePhotos.organizationId, organizationId), eq(receivingPackagePhotos.kind, "UNOPENED_PACKAGE"), inArray(receivingPackagePhotos.packageId, packageIds)))
    .orderBy(receivingPackagePhotos.createdAt);
  for (const r of rows) if (!out.has(r.packageId)) out.set(r.packageId, r.id);
  return out;
}

function toOrder(r: Row, receipts: Map<string, { count: number; first: string }>, covers: Map<string, string>): AccountsOrder {
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
    coverPhotoId: covers.get(r.id) ?? null,
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
  const ids = rows.map((r) => r.id);
  const [receipts, covers] = await Promise.all([receiptsFor(organizationId, ids), coversFor(organizationId, ids)]);
  return rows.map((r) => toOrder(r, receipts, covers));
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
  const ids = rows.map((r) => r.id);
  const [receipts, covers] = await Promise.all([receiptsFor(organizationId, ids), coversFor(organizationId, ids)]);
  return rows.map((r) => toOrder(r, receipts, covers));
}

/**
 * The orders paid between two UTC stamps ("YYYY-MM-DD HH:MM:SS", start included, end excluded), oldest payment first,
 * each with the complete items quoted and the final payout. The Monthly Report asks for a month plus a day either
 * side and then keeps the orders that fall in the month on the viewer's own calendar.
 */
export async function getPaidReport(organizationId: string, startUtc: string, endUtc: string): Promise<ReportOrder[]> {
  const rows = await db
    .select({
      id: receivingPackages.id,
      quotationId: purchasingQuotations.id,
      nameSnap: purchasingQuotations.customerNameSnapshot,
      firstName: purchasingCustomers.firstName,
      lastName: purchasingCustomers.lastName,
      paidAt: receivingPackages.paidAt,
      grandTotal: purchasingQuotations.grandTotal,
      adjustedTotal: receivingPackages.adjustedOrderTotal,
      importedItems: purchasingQuotations.importedItemsText,
    })
    .from(receivingPackages)
    .innerJoin(purchasingQuotations, eq(purchasingQuotations.id, receivingPackages.quotationId))
    .leftJoin(purchasingCustomers, eq(purchasingCustomers.id, purchasingQuotations.customerId))
    .where(
      and(
        eq(receivingPackages.organizationId, organizationId),
        eq(receivingPackages.accountsStatus, "PAID"),
        isNotNull(receivingPackages.paidAt),
        gte(receivingPackages.paidAt, startUtc),
        lt(receivingPackages.paidAt, endUtc),
      ),
    )
    .orderBy(asc(receivingPackages.paidAt))
    .limit(5000);
  if (rows.length === 0) return [];
  const lines = await db
    .select({
      quotationId: purchasingQuotedItems.quotationId,
      name: purchasingQuotedItems.productNameSnapshot,
      quantity: purchasingQuotedItems.quantity,
    })
    .from(purchasingQuotedItems)
    .where(inArray(purchasingQuotedItems.quotationId, rows.map((r) => r.quotationId)))
    .orderBy(asc(purchasingQuotedItems.createdAt));
  const by = new Map<string, string[]>();
  for (const l of lines) by.set(l.quotationId, [...(by.get(l.quotationId) ?? []), `${l.name} (x${l.quantity})`]);
  return rows.map((r) => {
    const imported = (r.importedItems ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
    return {
      id: r.id,
      customerName: r.firstName ? [r.firstName, r.lastName].filter(Boolean).join(" ") : r.nameSnap,
      paidAt: r.paidAt as string,
      items: by.get(r.quotationId) ?? imported,
      payout: finalPayout(r.grandTotal, r.adjustedTotal),
    };
  });
}
