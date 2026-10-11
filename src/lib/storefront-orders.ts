// Pharmacy orders on a company's storefront or own website -- the database side. Rules and words are in storefront-order-rules.ts and
// storefront-buyer-emails.ts; the pages are under app/s/[handle]/order(s) and the website calls under app/api/storefront/v1/pharmacies.
//
// The order IS an ordinary Sales order (kind SALES_ORDER, marked source "WEBSITE") for the pharmacy's Sales buyer, so it holds stock the way
// every Sales order does and staff work it in Sales as usual. Every number on it is set HERE: the price from the pharmacy's own price sheet,
// the stock from the live inventory. Nothing a pharmacy or a website sends can choose the company, a price, a stock level or a status.
// Who may order: only an approved, not-hidden pharmacy of THIS storefront, and only while the company has ordering open (and Sales orders on).

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, purchasingAuditLog, salesBuyers, salesDocumentLines, salesDocuments, salesPriceItems, storefrontBuyers, storefrontOrders } from "@/db/schema";
import { newId } from "@/lib/ids";
import { sendCustomerEmail } from "@/lib/email";
import { appUrl } from "@/lib/password-reset";
import { emailCheck, normalizeResetEmail } from "@/lib/password-reset-rules";
import { getPaymentTerms } from "@/lib/accounts-queries";
import { todayIn } from "@/lib/payment-due";
import { availability, computeTotals, dueDateFor, shortfalls } from "@/lib/sales-rules";
import { linkSalesBuyer } from "@/lib/storefront-buyers";
import { mayUseAccount } from "@/lib/storefront-buyer-rules";
import { orderPlacedEmail } from "@/lib/storefront-buyer-emails";
import { ORDER_LIMITS, makeOrderReference, orderStateOf, outcomeFor, type OrderOutcome, type OrderRequest, type OrderState } from "@/lib/storefront-order-rules";
import type { PublicStorefront } from "@/lib/storefront-public";
import { deleteDraftSilently, saveDocument, salesOrdersOn, salesStockContext, sellableProducts } from "@/lib/sales-service";

/** Ordering is open only when the company switched it on, accepts pharmacy accounts, and has Sales orders (where the orders land) turned on. */
export async function orderingOpen(sf: PublicStorefront): Promise<boolean> {
  return sf.buyOpen && sf.ordersOpen && (await salesOrdersOn(sf.organizationId));
}

export type OrderBuyer = { id: string; salesBuyerId: string; businessName: string; contactName: string; email: string; phone: string | null; address: string };

/** The pharmacy behind this id, only if it belongs to THIS storefront, is approved and not hidden, and ordering is open; otherwise null. */
export async function loadOrderBuyer(sf: PublicStorefront, buyerId: string): Promise<OrderBuyer | null> {
  if (!(await orderingOpen(sf))) return null;
  const [b] = await db
    .select()
    .from(storefrontBuyers)
    .where(and(eq(storefrontBuyers.id, buyerId), eq(storefrontBuyers.storefrontId, sf.storefrontId), eq(storefrontBuyers.organizationId, sf.organizationId)))
    .limit(1);
  if (!b || b.hiddenAt || !mayUseAccount(b.status)) return null;
  let salesBuyerId = b.salesBuyerId;
  if (salesBuyerId) {
    const [sb] = await db.select({ id: salesBuyers.id }).from(salesBuyers).where(and(eq(salesBuyers.id, salesBuyerId), eq(salesBuyers.organizationId, sf.organizationId))).limit(1);
    if (!sb) salesBuyerId = null;
  }
  if (!salesBuyerId) {
    salesBuyerId = await linkSalesBuyer(sf.organizationId, b);
    await db.update(storefrontBuyers).set({ salesBuyerId, updatedAt: new Date().toISOString() }).where(and(eq(storefrontBuyers.id, b.id), eq(storefrontBuyers.organizationId, sf.organizationId)));
  }
  const address = [b.street1, b.street2, `${b.city}, ${b.state} ${b.zip}`].filter(Boolean).join(", ");
  return { id: b.id, salesBuyerId, businessName: b.businessName, contactName: b.contactName, email: b.email, phone: b.phone, address };
}

// ---- the catalog ---------------------------------------------------------------------------------------------------------------

export type CatalogItem = { id: string; name: string; brand: string; condition: string; price: number; inStock: boolean };

/**
 * What this pharmacy may order: the lines of ITS OWN price sheet that are matched to an active product and priced above $0, at its prices.
 * "In stock" means at least one unit is free right now (on hand minus what open orders and draft invoices hold). The count never leaves here.
 */
export async function catalogFor(sf: PublicStorefront, b: OrderBuyer): Promise<CatalogItem[]> {
  const [items, products, ctx] = await Promise.all([
    db
      .select({ id: salesPriceItems.id, productId: salesPriceItems.productId, condition: salesPriceItems.condition, price: salesPriceItems.price })
      .from(salesPriceItems)
      .where(and(eq(salesPriceItems.organizationId, sf.organizationId), eq(salesPriceItems.buyerId, b.salesBuyerId))),
    sellableProducts(sf.organizationId),
    salesStockContext(sf.organizationId),
  ]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const out: CatalogItem[] = [];
  for (const it of items) {
    const p = it.productId ? byId.get(it.productId) : undefined;
    if (!p || !(it.price > 0)) continue;
    out.push({ id: it.id, name: p.name, brand: p.brand, condition: it.condition, price: it.price, inStock: availability(ctx.stock, ctx.reserved, p.key, it.condition, null).available > 0 });
  }
  return out.sort((a, c) => a.brand.localeCompare(c.brand) || a.name.localeCompare(c.name) || a.condition.localeCompare(c.condition));
}

// ---- placing an order ----------------------------------------------------------------------------------------------------------

export type OrderLineView = { name: string; condition: string; quantity: number; unitPrice: number; lineTotal: number };
export type OrderView = { reference: string; state: OrderState; outcome: OrderOutcome; createdAt: string; poNumber: string | null; total: number; lines: OrderLineView[] };
export type PlaceResult =
  | { ok: true; created: boolean; order: OrderView }
  | { ok: false; code: "not_open" | "invalid" | "unavailable" | "too_many" | "server_error"; error: string; unavailable?: { itemId: string; name: string }[] };

const round2 = (n: number) => Math.round(n * 100) / 100;

async function viewOf(organizationId: string, row: typeof storefrontOrders.$inferSelect): Promise<OrderView> {
  const [doc] = await db.select({ status: salesDocuments.status, total: salesDocuments.total }).from(salesDocuments).where(and(eq(salesDocuments.id, row.salesDocumentId), eq(salesDocuments.organizationId, organizationId))).limit(1);
  const lines = doc
    ? await db
        .select({ name: salesDocumentLines.productName, condition: salesDocumentLines.condition, quantity: salesDocumentLines.quantity, unitPrice: salesDocumentLines.unitPrice })
        .from(salesDocumentLines)
        .where(and(eq(salesDocumentLines.documentId, row.salesDocumentId), eq(salesDocumentLines.organizationId, organizationId)))
        .orderBy(salesDocumentLines.position)
    : [];
  return {
    reference: row.reference,
    // A Sales order staff deleted or voided reads as cancelled; the pharmacy never sees staff notes or internal statuses.
    state: doc ? orderStateOf(doc.status) : "cancelled",
    outcome: row.outcome,
    createdAt: row.createdAt,
    poNumber: row.poNumber,
    total: doc?.total ?? row.total,
    lines: lines.map((l) => ({ ...l, lineTotal: round2(l.quantity * l.unitPrice) })),
  };
}

async function existingByKey(sf: PublicStorefront, buyerId: string, key: string) {
  const [row] = await db
    .select()
    .from(storefrontOrders)
    .where(and(eq(storefrontOrders.storefrontBuyerId, buyerId), eq(storefrontOrders.idempotencyKey, key), eq(storefrontOrders.organizationId, sf.organizationId)))
    .limit(1);
  return row ?? null;
}

/**
 * Places an order for an approved pharmacy.
 *  - The same key twice returns the first order (a double click or a website retry never makes a second one).
 *  - Every line must be on the pharmacy's own price sheet; the price comes from there. Every line must be in stock; the live stock
 *    (minus what other open orders hold) is checked, then checked AGAIN after the order is saved so two orders arriving together can't
 *    both take the last unit (if both fail, the pharmacy simply tries again).
 *  - Confirmed on the spot unless the company set a review amount and the total is above it; then it waits for staff (a sent Sales order).
 *  - The Sales order holds the stock. Stock is only taken out when staff invoice it.
 */
export async function placeOrder(sf: PublicStorefront, buyerId: string, req: OrderRequest, opts: { source: "STOREFRONT" | "API" }): Promise<PlaceResult> {
  const b = await loadOrderBuyer(sf, buyerId);
  if (!b) return { ok: false, code: "not_open", error: "Ordering isn't available right now." };

  const dup = await existingByKey(sf, b.id, req.key);
  if (dup) return { ok: true, created: false, order: await viewOf(sf.organizationId, dup) };

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [today] = await db
    .select({ n: sql<number>`count(*)` })
    .from(storefrontOrders)
    .where(and(eq(storefrontOrders.storefrontBuyerId, b.id), eq(storefrontOrders.organizationId, sf.organizationId), gte(storefrontOrders.createdAt, since)));
  if (Number(today?.n ?? 0) >= ORDER_LIMITS.perBuyerPerDay) return { ok: false, code: "too_many", error: "This account has placed a lot of orders today. Please call us to place more." };

  // Each requested line must be one of THIS pharmacy's own price-sheet lines that is currently on offer.
  const catalog = await catalogFor(sf, b);
  const offer = new Map(catalog.map((c) => [c.id, c]));
  const gone = req.lines.filter((l) => !offer.has(l.itemId));
  if (gone.length) return { ok: false, code: "invalid", error: "Some items are no longer on your price list. Reload the page and try again." };

  const outNow = req.lines.filter((l) => !offer.get(l.itemId)!.inStock);
  if (outNow.length) return { ok: false, code: "unavailable", error: "Some items are out of stock now.", unavailable: outNow.map((l) => ({ itemId: l.itemId, name: offer.get(l.itemId)!.name })) };

  // Price items -> document lines (the product comes from the price sheet's own match, never from the request).
  const priced = await db
    .select({ id: salesPriceItems.id, productId: salesPriceItems.productId, productKey: salesPriceItems.productKey })
    .from(salesPriceItems)
    .where(and(eq(salesPriceItems.organizationId, sf.organizationId), eq(salesPriceItems.buyerId, b.salesBuyerId)));
  const keyOf = new Map(priced.map((p) => [p.id, p]));
  const lines = req.lines.map((l) => {
    const c = offer.get(l.itemId)!;
    const p = keyOf.get(l.itemId)!;
    return { productId: p.productId, productKey: p.productId ?? p.productKey ?? "", productName: c.name, condition: c.condition, groupKey: null as string | null, groupLabel: null as string | null, quantity: l.quantity, unitPrice: c.price, ndc: null as string | null };
  });
  const ctx = await salesStockContext(sf.organizationId);
  const short = shortfalls(ctx.stock, ctx.reserved, lines);
  if (short.length) {
    const ids = short.map((s) => req.lines[s.index].itemId);
    return { ok: false, code: "unavailable", error: "Some items are not available in that quantity.", unavailable: ids.map((itemId) => ({ itemId, name: offer.get(itemId)!.name })) };
  }

  const totals = computeTotals({ lines, discount: 0, shipping: 0, tax: 0, otherCharges: 0 });
  const outcome = outcomeFor(totals.total, sf.orderReviewOver);
  const reference = makeOrderReference();
  const terms = await getPaymentTerms(sf.organizationId);
  const day = todayIn(terms.timeZone);
  const org = { organizationId: sf.organizationId, userId: "storefront" };

  const saved = await saveDocument(org, {
    kind: "SALES_ORDER",
    buyerId: b.salesBuyerId,
    buyerCompany: b.businessName,
    buyerContact: b.contactName,
    buyerBillingAddress: b.address,
    buyerShippingAddress: b.address,
    buyerEmail: b.email,
    buyerPhone: b.phone,
    docDate: day,
    dueDate: dueDateFor(day, "Net 7"),
    terms: "Net 7",
    reference: req.poNumber ?? reference,
    customerNotes: req.notes,
    internalNotes: `Placed on the website by ${b.contactName} (${b.email}). Website order ${reference}.${outcome === "REVIEW" ? " Over the review amount: please check it, then accept or decline." : ""}`,
    lines,
  });
  if (!saved.ok) return { ok: false, code: "server_error", error: "We couldn't place the order. Please try again." };

  const discard = () => deleteDraftSilently(sf.organizationId, saved.id);

  // Second look at the stock with the order saved (it excludes itself): if another order took the units meanwhile, this one steps aside.
  const after = await salesStockContext(sf.organizationId, saved.id);
  const clash = shortfalls(after.stock, after.reserved, lines);
  if (clash.length) {
    await discard();
    const ids = clash.map((s) => req.lines[s.index].itemId);
    return { ok: false, code: "unavailable", error: "Some items are not available in that quantity.", unavailable: ids.map((itemId) => ({ itemId, name: offer.get(itemId)!.name })) };
  }

  const now = new Date().toISOString();
  const rowId = newId("sford");
  try {
    await db.update(salesDocuments).set({ status: outcome === "CONFIRMED" ? "ACCEPTED" : "SENT", source: "WEBSITE", sentAt: now, updatedAt: now }).where(and(eq(salesDocuments.id, saved.id), eq(salesDocuments.organizationId, sf.organizationId)));
    await db.insert(storefrontOrders).values({
      id: rowId, organizationId: sf.organizationId, storefrontId: sf.storefrontId, storefrontBuyerId: b.id, salesDocumentId: saved.id,
      reference, idempotencyKey: req.key, outcome, poNumber: req.poNumber, total: totals.total, source: opts.source,
    });
  } catch (err) {
    // A double submit that raced us: the other one won, so ours is removed and theirs is returned.
    await discard();
    const winner = await existingByKey(sf, b.id, req.key);
    if (winner) return { ok: true, created: false, order: await viewOf(sf.organizationId, winner) };
    console.error("[storefront-orders] saving the order failed:", err);
    return { ok: false, code: "server_error", error: "We couldn't place the order. Please try again." };
  }

  try {
    await db.insert(purchasingAuditLog).values({
      id: newId("paudit"), organizationId: sf.organizationId, userId: null, recordType: "storefront_order", recordId: rowId, fieldName: "placed",
      previousValue: null, newValue: `${reference} ${outcome === "CONFIRMED" ? "confirmed" : "needs review"}, ${lines.length} item(s), $${totals.total.toFixed(2)}`,
      note: `Pharmacy ${b.businessName} (${b.id}) via ${opts.source === "API" ? "the company's website" : "the storefront page"}.`,
    });
  } catch (err) {
    console.error("[storefront-orders] audit failed:", err);
  }

  // The email is best effort: the order stands whether or not it goes out.
  try {
    const mail = orderPlacedEmail({
      company: sf.displayName, contactName: b.contactName, reference, confirmed: outcome === "CONFIRMED",
      lines: lines.map((l) => ({ name: l.productName, condition: l.condition, quantity: l.quantity, unitPrice: l.unitPrice })),
      total: totals.total, poNumber: req.poNumber, ordersUrl: `${appUrl().replace(/\/$/, "")}/s/${sf.handle}/orders`,
    });
    const [o] = await db.select({ replyTo: organizations.shipFromEmail }).from(organizations).where(eq(organizations.id, sf.organizationId)).limit(1);
    const sent = await sendCustomerEmail({ to: b.email, subject: mail.subject, text: mail.text, html: mail.html, fromName: sf.displayName, replyTo: o?.replyTo ?? null });
    if (!sent.ok) console.error("[storefront-orders] order email not sent:", sent.error);
  } catch (err) {
    console.error("[storefront-orders] order email failed:", err);
  }

  const [row] = await db.select().from(storefrontOrders).where(eq(storefrontOrders.id, rowId)).limit(1);
  return { ok: true, created: true, order: await viewOf(sf.organizationId, row) };
}

// ---- the pharmacy's own orders -------------------------------------------------------------------------------------------------

export type OrderSummary = { reference: string; state: OrderState; createdAt: string; poNumber: string | null; total: number };

/** The pharmacy's own orders, newest first. Only this pharmacy's, in this company. */
export async function listOrders(sf: PublicStorefront, buyerId: string): Promise<OrderSummary[]> {
  const rows = await db
    .select({ reference: storefrontOrders.reference, createdAt: storefrontOrders.createdAt, poNumber: storefrontOrders.poNumber, rowTotal: storefrontOrders.total, status: salesDocuments.status, docTotal: salesDocuments.total })
    .from(storefrontOrders)
    .leftJoin(salesDocuments, and(eq(salesDocuments.id, storefrontOrders.salesDocumentId), eq(salesDocuments.organizationId, storefrontOrders.organizationId)))
    .where(and(eq(storefrontOrders.storefrontBuyerId, buyerId), eq(storefrontOrders.organizationId, sf.organizationId), eq(storefrontOrders.storefrontId, sf.storefrontId)))
    .orderBy(desc(storefrontOrders.createdAt))
    .limit(100);
  return rows.map((r) => ({ reference: r.reference, state: r.status ? orderStateOf(r.status) : "cancelled", createdAt: r.createdAt, poNumber: r.poNumber, total: r.docTotal ?? r.rowTotal }));
}

/** One of the pharmacy's own orders by its reference, or null (another pharmacy's order looks exactly like a missing one). */
export async function orderByReference(sf: PublicStorefront, buyerId: string, reference: string): Promise<OrderView | null> {
  const [row] = await db
    .select()
    .from(storefrontOrders)
    .where(and(eq(storefrontOrders.reference, reference), eq(storefrontOrders.storefrontBuyerId, buyerId), eq(storefrontOrders.organizationId, sf.organizationId), eq(storefrontOrders.storefrontId, sf.storefrontId)))
    .limit(1);
  return row ? viewOf(sf.organizationId, row) : null;
}

/** A website's way to find its own pharmacy: the approved, not-hidden account with this email at THIS storefront, or null. Secret key only. */
export async function findPharmacyByEmail(sf: PublicStorefront, rawEmail: unknown): Promise<{ id: string; businessName: string; contactName: string } | null> {
  const email = normalizeResetEmail(rawEmail);
  if (!emailCheck(email).ok) return null;
  const [b] = await db
    .select({ id: storefrontBuyers.id, businessName: storefrontBuyers.businessName, contactName: storefrontBuyers.contactName, status: storefrontBuyers.status, hiddenAt: storefrontBuyers.hiddenAt })
    .from(storefrontBuyers)
    .where(and(eq(storefrontBuyers.storefrontId, sf.storefrontId), eq(storefrontBuyers.organizationId, sf.organizationId), eq(storefrontBuyers.email, email)))
    .limit(1);
  if (!b || b.hiddenAt || !mayUseAccount(b.status)) return null;
  return { id: b.id, businessName: b.businessName, contactName: b.contactName };
}
