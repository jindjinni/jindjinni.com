// Inventory: loading stock from the database and recording changes. The arithmetic is in inventory-rules.ts.
//
// Where stock comes from:
//   * RECEIVED   Receiving's accepted units, read live from receiving_intake_lines (nothing is copied, so a correction
//                made in Receiving shows here at once). Recalled, counterfeit-hold, pending-return and fully returned
//                lines are not stock (the same rule as Daily Receiving), and neither is anything received "Expired".
//   * MANUAL     units added by hand (opening stock, corrections): inventory_movements, kind MANUAL_ADD.
//   * SALE       units Sales took out: negative inventory_movements (see deductStock, the hook the Sales department uses).

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { inventoryEstimates, inventoryMovements, purchasingCategories, purchasingExpirationRanges, purchasingProducts, receivingItems } from "@/db/schema";
import { newId } from "@/lib/ids";
import { getReceivedItems } from "@/lib/receiving-queries";
import { dayOf, heldReason } from "@/lib/receiving-daily";
import { brandFor } from "@/lib/receiving-serial-rules";
import { getPaymentTerms } from "@/lib/accounts-queries";
import { todayIn } from "@/lib/payment-due";
import {
  allocateTake,
  buildLines,
  estimateKey,
  normalizeExpiry,
  normKey,
  productKeyOf,
  type Estimate,
  type ExpiryRange,
  type StockLayer,
  type StockLine,
} from "@/lib/inventory-rules";

const clean = (v: string | null | undefined) => (v ?? "").trim();

export type InventorySnapshot = {
  today: string;
  ranges: ExpiryRange[];
  estimates: Map<string, Estimate>;
  layers: StockLayer[];
  lines: StockLine[];
};

/** The month ranges the company set up in Purchasing (active ones), longest first. */
export async function getExpiryRanges(organizationId: string): Promise<ExpiryRange[]> {
  const rows = await db
    .select({ label: purchasingExpirationRanges.label, minMonths: purchasingExpirationRanges.minMonths, maxMonths: purchasingExpirationRanges.maxMonths })
    .from(purchasingExpirationRanges)
    .where(and(eq(purchasingExpirationRanges.organizationId, organizationId), eq(purchasingExpirationRanges.active, true)))
    .orderBy(asc(purchasingExpirationRanges.sortOrder));
  return rows;
}

export async function getEstimates(organizationId: string): Promise<Map<string, Estimate>> {
  const rows = await db.select().from(inventoryEstimates).where(eq(inventoryEstimates.organizationId, organizationId));
  return new Map(rows.map((r) => [`${r.productKey}|${r.conditionKey}`, { low: r.priceLow, high: r.priceHigh }]));
}

/** What a unit of each received row cost: its quotation line (or the adjusted amount) divided by the quoted quantity. */
async function costsBySourceItem(organizationId: string, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 400) {
    const rows = await db
      .select({
        id: receivingItems.id,
        quotedAmount: receivingItems.quotedAmount,
        quotedQuantity: receivingItems.quotedQuantity,
        quotationAdjusted: receivingItems.quotationAdjusted,
        proposedRevisedAmount: receivingItems.proposedRevisedAmount,
        quantityReceived: receivingItems.quantityReceived,
      })
      .from(receivingItems)
      .where(and(eq(receivingItems.organizationId, organizationId), inArray(receivingItems.id, ids.slice(i, i + 400))));
    for (const r of rows) {
      const amount = r.quotationAdjusted === "YES" && r.proposedRevisedAmount != null ? r.proposedRevisedAmount : r.quotedAmount;
      const qty = r.quotedQuantity ?? r.quantityReceived ?? 0;
      if (amount != null && qty > 0) out.set(r.id, Math.round((amount / qty) * 10000) / 10000);
    }
  }
  return out;
}

/** Receiving's accepted units as layers. */
export async function receivedLayers(organizationId: string): Promise<StockLayer[]> {
  const rows: Awaited<ReturnType<typeof getReceivedItems>>["rows"] = [];
  for (let offset = 0; ; offset += 5000) {
    const page = await getReceivedItems(organizationId, { limit: 5000, offset });
    rows.push(...page.rows);
    if (page.rows.length < 5000) break;
  }
  const good = rows.filter((r) => !heldReason(r) && (r.quantityAccepted ?? 0) > 0 && clean(r.condition).toLowerCase() !== "expired");
  const costs = await costsBySourceItem(organizationId, [...new Set(good.map((r) => r.sourceItemId).filter((x): x is string => !!x))]);
  return good.map((r) => ({
    source: "RECEIVED" as const,
    refId: r.id,
    productKey: productKeyOf(r.productId, r.productName),
    productId: r.productId,
    productName: clean(r.productName),
    brand: clean(r.brand) || brandFor(r.productName),
    condition: clean(r.condition) || "Unspecified",
    expiry: normalizeExpiry(r.expirationDate) ?? normalizeExpiry(r.expirationEarliest),
    lot: clean(r.lotNumber) || null,
    quantity: r.quantityAccepted as number,
    unitCost: r.sourceItemId ? costs.get(r.sourceItemId) ?? null : null,
    day: dayOf(r.receivedAt),
    orderNumber: r.orderNumber,
    customer: r.customer,
    packageId: r.packageId,
    sourceItemId: r.sourceItemId ?? null,
  }));
}

export async function movementLayers(organizationId: string): Promise<StockLayer[]> {
  const rows = await db.select().from(inventoryMovements).where(eq(inventoryMovements.organizationId, organizationId));
  return rows.map((m) => ({
    source: m.kind === "MANUAL_ADD" ? ("MANUAL" as const) : m.kind === "SALE" ? ("SALE" as const) : ("ADJUSTMENT" as const),
    refId: m.id,
    productKey: m.productKey,
    productId: m.productId,
    productName: m.productName,
    brand: m.brand,
    condition: m.condition,
    expiry: normalizeExpiry(m.expirationDate),
    lot: clean(m.lotNumber) || null,
    quantity: m.quantity,
    unitCost: m.unitCost,
    day: m.createdAt.slice(0, 10),
    note: m.note,
  }));
}

/** Everything the Stock screens need, as of today in the company's time zone. */
export async function getInventory(organizationId: string): Promise<InventorySnapshot> {
  const [terms, ranges, estimates, received, moves] = await Promise.all([
    getPaymentTerms(organizationId),
    getExpiryRanges(organizationId),
    getEstimates(organizationId),
    receivedLayers(organizationId),
    movementLayers(organizationId),
  ]);
  const today = todayIn(terms.timeZone);
  const layers = [...received, ...moves];
  return { today, ranges, estimates, layers, lines: buildLines(layers, today, ranges, estimates) };
}

// ---- manual add ---------------------------------------------------------------------------------------------------

export type ManualLineInput = {
  productId: string;
  condition: string;
  quantity: number;
  expiry?: string | null;
  lot?: string | null;
  unitCost?: number | null;
  estLow?: number | null;
  estHigh?: number | null;
};

export type ManualResult = { ok: true; added: number; units: number } | { ok: false; error: string };

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

/** Adds stock by hand. Every row is checked before anything is saved; one bad row saves nothing. */
export async function addManualStock(
  org: { organizationId: string; userId: string },
  lines: ManualLineInput[],
  note: string,
  allowedConditions: string[],
): Promise<ManualResult> {
  if (!lines.length) return { ok: false, error: "Add at least one product line." };
  if (lines.length > 200) return { ok: false, error: "Add up to 200 lines at a time." };
  const ids = [...new Set(lines.map((l) => l.productId))];
  const products = await db
    .select({ id: purchasingProducts.id, name: purchasingProducts.name, category: purchasingCategories.name, noExpiration: purchasingProducts.noExpiration })
    .from(purchasingProducts)
    .leftJoin(purchasingCategories, eq(purchasingCategories.id, purchasingProducts.categoryId))
    .where(and(eq(purchasingProducts.organizationId, org.organizationId), inArray(purchasingProducts.id, ids)));
  const byId = new Map(products.map((p) => [p.id, p]));
  const rows: (typeof inventoryMovements.$inferInsert)[] = [];
  const estimates = new Map<string, { productKey: string; condKey: string; low: number | null; high: number | null }>();
  for (const [i, l] of lines.entries()) {
    const at = `Line ${i + 1}`;
    const p = byId.get(l.productId);
    if (!p) return { ok: false, error: `${at}: choose a product from the list.` };
    const condition = clean(l.condition);
    if (!condition || !allowedConditions.some((c) => c.toLowerCase() === condition.toLowerCase())) return { ok: false, error: `${at}: choose a condition.` };
    if (!Number.isInteger(l.quantity) || l.quantity <= 0 || l.quantity > 1_000_000) return { ok: false, error: `${at}: enter a quantity of 1 or more.` };
    const expiryRaw = clean(l.expiry);
    const expiry = expiryRaw ? normalizeExpiry(expiryRaw) : null;
    if (expiryRaw && !expiry) return { ok: false, error: `${at}: the expiration date isn't a valid date.` };
    const cost = num(l.unitCost);
    const low = num(l.estLow);
    const high = num(l.estHigh);
    if ([cost, low, high].some((v) => v != null && (Number.isNaN(v) || v < 0))) return { ok: false, error: `${at}: prices must be numbers of 0 or more.` };
    if (low != null && high != null && low > high) return { ok: false, error: `${at}: the lowest estimated price is higher than the highest.` };
    const key = productKeyOf(p.id, p.name);
    rows.push({
      id: newId("invmove"),
      organizationId: org.organizationId,
      kind: "MANUAL_ADD",
      productId: p.id,
      productKey: key,
      productName: p.name,
      brand: p.category ?? brandFor(p.name),
      condition: canonicalCondition(condition, allowedConditions),
      expirationDate: p.noExpiration ? null : expiry,
      lotNumber: clean(l.lot) || null,
      quantity: l.quantity,
      unitCost: cost,
      note: clean(note) || null,
      createdByUserId: org.userId,
    });
    if (low != null || high != null) estimates.set(`${key}|${normKey(condition)}`, { productKey: key, condKey: normKey(condition), low, high });
  }
  await db.insert(inventoryMovements).values(rows);
  for (const e of estimates.values()) await saveEstimate(org, e.productKey, e.condKey, e.low, e.high);
  return { ok: true, added: rows.length, units: rows.reduce((n, r) => n + r.quantity, 0) };
}

const canonicalCondition = (c: string, allowed: string[]) => allowed.find((a) => a.toLowerCase() === c.toLowerCase()) ?? c;

export async function saveEstimate(org: { organizationId: string; userId: string }, productKey: string, conditionKey: string, low: number | null, high: number | null) {
  const existing = await db
    .select({ id: inventoryEstimates.id })
    .from(inventoryEstimates)
    .where(and(eq(inventoryEstimates.organizationId, org.organizationId), eq(inventoryEstimates.productKey, productKey), eq(inventoryEstimates.conditionKey, conditionKey)))
    .limit(1);
  if (existing[0]) {
    await db.update(inventoryEstimates).set({ priceLow: low, priceHigh: high, updatedByUserId: org.userId, updatedAt: new Date().toISOString() }).where(eq(inventoryEstimates.id, existing[0].id));
  } else {
    await db.insert(inventoryEstimates).values({ id: newId("invest"), organizationId: org.organizationId, productKey, conditionKey, priceLow: low, priceHigh: high, updatedByUserId: org.userId });
  }
}

// ---- Sales hook ---------------------------------------------------------------------------------------------------

export type DeductInput = {
  productKey: string;
  condition: string;
  /** Only take from this expiration group (the key a line carries); omit to take from any, earliest expiration first. */
  groupKey?: string | null;
  quantity: number;
  /** What caused it, so the history says why (e.g. refType "invoice", refId the invoice id). */
  refType?: string;
  refId?: string;
  note?: string;
};

export type DeductResult = { ok: true; movementIds: string[]; units: number } | { ok: false; error: string; available: number };

/**
 * Takes units out of live stock for a sale. This is the one door the Sales department uses: it chooses the layers
 * (earliest expiration first), records a negative movement for each, and refuses, changing nothing, when there aren't enough.
 */
export async function deductStock(org: { organizationId: string; userId: string }, input: DeductInput): Promise<DeductResult> {
  const [terms, ranges, received, moves] = await Promise.all([getPaymentTerms(org.organizationId), getExpiryRanges(org.organizationId), receivedLayers(org.organizationId), movementLayers(org.organizationId)]);
  const today = todayIn(terms.timeZone);
  const plan = allocateTake([...received, ...moves], { productKey: input.productKey, condition: input.condition, groupKey: input.groupKey ?? null, quantity: input.quantity }, today, ranges);
  if (!plan.ok) return { ok: false, available: plan.available, error: plan.available <= 0 ? "None of that product is in stock." : `Only ${plan.available} in stock, ${plan.wanted} wanted.` };
  const rows = plan.takes.map((t) => ({
    id: newId("invmove"),
    organizationId: org.organizationId,
    kind: "SALE" as const,
    productId: t.productId,
    productKey: t.productKey,
    productName: t.productName,
    brand: t.brand,
    condition: t.condition,
    expirationDate: t.expiry,
    lotNumber: t.lot,
    quantity: -t.quantity,
    unitCost: t.unitCost,
    note: input.note ?? null,
    refType: input.refType ?? null,
    refId: input.refId ?? null,
    createdByUserId: org.userId,
  }));
  await db.insert(inventoryMovements).values(rows);
  return { ok: true, movementIds: rows.map((r) => r.id), units: input.quantity };
}

/** The most recent hand-made and sale movements, newest first (the Movements history shows Receiving's separately). */
export async function recentMovements(organizationId: string, limit = 300) {
  return db.select().from(inventoryMovements).where(eq(inventoryMovements.organizationId, organizationId)).orderBy(desc(inventoryMovements.createdAt)).limit(limit);
}

export { estimateKey };
