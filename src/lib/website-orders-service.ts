// Staff side of the automatic website checkout: the "Website orders" list in Purchasing and what staff can do with one order.
// Every function takes the organizationId of the SIGNED-IN person (from requireOrg) and filters by it. Nothing is deleted: an order is
// cancelled or hidden, so the record stays. Bank details are never read here (storefront-payouts.ts does that, for allowed people only).

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingAuditLog, purchasingQuotations, storefronts, websiteRequests } from "@/db/schema";
import { newId } from "@/lib/ids";
import { buyAndSaveLabels } from "@/lib/purchasing-label-service";
import { trackingKeys } from "@/lib/tracking-search-rules";
import { emailOrderToCustomer } from "@/lib/website-checkout";
import { emailCheck } from "@/lib/password-reset-rules";

export type OrderListRow = {
  id: string; reference: string; createdAt: string; businessName: string; contactName: string; email: string;
  quotationId: string; quotationNumber: string; total: number; quotationStatus: string; requestStatus: string;
  labelStatus: string; trackingNumber: string | null; packageStatus: string; flagReason: string | null; hiddenAt: string | null; source: string | null; copySentAt: string | null;
};

export async function listWebsiteOrders(organizationId: string, opts: { includeHidden: boolean; q?: string; flaggedOnly?: boolean }): Promise<OrderListRow[]> {
  const rows = await db
    .select({
      id: websiteRequests.id, reference: websiteRequests.reference, createdAt: websiteRequests.createdAt, businessName: websiteRequests.businessName,
      contactName: websiteRequests.contactName, email: websiteRequests.email, quotationId: websiteRequests.quotationId, requestStatus: websiteRequests.status,
      flagReason: websiteRequests.flagReason, hiddenAt: websiteRequests.hiddenAt, source: websiteRequests.source, copySentAt: websiteRequests.copySentAt,
      quotationNumber: purchasingQuotations.quotationNumber, total: purchasingQuotations.grandTotal, quotationStatus: purchasingQuotations.status,
      labelStatus: purchasingQuotations.labelStatus, trackingNumber: purchasingQuotations.trackingNumber, labelTracking: purchasingQuotations.labelTrackingNumber,
      packageStatus: purchasingQuotations.packageStatus,
    })
    .from(websiteRequests)
    .innerJoin(purchasingQuotations, eq(websiteRequests.quotationId, purchasingQuotations.id))
    .where(and(
      eq(websiteRequests.organizationId, organizationId),
      eq(websiteRequests.kind, "ORDER"),
      opts.includeHidden ? undefined : isNull(websiteRequests.hiddenAt),
      opts.flaggedOnly ? sql`${websiteRequests.flagReason} is not null` : undefined,
    ))
    .orderBy(desc(websiteRequests.createdAt))
    .limit(500);
  let list: OrderListRow[] = rows.map((r) => ({
    id: r.id, reference: r.reference, createdAt: r.createdAt, businessName: r.businessName, contactName: r.contactName, email: r.email,
    quotationId: r.quotationId!, quotationNumber: r.quotationNumber, total: r.total, quotationStatus: r.quotationStatus, requestStatus: r.requestStatus,
    labelStatus: r.labelStatus, trackingNumber: r.labelTracking ?? r.trackingNumber ?? null, packageStatus: r.packageStatus, flagReason: r.flagReason,
    hiddenAt: r.hiddenAt, source: r.source, copySentAt: r.copySentAt,
  }));
  const q = (opts.q ?? "").trim().toLowerCase();
  if (q) {
    const keys = trackingKeys(q);
    list = list.filter((r) =>
      `${r.reference} ${r.businessName} ${r.contactName} ${r.email} ${r.quotationNumber}`.toLowerCase().includes(q) ||
      (r.trackingNumber && (r.trackingNumber.toLowerCase().includes(q) || keys.some((k) => trackingKeys(r.trackingNumber).includes(k)))),
    );
  }
  return list;
}

/** How many orders staff should look at (flagged and still open), for the page heading. */
export async function countFlagged(organizationId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)` })
    .from(websiteRequests)
    .where(and(eq(websiteRequests.organizationId, organizationId), eq(websiteRequests.kind, "ORDER"), isNull(websiteRequests.hiddenAt), eq(websiteRequests.status, "QUOTED"), sql`${websiteRequests.flagReason} is not null`));
  return Number(r?.n ?? 0);
}

export async function getOrderRequest(organizationId: string, reference: string) {
  const [r] = await db.select().from(websiteRequests).where(and(eq(websiteRequests.organizationId, organizationId), eq(websiteRequests.reference, reference), eq(websiteRequests.kind, "ORDER"))).limit(1);
  return r ?? null;
}

async function audit(organizationId: string, userId: string, requestId: string, field: string, note: string, from: string | null = null, to: string | null = null) {
  await db.insert(purchasingAuditLog).values({ id: newId("paudit"), organizationId, userId, recordType: "website_request", recordId: requestId, fieldName: field, previousValue: from, newValue: to, note });
}

export type OrderActionResult = { ok: true; message?: string } | { ok: false; error: string };

/** Emails the customer a copy of their quotation and label (to their own address, or to another one staff typed). */
export async function sendOrderCopy(organizationId: string, userId: string, reference: string, otherTo: string | null): Promise<OrderActionResult> {
  const r = await getOrderRequest(organizationId, reference);
  if (!r) return { ok: false, error: "Order not found." };
  const [sf] = await db.select({ handle: storefronts.handle, displayName: storefronts.displayName }).from(storefronts).where(eq(storefronts.organizationId, organizationId)).limit(1);
  if (!sf) return { ok: false, error: "The storefront is not set up." };
  const to = (otherTo ?? "").trim().toLowerCase();
  if (to && !emailCheck(to).ok) return { ok: false, error: "That email address does not look right." };
  const sent = await emailOrderToCustomer(organizationId, sf.handle, sf.displayName, reference, { isCopy: true, labelPendingHint: true, to: to || undefined });
  if (!sent.ok) return { ok: false, error: `The email could not be sent: ${sent.error}` };
  await db.update(websiteRequests).set({ copySentAt: new Date().toISOString() }).where(eq(websiteRequests.id, r.id));
  await audit(organizationId, userId, r.id, "copy_emailed", `Emailed a copy of the quotation and label to ${to || r.email}`);
  return { ok: true, message: `Sent to ${to || r.email}.` };
}

/** Cancels an order that has not arrived yet: the quotation is cancelled and the request set aside. Nothing is deleted. */
export async function cancelWebsiteOrder(organizationId: string, userId: string, reference: string): Promise<OrderActionResult> {
  const r = await getOrderRequest(organizationId, reference);
  if (!r || !r.quotationId) return { ok: false, error: "Order not found." };
  const now = new Date().toISOString();
  const res = await db
    .update(purchasingQuotations)
    .set({ status: "CANCELLED", updatedAt: now })
    .where(and(eq(purchasingQuotations.id, r.quotationId), eq(purchasingQuotations.organizationId, organizationId), eq(purchasingQuotations.status, "QUOTED")));
  if (res.rowsAffected === 0) return { ok: false, error: "This order has already arrived or been cancelled, so it cannot be cancelled here." };
  await db.update(websiteRequests).set({ status: "DECLINED", handledByUserId: userId, handledAt: now, updatedAt: now }).where(eq(websiteRequests.id, r.id));
  await audit(organizationId, userId, r.id, "status", "Order cancelled by staff", "QUOTED", "CANCELLED");
  return { ok: true };
}

/** Buys the one free label for an order whose automatic label was held or failed. Still one label per order. */
export async function makeOrderLabel(organizationId: string, userId: string, reference: string): Promise<OrderActionResult> {
  const r = await getOrderRequest(organizationId, reference);
  if (!r || !r.quotationId) return { ok: false, error: "Order not found." };
  const [q] = await db.select().from(purchasingQuotations).where(and(eq(purchasingQuotations.id, r.quotationId), eq(purchasingQuotations.organizationId, organizationId))).limit(1);
  if (!q) return { ok: false, error: "Order not found." };
  if (q.status !== "QUOTED") return { ok: false, error: "This order has already arrived or been cancelled." };
  if (q.labelStatus === "GENERATED") return { ok: false, error: "This order already has its label." };
  const res = await buyAndSaveLabels({
    organizationId, quotation: q, labelCarrier: q.labelCarrier === "USPS_PRIORITY" ? "USPS_PRIORITY" : "UPS_GROUND", labelCount: 1, maxTotal: 1,
    parcel: { lengthIn: q.parcelLengthIn, widthIn: q.parcelWidthIn, heightIn: q.parcelHeightIn, weightLb: q.parcelWeightLb },
  });
  if (res.bought < 1) return { ok: false, error: res.error ?? "The label could not be made." };
  await audit(organizationId, userId, r.id, "label", "Staff made the shipping label for this order");
  return { ok: true, message: "The label was made." };
}

/** Marks an order as reviewed: clears the flag so it stops asking for attention (the reason stays in the audit trail). */
export async function clearOrderFlag(organizationId: string, userId: string, reference: string): Promise<OrderActionResult> {
  const r = await getOrderRequest(organizationId, reference);
  if (!r) return { ok: false, error: "Order not found." };
  await db.update(websiteRequests).set({ flagReason: null }).where(eq(websiteRequests.id, r.id));
  await audit(organizationId, userId, r.id, "flag_cleared", `Reviewed and cleared the flag: ${r.flagReason ?? "none"}`);
  return { ok: true };
}
