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
import { inventoryBrandOverrides, inventoryEstimates, inventoryMovements, purchasingCategories, purchasingExpirationRanges, purchasingProducts, receivingItems } from "@/db/schema";
import { newId } from "@/lib/ids";
import { getReceivedItems } from "@/lib/receiving-queries";
import { returnMarkedInStep7 } from "@/lib/receiving-rules";
import { dayOf, heldReason } from "@/lib/receiving-daily";
import { parseExpiryInput } from "@/lib/expiry-range-rules";
import { brandFor } from "@/lib/receiving-serial-rules";
import { getPaymentTerms } from "@/lib/accounts-queries";
import { todayIn } from "@/lib/payment-due";
import {
  allocateTake,
  buildLines,
  estimateKey,
  layerIdOf,
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

/**
 * The dates of a received row: one date, or a range when Receiving recorded an earliest and a latest that differ
 * (the "A date range" entry). The earliest is `expiry` (what selling and near-expiry follow), the latest is `expiryEnd`.
 */
function receivedDates(r: { expirationDate: string | null; expirationEarliest: string | null; expirationLatest: string | null }): { expiry: string | null; expiryEnd: string | null } {
  const first = normalizeExpiry(r.expirationDate) ?? normalizeExpiry(r.expirationEarliest);
  const earliest = normalizeExpiry(r.expirationEarliest);
  const latest = normalizeExpiry(r.expirationLatest);
  const start = earliest && first && earliest < first ? earliest : first;
  return { expiry: start, expiryEnd: start && latest && latest > start ? latest : null };
}

/** Products re-filed under another brand: productKey -> brand. */
export async function getBrandOverrides(organizationId: string): Promise<Map<string, string>> {
  const rows = await db.select({ productKey: inventoryBrandOverrides.productKey, brand: inventoryBrandOverrides.brand }).from(inventoryBrandOverrides).where(eq(inventoryBrandOverrides.organizationId, organizationId));
  return new Map(rows.map((r) => [r.productKey, r.brand]));
}

/** The received product rows (by id) that say "Return Required: Yes". */
async function returnMarkedItems(organizationId: string, ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 400) {
    const rows = await db
      .select({ id: receivingItems.id })
      .from(receivingItems)
      .where(and(eq(receivingItems.organizationId, organizationId), eq(receivingItems.returnRequired, "YES"), inArray(receivingItems.id, ids.slice(i, i + 400))));
    for (const r of rows) out.add(r.id);
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
  // A line whose product row says "Return Required: Yes" (Step 7) is going back, even if its Step 6 answer was never changed.
  const marked = await returnMarkedItems(organizationId, [...new Set(rows.map((r) => r.sourceItemId).filter((x): x is string => !!x))]);
  const good = rows.filter(
    (r) =>
      !heldReason(r) &&
      (r.quantityAccepted ?? 0) > 0 &&
      clean(r.condition).toLowerCase() !== "expired" &&
      !(r.sourceItemId && marked.has(r.sourceItemId) && returnMarkedInStep7(r.needsReturn, "YES")),
  );
  const costs = await costsBySourceItem(organizationId, [...new Set(good.map((r) => r.sourceItemId).filter((x): x is string => !!x))]);
  return good.map((r) => ({
    source: "RECEIVED" as const,
    refId: r.id,
    productKey: productKeyOf(r.productId, r.productName),
    productId: r.productId,
    productName: clean(r.productName),
    brand: clean(r.brand) || brandFor(r.productName),
    condition: clean(r.condition) || "Unspecified",
    ...receivedDates(r),
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
    expiryEnd: normalizeExpiry(m.expirationEndDate),
    lot: clean(m.lotNumber) || null,
    quantity: m.quantity,
    unitCost: m.unitCost,
    day: m.createdAt.slice(0, 10),
    note: m.note,
  }));
}

/** Everything the Stock screens need, as of today in the company's time zone. */
export async function getInventory(organizationId: string, opts: { groupBy?: "months" | "range" } = {}): Promise<InventorySnapshot> {
  const [terms, ranges, estimates, received, moves] = await Promise.all([
    getPaymentTerms(organizationId),
    getExpiryRanges(organizationId),
    getEstimates(organizationId),
    receivedLayers(organizationId),
    movementLayers(organizationId),
  ]);
  const today = todayIn(terms.timeZone);
  // A product the team re-filed under another brand shows there everywhere (Live Stock, the Sales editor); the units themselves don't move.
  const overrides = await getBrandOverrides(organizationId);
  const layers = [...received, ...moves].map((l) => {
    const b = overrides.get(l.productKey);
    return b ? { ...l, brand: b } : l;
  });
  return { today, ranges, estimates, layers, lines: buildLines(layers, today, ranges, estimates, { groupBy: opts.groupBy }) };
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
    // A single day, a single month, or a month range like 8/2027-6/2028.
    const read = parseExpiryInput(l.expiry);
    if (!read.ok) return { ok: false, error: `${at}: ${read.error}` };
    const expiry = read.from;
    const expiryEnd = read.to;
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
      expirationEndDate: p.noExpiration ? null : expiryEnd,
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
    expirationEndDate: t.expiryEnd,
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

export type DeductManyResult =
  | { ok: true; results: { movementIds: string[]; takes: { expiry: string | null; expiryEnd: string | null; lot: string | null; quantity: number }[] }[] }
  | { ok: false; index: number; error: string; available: number };

/**
 * Takes out several products in one go (one invoice). The layers are read once and each line is taken from what the
 * lines before it left; nothing is written unless EVERY line can be filled, so a short line never leaves a half-sold
 * invoice. With `dryRun` nothing is written either way (used to find the real expiration dates behind a quotation).
 */
export async function deductStockMany(org: { organizationId: string; userId: string }, inputs: DeductInput[], opts: { dryRun?: boolean } = {}): Promise<DeductManyResult> {
  const [terms, ranges, received, moves] = await Promise.all([getPaymentTerms(org.organizationId), getExpiryRanges(org.organizationId), receivedLayers(org.organizationId), movementLayers(org.organizationId)]);
  const today = todayIn(terms.timeZone);
  const working: StockLayer[] = [...received, ...moves];
  const rows: (typeof inventoryMovements.$inferInsert)[] = [];
  const results: { movementIds: string[]; takes: { expiry: string | null; expiryEnd: string | null; lot: string | null; quantity: number }[] }[] = [];
  for (const [index, input] of inputs.entries()) {
    const plan = allocateTake(working, { productKey: input.productKey, condition: input.condition, groupKey: input.groupKey ?? null, quantity: input.quantity }, today, ranges);
    if (!plan.ok) return { ok: false, index, available: plan.available, error: plan.available <= 0 ? "None of that product is in stock." : `Only ${plan.available} in stock, ${plan.wanted} wanted.` };
    const ids: string[] = [];
    for (const t of plan.takes) {
      const id = newId("invmove");
      ids.push(id);
      rows.push({
        id,
        organizationId: org.organizationId,
        kind: "SALE",
        productId: t.productId,
        productKey: t.productKey,
        productName: t.productName,
        brand: t.brand,
        condition: t.condition,
        expirationDate: t.expiry,
        expirationEndDate: t.expiryEnd,
        lotNumber: t.lot,
        quantity: -t.quantity,
        unitCost: t.unitCost,
        note: input.note ?? null,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        createdByUserId: org.userId,
      });
      // The next line must not take the same units again.
      working.push({ source: "SALE", refId: id, productKey: t.productKey, productId: t.productId, productName: t.productName, brand: t.brand, condition: t.condition, expiry: t.expiry, expiryEnd: t.expiryEnd, lot: t.lot, quantity: -t.quantity, unitCost: t.unitCost, day: today });
    }
    results.push({ movementIds: ids, takes: plan.takes.map((t) => ({ expiry: t.expiry, expiryEnd: t.expiryEnd, lot: t.lot, quantity: t.quantity })) });
  }
  if (!opts.dryRun && rows.length) await db.insert(inventoryMovements).values(rows);
  return { ok: true, results };
}

/**
 * Puts back what a sale took out (an invoice voided, or its items changed after it was sent): one positive ADJUSTMENT per
 * layer, same cost. Only what is still out is returned -- units already put back earlier (by an edit) are not put back twice,
 * so a void after an edit returns exactly what the invoice holds now. The new rows' ids come back so a failed edit can undo them.
 */
export async function returnSaleDetailed(org: { organizationId: string; userId: string }, refType: string, refId: string, note: string): Promise<{ units: number; ids: string[] }> {
  const rows = await db
    .select()
    .from(inventoryMovements)
    .where(and(eq(inventoryMovements.organizationId, org.organizationId), inArray(inventoryMovements.kind, ["SALE", "ADJUSTMENT"]), eq(inventoryMovements.refType, refType), eq(inventoryMovements.refId, refId)));
  const layer = (m: (typeof rows)[number]) => [m.productKey, normKey(m.condition ?? ""), m.expirationDate ?? "", m.expirationEndDate ?? "", m.lotNumber ?? ""].join("|");
  const out = new Map<string, { first: (typeof rows)[number]; n: number }>();
  for (const m of rows) {
    const key = layer(m);
    if (m.kind === "SALE" && m.quantity < 0) {
      const have = out.get(key);
      if (have) have.n += -m.quantity;
      else out.set(key, { first: m, n: -m.quantity });
    }
  }
  for (const m of rows) {
    if (m.kind === "ADJUSTMENT" && m.quantity > 0) {
      const have = out.get(layer(m));
      if (have) have.n -= m.quantity;
    }
  }
  const back = [...out.values()].filter((x) => x.n > 0);
  if (!back.length) return { units: 0, ids: [] };
  const values = back.map(({ first: m, n }) => ({
    id: newId("invmove"),
    organizationId: org.organizationId,
    kind: "ADJUSTMENT" as const,
    productId: m.productId,
    productKey: m.productKey,
    productName: m.productName,
    brand: m.brand,
    condition: m.condition,
    expirationDate: m.expirationDate,
    expirationEndDate: m.expirationEndDate,
    lotNumber: m.lotNumber,
    quantity: n,
    unitCost: m.unitCost,
    note,
    refType,
    refId,
    createdByUserId: org.userId,
  }));
  await db.insert(inventoryMovements).values(values);
  return { units: values.reduce((n, v) => n + v.quantity, 0), ids: values.map((v) => v.id) };
}

/** Puts back what a sale took out (an invoice voided): see `returnSaleDetailed`. Returns the number of units. */
export async function returnSale(org: { organizationId: string; userId: string }, refType: string, refId: string, note: string): Promise<number> {
  return (await returnSaleDetailed(org, refType, refId, note)).units;
}

// ---- re-filing a product under another brand ---------------------------------------------------------------------

export type BrandFix = { ok: true; brand: string; fromBrand: string; reset: boolean } | { ok: false; error: string };

/**
 * A product sits under the wrong brand (category) in Live Stock because of how it was received, added or imported. This files it under
 * the right one. No units move and no Receiving record changes: it is one label per product. `brand` blank puts the product back under the
 * brand it came in with. A typed brand that matches an existing one in different capitals uses the existing spelling.
 */
export async function setProductBrand(org: { organizationId: string; userId: string }, productKey: string, brandIn: string, knownBrands: string[]): Promise<BrandFix> {
  const inv = await getInventory(org.organizationId);
  const mine = inv.layers.filter((l) => l.productKey === productKey);
  if (!mine.length) return { ok: false, error: "That product wasn't found in stock." };
  const fromBrand = clean(mine[0].brand) || "Other";
  const wanted = clean(brandIn).replace(/\s+/g, " ");
  const existing = await db.select({ id: inventoryBrandOverrides.id }).from(inventoryBrandOverrides).where(and(eq(inventoryBrandOverrides.organizationId, org.organizationId), eq(inventoryBrandOverrides.productKey, productKey))).limit(1);
  if (!wanted) {
    if (existing[0]) await db.delete(inventoryBrandOverrides).where(eq(inventoryBrandOverrides.id, existing[0].id));
    return { ok: true, brand: fromBrand, fromBrand, reset: true };
  }
  if (wanted.length < 2 || wanted.length > 60) return { ok: false, error: "A brand name is 2 to 60 characters." };
  const brand = [...knownBrands, ...inv.layers.map((l) => clean(l.brand))].find((b) => b && b.toLowerCase() === wanted.toLowerCase()) ?? wanted;
  if (brand.toLowerCase() === fromBrand.toLowerCase()) return { ok: false, error: `It is already under ${fromBrand}.` };
  if (existing[0]) await db.update(inventoryBrandOverrides).set({ brand, updatedByUserId: org.userId, updatedAt: new Date().toISOString() }).where(eq(inventoryBrandOverrides.id, existing[0].id));
  else await db.insert(inventoryBrandOverrides).values({ id: newId("invbrand"), organizationId: org.organizationId, productKey, brand, updatedByUserId: org.userId });
  return { ok: true, brand, fromBrand, reset: false };
}

// ---- correcting a product's name ----------------------------------------------------------------------------------

export type NameFix = { ok: true; units: number; lines: number; toKey: string; toName: string; toProductId: string | null; fromName: string } | { ok: false; error: string };

/**
 * A product was received, added or imported under the wrong name but the quantities are right. This moves ALL of that product's
 * stock to the right product: for every exact layer (condition, expiration or month range, lot) it writes one ADJUSTMENT that takes
 * the units off the old name and one that puts the same units, with the same cost, on the new one. Nothing from Receiving is touched
 * (its records keep the name they were received under), the quantities and dating are unchanged, and the two rows per layer show in
 * the movements history with a note. `target` is a catalog product, or a typed name for stock that has no catalog entry.
 */
export async function correctProductName(
  org: { organizationId: string; userId: string },
  fromKey: string,
  target: { productId?: string | null; name?: string | null },
): Promise<NameFix> {
  const inv = await getInventory(org.organizationId);
  const mine = inv.layers.filter((l) => l.productKey === fromKey);
  if (!mine.length) return { ok: false, error: "That product wasn't found in stock." };
  const fromName = clean(mine[0].productName);

  let toId: string | null = null;
  let toName: string;
  let toBrand: string | null;
  if (target.productId) {
    const [p] = await db
      .select({ id: purchasingProducts.id, name: purchasingProducts.name, category: purchasingCategories.name })
      .from(purchasingProducts)
      .leftJoin(purchasingCategories, eq(purchasingCategories.id, purchasingProducts.categoryId))
      .where(and(eq(purchasingProducts.organizationId, org.organizationId), eq(purchasingProducts.id, target.productId)))
      .limit(1);
    if (!p) return { ok: false, error: "Choose the correct product from the list." };
    toId = p.id;
    toName = clean(p.name);
    toBrand = clean(p.category) || brandFor(p.name);
  } else {
    toName = clean(target.name).replace(/\s+/g, " ");
    if (toName.length < 2 || toName.length > 160) return { ok: false, error: "Type the product's name (2 to 160 characters), or choose it from the list." };
    toBrand = brandFor(toName);
  }
  const toKey = productKeyOf(toId, toName);
  if (toKey === fromKey) return { ok: false, error: "That is already this product. Choose a different one." };

  // What is really in stock on each exact layer.
  const byLayer = new Map<string, { first: StockLayer; net: number; costUnits: number; costSum: number }>();
  for (const l of mine) {
    const id = layerIdOf(l);
    const g = byLayer.get(id) ?? { first: l, net: 0, costUnits: 0, costSum: 0 };
    g.net += l.quantity;
    if (l.quantity > 0 && l.unitCost != null) { g.costUnits += l.quantity; g.costSum += l.unitCost * l.quantity; }
    byLayer.set(id, g);
  }
  const moving = [...byLayer.values()].filter((g) => g.net > 0);
  if (!moving.length) return { ok: false, error: "There is no stock under that name to move." };

  const note = `Name corrected: "${fromName}" to "${toName}"`.slice(0, 300);
  const rows: (typeof inventoryMovements.$inferInsert)[] = [];
  for (const g of moving) {
    const l = g.first;
    const cost = g.costUnits > 0 ? Math.round((g.costSum / g.costUnits) * 100) / 100 : null;
    const common = { organizationId: org.organizationId, kind: "ADJUSTMENT" as const, condition: l.condition, expirationDate: l.expiry, expirationEndDate: l.expiryEnd ?? null, lotNumber: l.lot, note, refType: "name_fix", refId: fromKey, createdByUserId: org.userId };
    rows.push({ ...common, id: newId("invmove"), productId: l.productId, productKey: fromKey, productName: l.productName, brand: l.brand, quantity: -g.net, unitCost: cost });
    rows.push({ ...common, id: newId("invmove"), productId: toId, productKey: toKey, productName: toName, brand: toBrand, quantity: g.net, unitCost: cost });
  }
  await db.insert(inventoryMovements).values(rows);

  // The estimated selling prices follow, unless the right product already has its own.
  const have = await getEstimates(org.organizationId);
  for (const [k, e] of have) {
    if (!k.startsWith(`${fromKey}|`)) continue;
    const condKey = k.slice(fromKey.length + 1);
    if (!have.has(`${toKey}|${condKey}`)) await saveEstimate(org, toKey, condKey, e.low, e.high);
  }
  return { ok: true, units: moving.reduce((n, g) => n + g.net, 0), lines: moving.length, toKey, toName, toProductId: toId, fromName };
}

// ---- correcting stock lines ---------------------------------------------------------------------------------------

export type StockLineEdit = {
  /** The exact layer being corrected (as Live Stock shows it). */
  from: { condition: string; expiry: string | null; expiryEnd: string | null; lot: string | null };
  /** What it should be. `expiry` is typed text (8/2027-6/2028, 8/2027, 8/15/2027); blank cost keeps the cost it had. */
  to: { condition: string; expiry: string; lot: string; quantity: number; unitCost: number | string | null };
};

export type StockFix = { ok: true; changed: number; rows: number } | { ok: false; error: string };

/**
 * Reconciliation: a count, a grading or an import turned out wrong. Corrects whole lots of one product -- quantity, condition,
 * expiration (date or month range), lot number, cost, and optionally the product itself -- by writing ADJUSTMENT movements: the old
 * layer is taken to zero and the corrected one is put in its place (or, when only the quantity changed, just the difference). Nothing
 * Receiving recorded is changed, so receipts, serial numbers and the audit trail stay as they were, and every change is in the
 * movements history with the reason. All the rows are checked first; one bad row changes nothing. A change that would leave fewer
 * units of a product and condition than open invoices are holding is refused.
 * `held` is what drafts hold, "productKey|condition" -> units (Sales owns that number).
 */
export async function correctStockLines(
  org: { organizationId: string; userId: string },
  productKey: string,
  target: { productId?: string | null; name?: string | null } | null,
  edits: StockLineEdit[],
  reason: string,
  allowedConditions: string[],
  held: Record<string, number>,
): Promise<StockFix> {
  const why = clean(reason).replace(/\s+/g, " ");
  if (why.length < 3) return { ok: false, error: "Say why you are correcting this (for example: recount, graded wrong, import mistake)." };
  if (why.length > 200) return { ok: false, error: "Keep the reason to 200 characters or fewer." };
  if (!edits.length) return { ok: false, error: "Nothing to change." };
  const inv = await getInventory(org.organizationId);
  const mine = inv.layers.filter((l) => l.productKey === productKey);
  if (!mine.length) return { ok: false, error: "That product wasn't found in stock." };
  const first = mine[0];

  // Which product the corrected lots belong to.
  let toId: string | null = first.productId;
  let toName = clean(first.productName);
  let toBrand: string | null = first.brand;
  let toNoExpiry = false;
  if (target && (target.productId || clean(target.name))) {
    if (target.productId) {
      const [p] = await db
        .select({ id: purchasingProducts.id, name: purchasingProducts.name, category: purchasingCategories.name, noExpiration: purchasingProducts.noExpiration })
        .from(purchasingProducts)
        .leftJoin(purchasingCategories, eq(purchasingCategories.id, purchasingProducts.categoryId))
        .where(and(eq(purchasingProducts.organizationId, org.organizationId), eq(purchasingProducts.id, target.productId)))
        .limit(1);
      if (!p) return { ok: false, error: "Choose the correct product from the list." };
      toId = p.id; toName = clean(p.name); toBrand = clean(p.category) || brandFor(p.name); toNoExpiry = !!p.noExpiration;
    } else {
      toId = null; toName = clean(target.name).replace(/\s+/g, " ");
      if (toName.length < 2 || toName.length > 160) return { ok: false, error: "Type the product's name (2 to 160 characters), or choose it from the list." };
      toBrand = brandFor(toName);
    }
  }
  const toKey = productKeyOf(toId, toName);

  const net = new Map<string, { net: number; costUnits: number; costSum: number; layer: StockLayer }>();
  for (const l of mine) {
    const id = layerIdOf(l);
    const g = net.get(id) ?? { net: 0, costUnits: 0, costSum: 0, layer: l };
    g.net += l.quantity;
    if (l.quantity > 0 && l.unitCost != null) { g.costUnits += l.quantity; g.costSum += l.unitCost * l.quantity; }
    net.set(id, g);
  }

  const rows: (typeof inventoryMovements.$inferInsert)[] = [];
  const delta = new Map<string, number>(); // "productKey|condKey" -> change in units
  const bump = (k: string, n: number) => delta.set(k, (delta.get(k) ?? 0) + n);
  const seen = new Set<string>();
  const movedConditions = new Map<string, { fromCond: string; toCond: string }>();
  let units = 0;
  for (const [i, e] of edits.entries()) {
    const at = `Row ${i + 1}`;
    const fromId = layerIdOf({ productKey, condition: e.from.condition, expiry: normalizeExpiry(e.from.expiry), expiryEnd: normalizeExpiry(e.from.expiryEnd), lot: clean(e.from.lot) || null });
    if (seen.has(fromId)) return { ok: false, error: `${at}: that lot is listed twice.` };
    seen.add(fromId);
    const old = net.get(fromId);
    if (!old) return { ok: false, error: `${at}: this lot changed while you were editing. Reload the page and try again.` };
    const condIn = clean(e.to.condition);
    const unchangedCond = normKey(condIn) === normKey(e.from.condition);
    const condition = unchangedCond ? e.from.condition : allowedConditions.find((c) => c.toLowerCase() === condIn.toLowerCase());
    if (!condition) return { ok: false, error: `${at}: choose a condition from the list.` };
    const qty = Number(e.to.quantity);
    if (!Number.isInteger(qty) || qty < 0 || qty > 1_000_000) return { ok: false, error: `${at}: the quantity must be a whole number of 0 or more.` };
    const read = parseExpiryInput(e.to.expiry);
    if (!read.ok) return { ok: false, error: `${at}: ${read.error}` };
    const expiry = toNoExpiry ? null : read.from;
    const expiryEnd = toNoExpiry ? null : read.to;
    const lot = clean(e.to.lot) || null;
    if (lot && lot.length > 80) return { ok: false, error: `${at}: the lot number is too long.` };
    const oldCost = old.costUnits > 0 ? Math.round((old.costSum / old.costUnits) * 100) / 100 : null;
    let cost = oldCost;
    let costChanged = false;
    if (e.to.unitCost !== null && e.to.unitCost !== undefined && String(e.to.unitCost).trim() !== "") {
      const c = Number(e.to.unitCost);
      if (!Number.isFinite(c) || c < 0 || c > 1_000_000) return { ok: false, error: `${at}: the cost must be a number of 0 or more.` };
      cost = Math.round(c * 100) / 100;
      costChanged = cost !== oldCost;
    }
    const toLayer = layerIdOf({ productKey: toKey, condition, expiry, expiryEnd, lot });
    const fromKeyCond = `${productKey}|${normKey(e.from.condition)}`;
    const toKeyCond = `${toKey}|${normKey(condition)}`;
    const l = old.layer;
    const note = `Correction: ${why}`.slice(0, 300);
    const base = { organizationId: org.organizationId, kind: "ADJUSTMENT" as const, note, refType: "stock_fix", refId: productKey, createdByUserId: org.userId };
    const oldRow = (q: number) => ({ ...base, id: newId("invmove"), productId: l.productId, productKey, productName: l.productName, brand: l.brand, condition: l.condition, expirationDate: l.expiry, expirationEndDate: l.expiryEnd ?? null, lotNumber: l.lot, quantity: q, unitCost: oldCost });
    const newRow = (q: number) => ({ ...base, id: newId("invmove"), productId: toId, productKey: toKey, productName: toName, brand: toBrand, condition, expirationDate: expiry, expirationEndDate: expiryEnd, lotNumber: lot, quantity: q, unitCost: cost });
    if (toLayer === fromId) {
      if (!costChanged && qty === old.net) continue;
      if (!costChanged) { rows.push({ ...oldRow(qty - old.net), unitCost: oldCost }); bump(fromKeyCond, qty - old.net); }
      else { if (old.net !== 0) rows.push(oldRow(-old.net)); if (qty !== 0) rows.push(newRow(qty)); bump(fromKeyCond, qty - old.net); }
      units += Math.abs(qty - old.net);
    } else {
      if (old.net !== 0) rows.push(oldRow(-old.net));
      if (qty > 0) rows.push(newRow(qty));
      bump(fromKeyCond, -old.net); bump(toKeyCond, qty);
      units += Math.max(Math.abs(old.net), qty);
      movedConditions.set(`${normKey(e.from.condition)}>${normKey(condition)}`, { fromCond: e.from.condition, toCond: condition });
    }
  }
  if (!rows.length) return { ok: false, error: "Nothing was changed." };

  // Units that open invoices are holding can't be taken away from under them.
  const totals = new Map<string, number>();
  for (const l of inv.layers) { const k = `${l.productKey}|${normKey(l.condition)}`; totals.set(k, (totals.get(k) ?? 0) + l.quantity); }
  for (const [k, d] of delta) {
    if (d >= 0) continue;
    const h = held[k] ?? 0;
    if (h > 0 && (totals.get(k) ?? 0) + d < h) {
      const [, cond] = k.split("|");
      return { ok: false, error: `Open invoices are holding ${h} ${h === 1 ? "unit" : "units"} of ${first.productName} (${cond}). Change or finish those first, then correct the stock.` };
    }
  }

  await db.insert(inventoryMovements).values(rows);

  // Estimated selling prices follow a product or condition change, unless the new one has its own.
  if (toKey !== productKey || movedConditions.size) {
    const have = await getEstimates(org.organizationId);
    for (const e of edits) {
      const cond = clean(e.to.condition) || e.from.condition;
      const fromEst = have.get(`${productKey}|${normKey(e.from.condition)}`);
      if (fromEst && !have.has(`${toKey}|${normKey(cond)}`)) await saveEstimate(org, toKey, normKey(cond), fromEst.low, fromEst.high);
    }
  }
  return { ok: true, changed: units, rows: rows.length };
}

/** Removes movement rows made a moment ago in the same request (undoing a sale whose email failed). */
export async function discardMovements(organizationId: string, ids: string[]) {
  for (let i = 0; i < ids.length; i += 200) {
    await db.delete(inventoryMovements).where(and(eq(inventoryMovements.organizationId, organizationId), inArray(inventoryMovements.id, ids.slice(i, i + 200))));
  }
}

/** The most recent hand-made and sale movements, newest first (the Movements history shows Receiving's separately). */
export async function recentMovements(organizationId: string, limit = 300) {
  return db.select().from(inventoryMovements).where(eq(inventoryMovements.organizationId, organizationId)).orderBy(desc(inventoryMovements.createdAt)).limit(limit);
}

export { estimateKey };
