// The automatic "sell us your supplies" checkout, from the cart to the emailed shipping label.
//
// Who may call this: only code that has already found the company from a storefront's public address or a connection key
// (storefront-public.ts / the API routes). Nothing the customer sends chooses the company, a price, a total or a status. Prices come from the
// company's own price list through the SAME functions staff use (purchasing-quote-service.ts), the label is bought through the SAME label
// service (purchasing-label-service.ts, from the company's own carrier account), and bank details are stored encrypted and never put in a
// log, an email or an audit note.
//
// A failure after the order is saved (label, email) never undoes the order: the customer has already been told it was placed, the staff can
// finish the label by hand, and the order carries a flag that says why.

import { createHmac } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  organizations, purchasingCustomers, purchasingQuotationLabels, purchasingQuotations, purchasingQuotedItems, storefronts,
  websiteRequestPayouts, websiteRequests,
} from "@/db/schema";
import { encryptBank } from "@/lib/bank-crypto";
import { last4, payoutToJson, type Payout } from "@/lib/bank-rules";
import { checkoutOrderEmail } from "@/lib/checkout-emails";
import {
  addressKey, flagReasons, labelDecision, limitsOf, orderAllowed, type CartLine, type CheckoutCustomer,
} from "@/lib/checkout-rules";
import { sendCustomerEmail } from "@/lib/email";
import { newId } from "@/lib/ids";
import { sendDeptEmail } from "@/lib/mail-system";
import { buyAndSaveLabels } from "@/lib/purchasing-label-service";
import { priceBreakdown, roundCents } from "@/lib/purchasing-price";
import { resolvePricing } from "@/lib/purchasing-quote-service";
import { buildQuotationReceiptPdf } from "@/lib/purchasing-receipt-docs";
import {
  computeAutomaticBonus, getNextQuotationNumber, getProductConditionsMap, getProductExpiryOptionsMap, getPurchasingBonusTiers,
  getPurchasingConditions, getPurchasingExpirationRanges, getPurchasingProducts,
} from "@/lib/queries";
import type { PublicStorefront } from "@/lib/storefront-public";
import { makeReference, splitName } from "@/lib/storefront-rules";

// ---- the catalog a customer sees ---------------------------------------------------------------------------------------------------

export type CheckoutProduct = {
  id: string; name: string; code: string | null; ndc: string | null; category: string | null;
  /** The company's standard price before any expiry or condition adjustment. */
  price: number;
  noExpiration: boolean;
  expiry: { id: string; label: string; multiplier: number }[];
  conditions: { id: string; name: string; multiplier: number }[];
};
export type CheckoutCatalog = { products: CheckoutProduct[]; bonusTiers: { thresholdAmount: number; bonusAmount: number }[] };

/** The products a company is paying for right now, with the expiry bands and conditions each one offers. Only the company's own data. */
export async function loadCheckoutCatalog(organizationId: string): Promise<CheckoutCatalog> {
  const [products, condMap, expiryMap, conds, ranges, tiers] = await Promise.all([
    getPurchasingProducts(organizationId),
    getProductConditionsMap(organizationId),
    getProductExpiryOptionsMap(organizationId),
    getPurchasingConditions(organizationId),
    getPurchasingExpirationRanges(organizationId),
    getPurchasingBonusTiers(organizationId),
  ]);
  const condById = new Map(conds.map((c) => [c.id, c]));
  const activeRanges = new Map(ranges.map((r) => [r.id, r]));
  const out: CheckoutProduct[] = [];
  for (const p of products) {
    if (!(p.standardPrice > 0)) continue; // a $0 product is one the company is not buying right now
    const own = (condMap.get(p.id) ?? []).map((c) => condById.get(c.id)).filter((c): c is NonNullable<typeof c> => !!c);
    const conditions = (own.length ? own : conds).map((c) => ({ id: c.id, name: c.name, multiplier: c.multiplier }));
    let expiry: CheckoutProduct["expiry"] = [];
    if (!p.noExpiration) {
      const mine = (expiryMap.get(p.id) ?? []).filter((e) => activeRanges.has(e.id));
      expiry = mine.length
        ? mine.map((e) => ({ id: e.id, label: e.label, multiplier: e.multiplier }))
        : ranges.map((r) => ({ id: r.id, label: r.label, multiplier: r.defaultMultiplier ?? 1 }));
    }
    out.push({ id: p.id, name: p.name, code: p.productCode, ndc: p.ndc, category: p.categoryName ?? null, price: p.standardPrice, noExpiration: p.noExpiration, expiry, conditions });
  }
  return { products: out, bonusTiers: tiers.map((t) => ({ thresholdAmount: t.thresholdAmount, bonusAmount: t.bonusAmount })) };
}

// ---- pricing a cart ----------------------------------------------------------------------------------------------------------------

export type PricedLine = {
  productId: string; name: string; code: string | null; category: string | null;
  expirationRangeId: string | null; expiryLabel: string | null;
  conditionId: string | null; conditionName: string | null;
  quantity: number; baseUnitPrice: number; appliedMultiplier: number; conditionMultiplier: number; unitPrice: number; lineTotal: number;
};
export type PricedCart = { lines: PricedLine[]; itemsTotal: number; bonus: number; bonusLabel: string | null; total: number };

/**
 * Prices a checked cart from the company's own price list. Every line must be a product the company is buying, with an expiry band and a
 * condition it really offers for that product. Returns a plain-words error for the customer otherwise.
 */
export async function priceCart(organizationId: string, catalog: CheckoutCatalog, cart: CartLine[]): Promise<{ ok: true; cart: PricedCart } | { ok: false; error: string }> {
  const byId = new Map(catalog.products.map((p) => [p.id, p]));
  const lines: PricedLine[] = [];
  for (let i = 0; i < cart.length; i++) {
    const l = cart[i];
    const p = byId.get(l.productId);
    if (!p) return { ok: false, error: `Line ${i + 1}: that product is not being bought right now. Please remove it.` };
    let rangeId: string | null = null;
    if (!p.noExpiration && p.expiry.length > 0) {
      if (!l.expirationRangeId || !p.expiry.some((e) => e.id === l.expirationRangeId)) return { ok: false, error: `Choose how long until "${p.name}" expires.` };
      rangeId = l.expirationRangeId;
    }
    let conditionId: string | null = null;
    if (p.conditions.length > 0) {
      if (!l.conditionId || !p.conditions.some((c) => c.id === l.conditionId)) return { ok: false, error: `Choose the condition of "${p.name}".` };
      conditionId = l.conditionId;
    }
    const pr = await resolvePricing(organizationId, { productId: p.id, expirationRangeId: rangeId, conditionId, customConditionName: null, customConditionMultiplierRaw: null, fallbackProductNameSnapshot: null });
    if ("error" in pr) return { ok: false, error: `Line ${i + 1}: ${pr.error}` };
    if (!(pr.baseUnitPrice > 0)) return { ok: false, error: `"${p.name}" is not being bought right now. Please remove it.` };
    const unitPrice = priceBreakdown(pr.baseUnitPrice, pr.appliedMultiplier, pr.conditionMultiplier).unitPrice;
    lines.push({
      productId: p.id, name: pr.productNameSnapshot, code: pr.productCodeSnapshot, category: pr.categoryNameSnapshot,
      expirationRangeId: pr.expirationRangeId, expiryLabel: pr.expirationRangeLabelSnapshot, conditionId: pr.conditionId, conditionName: pr.conditionNameSnapshot,
      quantity: l.quantity, baseUnitPrice: pr.baseUnitPrice, appliedMultiplier: pr.appliedMultiplier, conditionMultiplier: pr.conditionMultiplier,
      unitPrice, lineTotal: roundCents(unitPrice * l.quantity),
    });
  }
  const itemsTotal = roundCents(lines.reduce((s, l) => s + l.lineTotal, 0));
  const { bonusAmount, tier } = computeAutomaticBonus(itemsTotal, catalog.bonusTiers.map((t) => ({ ...t, active: true })));
  return { ok: true, cart: { lines, itemsTotal, bonus: bonusAmount, bonusLabel: tier ? `$${tier.thresholdAmount}+ -> $${tier.bonusAmount} bonus` : null, total: roundCents(itemsTotal + bonusAmount) } };
}

/** The line detail the customer reads: "6+ months, Mint". */
export const lineDetail = (l: { expiryLabel: string | null; conditionName: string | null }) => [l.expiryLabel, l.conditionName].filter(Boolean).join(", ");

// ---- the customer's own order page -------------------------------------------------------------------------------------------------

function tokenSecret(): string {
  const s = process.env.AUTH_SECRET || process.env.BANK_DATA_KEY;
  if (!s) throw new Error("No secret is configured.");
  return s;
}
/** The private link part that lets a customer reopen THEIR order (printing the label again). It proves nothing else and opens no other order. */
export function viewToken(organizationId: string, reference: string): string {
  return createHmac("sha256", tokenSecret()).update(`checkout-view|${organizationId}|${reference}`).digest("base64url").slice(0, 32);
}
export function tokenOk(organizationId: string, reference: string, token: string | null | undefined): boolean {
  if (!token || token.length !== 32) return false;
  const want = viewToken(organizationId, reference);
  let diff = 0;
  for (let i = 0; i < 32; i++) diff |= want.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export function publicBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://jindjinni.com").replace(/\/+$/, "");
}
export const orderViewUrl = (organizationId: string, handle: string, reference: string) => `${publicBaseUrl()}/s/${handle}/order-status/${reference}?k=${viewToken(organizationId, reference)}`;

export type OrderView = {
  reference: string; quotationNumber: string; quotationId: string; status: string; createdAt: string;
  customerName: string; email: string; businessName: string;
  lines: { name: string; detail: string; quantity: number; unitPrice: number; lineTotal: number }[];
  itemsTotal: number; bonus: number; total: number;
  label: { status: string; carrierName: string | null; trackingNumber: string | null; trackingUrl: string | null; labelUrl: string | null; labels: { number: number; labelUrl: string | null; trackingNumber: string | null; trackingUrl: string | null }[] };
  packageStatus: string;
  accountLast4: string | null; accountType: string | null;
  flagReason: string | null; copySentAt: string | null; hiddenAt: string | null;
};

/** Everything about one website order that is safe to show: prices, label, tracking. Never the full bank numbers. */
export async function loadOrderView(organizationId: string, reference: string): Promise<OrderView | null> {
  const [r] = await db.select().from(websiteRequests).where(and(eq(websiteRequests.organizationId, organizationId), eq(websiteRequests.reference, reference))).limit(1);
  if (!r || !r.quotationId) return null;
  const [q] = await db.select().from(purchasingQuotations).where(and(eq(purchasingQuotations.id, r.quotationId), eq(purchasingQuotations.organizationId, organizationId))).limit(1);
  if (!q) return null;
  const [items, labels, [pay]] = await Promise.all([
    db.select().from(purchasingQuotedItems).where(eq(purchasingQuotedItems.quotationId, q.id)).orderBy(purchasingQuotedItems.createdAt),
    db.select().from(purchasingQuotationLabels).where(and(eq(purchasingQuotationLabels.organizationId, organizationId), eq(purchasingQuotationLabels.quotationId, q.id))).orderBy(purchasingQuotationLabels.labelNumber),
    db.select({ last4: websiteRequestPayouts.accountLast4, type: websiteRequestPayouts.accountType }).from(websiteRequestPayouts).where(and(eq(websiteRequestPayouts.organizationId, organizationId), eq(websiteRequestPayouts.requestId, r.id))).limit(1),
  ]);
  const carrierName = q.labelStatus === "GENERATED" ? (q.labelCarrier === "UPS_GROUND" ? "UPS" : "USPS") : null;
  return {
    reference: r.reference, quotationNumber: q.quotationNumber, quotationId: q.id, status: q.status, createdAt: r.createdAt,
    customerName: q.customerNameSnapshot, email: r.email, businessName: r.businessName,
    lines: items.map((l) => ({
      name: l.productNameSnapshot,
      detail: [l.expirationRangeLabelSnapshot, l.conditionNameSnapshot].filter(Boolean).join(", "),
      quantity: l.quantity, unitPrice: l.finalUnitPrice, lineTotal: l.lineTotal,
    })),
    itemsTotal: q.itemsTotal, bonus: q.bonusAmount, total: q.grandTotal,
    label: {
      status: q.labelStatus, carrierName, trackingNumber: q.labelTrackingNumber ?? null, trackingUrl: q.labelTrackingUrl ?? null, labelUrl: q.labelUrl ?? null,
      labels: labels.map((l) => ({ number: l.labelNumber, labelUrl: l.labelUrl ?? null, trackingNumber: l.trackingNumber ?? null, trackingUrl: l.trackingUrl ?? null })),
    },
    packageStatus: q.packageStatus,
    accountLast4: pay?.last4 ?? null, accountType: pay?.type ?? null,
    flagReason: r.flagReason ?? null, copySentAt: r.copySentAt ?? null, hiddenAt: r.hiddenAt ?? null,
  };
}

// ---- the email ---------------------------------------------------------------------------------------------------------------------

export type MailSent = { ok: true } | { ok: false; error: string };

/** Emails the customer the quotation and label. From the Purchasing mailbox when the company has one, otherwise from the platform in the company's name. */
export async function emailOrderToCustomer(organizationId: string, handle: string, companyName: string, reference: string, opts: { isCopy: boolean; labelPendingHint?: boolean; to?: string }): Promise<MailSent> {
  const v = await loadOrderView(organizationId, reference);
  if (!v) return { ok: false, error: "Order not found." };
  const mail = checkoutOrderEmail({
    company: companyName, contactName: v.customerName, reference: v.reference, quotationNumber: v.quotationNumber,
    lines: v.lines, itemsTotal: v.itemsTotal, bonus: v.bonus, total: v.total,
    carrierName: v.label.carrierName, trackingNumber: v.label.trackingNumber, labelUrl: v.label.labelUrl,
    labelPending: !v.label.labelUrl && (opts.labelPendingHint ?? true), viewUrl: orderViewUrl(organizationId, handle, reference),
    accountLast4: v.accountLast4, isCopy: opts.isCopy,
  });
  let attachments: { filename: string; content: Buffer }[] = [];
  try {
    const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    const built = await buildQuotationReceiptPdf(organizationId, org?.name ?? companyName, v.quotationId);
    if (built) attachments = [{ filename: built.filename, content: Buffer.from(built.bytes) }];
  } catch (e) {
    console.error("[checkout] quotation PDF for the email failed:", e);
  }
  const args = { to: opts.to || v.email, subject: mail.subject, text: mail.text, html: mail.html, fromName: companyName, attachments };
  const viaDept = await sendDeptEmail(organizationId, { dept: "purchasing", relatedKind: "quotation", relatedId: v.quotationId }, args).catch((e) => ({ ok: false as const, error: String(e) }));
  if (viaDept.ok) return { ok: true };
  const fallback = await sendCustomerEmail(args);
  return fallback.ok ? { ok: true } : { ok: false, error: fallback.error };
}

// ---- placing the order -------------------------------------------------------------------------------------------------------------

export type PlaceInput = {
  customer: CheckoutCustomer;
  cart: CartLine[];
  payout: Payout;
  /** Makes sending the same order twice make one order. */
  orderKey: string;
  /** The total the customer was shown. When our price list moved since, the order is not placed and they see the new total. */
  expectedTotal: number | null;
  source: "PAGE" | "API";
};

export type PlaceResult =
  | { ok: true; created: boolean; reference: string; viewUrl: string; emailed: boolean; order: OrderView }
  | { ok: false; error: string; code: "closed" | "invalid" | "limit" | "price_changed"; newTotal?: number };

const dayAgoStamp = () => new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");

export async function placeCheckoutOrder(sf: PublicStorefront, input: PlaceInput): Promise<PlaceResult> {
  const orgId = sf.organizationId;
  const [store] = await db.select().from(storefronts).where(and(eq(storefronts.id, sf.storefrontId), eq(storefronts.organizationId, orgId))).limit(1);
  if (!store || !store.checkoutOpen) return { ok: false, code: "closed", error: "This company is not taking orders through its website right now." };

  // The same order sent twice (double click, a website that retries) is one order.
  const [again] = await db.select({ reference: websiteRequests.reference }).from(websiteRequests).where(and(eq(websiteRequests.organizationId, orgId), eq(websiteRequests.orderKey, input.orderKey))).limit(1);
  if (again) {
    const order = await loadOrderView(orgId, again.reference);
    if (order) return { ok: true, created: false, reference: again.reference, viewUrl: orderViewUrl(orgId, sf.handle, again.reference), emailed: false, order };
  }

  const limits = limitsOf(store);
  const since = dayAgoStamp();
  const recent = await db
    .select({ email: websiteRequests.email, street1: websiteRequests.street1, zip: websiteRequests.zip })
    .from(websiteRequests)
    .where(and(eq(websiteRequests.organizationId, orgId), eq(websiteRequests.kind, "ORDER"), gt(websiteRequests.createdAt, since)));
  const c = input.customer;
  const allowed = orderAllowed({ fromThisEmail: recent.filter((r) => r.email === c.email).length, allToday: recent.length, limits });
  if (!allowed.ok) return { ok: false, code: "limit", error: allowed.error };
  const myKey = addressKey(c.street1, c.zip);
  const sameAddressOrdersToday = recent.filter((r) => addressKey(r.street1, r.zip) === myKey).length;

  const catalog = await loadCheckoutCatalog(orgId);
  const priced = await priceCart(orgId, catalog, input.cart);
  if (!priced.ok) return { ok: false, code: "invalid", error: priced.error };
  const cart = priced.cart;
  if (input.expectedTotal !== null && Math.abs(input.expectedTotal - cart.total) > 0.005) {
    return { ok: false, code: "price_changed", newTotal: cart.total, error: `Our prices changed while you were ordering. The new estimated payout is $${cart.total.toFixed(2)}. Please review it and submit again.` };
  }

  // ---- save everything together or nothing ----
  const customerRow = await findOrPlanCustomer(orgId, c);
  const quotationId = newId("pquote");
  const requestId = newId("wreq");
  const today = new Date().toISOString().slice(0, 10);
  let reference = "";
  let saved = false;
  for (let attempt = 0; attempt < 6 && !saved; attempt++) {
    reference = makeReference();
    const quotationNumber = await getNextQuotationNumber(orgId);
    type Stmt = Parameters<typeof db.batch>[0][number];
    const stmts: Stmt[] = [];
    if (customerRow.isNew) {
      const { firstName, lastName } = splitName(c.contactName);
      stmts.push(db.insert(purchasingCustomers).values({
        id: customerRow.id, organizationId: orgId, firstName, lastName, email: c.email, phone: c.phone,
        addressStreet1: c.street1, addressStreet2: c.street2, addressCity: c.city, addressState: c.state, addressZip: c.zip, addressCountry: "US",
        isResidential: c.isResidential, notes: `${c.businessName ? `${c.businessName} ` : ""}(website order ${reference})`,
      }));
    }
    stmts.push(db.insert(purchasingQuotations).values({
      id: quotationId, organizationId: orgId, quotationNumber, customerId: customerRow.id, customerNameSnapshot: c.contactName,
      customerEmailSnapshot: c.email, customerPhoneSnapshot: c.phone, quotationDate: today, source: "WEBSITE",
      itemsTotal: cart.itemsTotal, bonusAmount: cart.bonus, bonusTierLabelSnapshot: cart.bonusLabel, grandTotal: cart.total,
      notes: [`Website order ${reference}${c.businessName ? ` from ${c.businessName}` : ""}.`, c.notes ? `Their note: ${c.notes}` : ""].filter(Boolean).join("\n"),
      createdByUserId: null,
    }));
    for (const l of cart.lines) {
      stmts.push(db.insert(purchasingQuotedItems).values({
        id: newId("pqitem"), quotationId, productId: l.productId, productNameSnapshot: l.name, productCodeSnapshot: l.code, categoryNameSnapshot: l.category,
        conditionId: l.conditionId, conditionNameSnapshot: l.conditionName, expirationRangeId: l.expirationRangeId, expirationRangeLabelSnapshot: l.expiryLabel,
        quantity: l.quantity, baseUnitPrice: l.baseUnitPrice, appliedMultiplier: l.appliedMultiplier, conditionMultiplier: l.conditionMultiplier,
        finalUnitPrice: l.unitPrice, lineTotal: l.lineTotal, notes: null,
      }));
    }
    stmts.push(db.insert(websiteRequests).values({
      id: requestId, organizationId: orgId, storefrontId: sf.storefrontId, reference, status: "QUOTED", kind: "ORDER", orderKey: input.orderKey,
      businessName: c.businessName || c.contactName, contactName: c.contactName, email: c.email, phone: c.phone,
      street1: c.street1, street2: c.street2, city: c.city, state: c.state, zip: c.zip,
      itemsText: cart.lines.map((l) => `${l.quantity} x ${l.name}${lineDetail(l) ? ` (${lineDetail(l)})` : ""}`).join("\n"),
      notes: c.notes, source: input.source === "API" ? "API" : "CHECKOUT", quotationId,
    }));
    stmts.push(db.insert(websiteRequestPayouts).values({
      id: newId("wpay"), organizationId: orgId, requestId, payloadEnc: encryptBank(payoutToJson(input.payout), `${orgId}|${requestId}`),
      accountLast4: last4(input.payout.accountNumber), accountType: input.payout.accountType,
    }));
    try {
      await db.batch(stmts as [Stmt, ...Stmt[]]);
      saved = true;
    } catch (err) {
      const msg = String(err).toLowerCase();
      if (msg.includes("unique") && msg.includes("order_key")) {
        // A double click raced us: the other one won, so return its order.
        const [won] = await db.select({ reference: websiteRequests.reference }).from(websiteRequests).where(and(eq(websiteRequests.organizationId, orgId), eq(websiteRequests.orderKey, input.orderKey))).limit(1);
        if (won) {
          const order = await loadOrderView(orgId, won.reference);
          if (order) return { ok: true, created: false, reference: won.reference, viewUrl: orderViewUrl(orgId, sf.handle, won.reference), emailed: false, order };
        }
      }
      if (!msg.includes("unique")) throw err;
    }
  }
  if (!saved) return { ok: false, code: "invalid", error: "Something went wrong. Please try again in a minute." };

  // ---- the free label, within the company's limits ----
  const [qRow] = await db.select().from(purchasingQuotations).where(eq(purchasingQuotations.id, quotationId)).limit(1);
  const [{ n: labelsToday } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(purchasingQuotationLabels)
    .innerJoin(purchasingQuotations, eq(purchasingQuotationLabels.quotationId, purchasingQuotations.id))
    .where(and(eq(purchasingQuotationLabels.organizationId, orgId), eq(purchasingQuotations.source, "WEBSITE"), gt(purchasingQuotationLabels.createdAt, since)));
  const decision = labelDecision({ total: cart.total, labelMax: limits.labelMax, labelsToday: Number(labelsToday ?? 0), labelsPerDay: limits.labelsPerDay });
  let labelHeld: string | null = null;
  let labelFailed = false;
  if (decision.buy) {
    const res = await buyAndSaveLabels({
      organizationId: orgId, quotation: qRow, labelCarrier: "UPS_GROUND", labelCount: 1, maxTotal: 1,
      parcel: { lengthIn: qRow.parcelLengthIn, widthIn: qRow.parcelWidthIn, heightIn: qRow.parcelHeightIn, weightLb: qRow.parcelWeightLb },
    }).catch((e) => ({ bought: 0, error: String(e) }));
    if (res.bought < 1) {
      labelFailed = true;
      console.error("[checkout] automatic label failed for", reference, res.error);
    }
  } else {
    labelHeld = decision.reason;
  }

  const maxQuantity = Math.max(...cart.lines.map((l) => l.quantity));
  const flags = flagReasons({ total: cart.total, flagOver: limits.flagOver, maxQuantity, sameAddressOrdersToday, labelHeld, labelFailed });
  if (flags.length > 0) await db.update(websiteRequests).set({ flagReason: flags.join("; ") }).where(eq(websiteRequests.id, requestId));

  // ---- tell the customer ----
  let emailed = false;
  try {
    const sent = await emailOrderToCustomer(orgId, sf.handle, sf.displayName, reference, { isCopy: false });
    emailed = sent.ok;
    if (!sent.ok) console.error("[checkout] confirmation email failed for", reference, sent.error);
  } catch (e) {
    console.error("[checkout] confirmation email failed:", e);
  }

  const order = (await loadOrderView(orgId, reference))!;
  return { ok: true, created: true, reference, viewUrl: orderViewUrl(orgId, sf.handle, reference), emailed, order };
}

/** An existing customer at this email AND address is reused; anyone else becomes a new customer (an address is never overwritten from the web). */
async function findOrPlanCustomer(organizationId: string, c: CheckoutCustomer): Promise<{ id: string; isNew: boolean }> {
  const rows = await db
    .select({ id: purchasingCustomers.id, street1: purchasingCustomers.addressStreet1, zip: purchasingCustomers.addressZip })
    .from(purchasingCustomers)
    .where(and(eq(purchasingCustomers.organizationId, organizationId), sql`lower(${purchasingCustomers.email}) = ${c.email}`, isNull(purchasingCustomers.archivedAt)))
    .orderBy(desc(purchasingCustomers.createdAt))
    .limit(20);
  const want = addressKey(c.street1, c.zip);
  const hit = rows.find((r) => r.street1 && r.zip && addressKey(r.street1, r.zip) === want);
  return hit ? { id: hit.id, isNew: false } : { id: newId("pcust"), isNew: true };
}

/** Counts used by the staff page. */
export async function flaggedOrderCount(organizationId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)` })
    .from(websiteRequests)
    .where(and(eq(websiteRequests.organizationId, organizationId), eq(websiteRequests.kind, "ORDER"), isNull(websiteRequests.hiddenAt), sql`${websiteRequests.flagReason} is not null`, eq(websiteRequests.status, "QUOTED")));
  return Number(r?.n ?? 0);
}
