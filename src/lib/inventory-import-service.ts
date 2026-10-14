// Inventory -> Import Stock: the database side. The rules for reading the file are in inventory-import-rules.ts.
//
// An import writes ordinary Manual Add movements (kind MANUAL_ADD) so Live Stock, Stock History and Sales treat them exactly like
// stock added by hand. Every row of one import carries the same ref (the file's fingerprint), which is how
//   * the same file can't be imported twice (it would double the stock),
//   * the import is listed under "Recent imports", and
//   * it can be undone. Undoing never deletes anything: it adds reversing movements under the same ref, so the history is kept.
// Everything here is filtered by the signed-in company.

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { inventoryMovements, purchasingCategories, purchasingProducts, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { brandFor } from "@/lib/receiving-serial-rules";
import { getInventory, saveEstimate } from "@/lib/inventory-service";
import { normKey, productKeyOf } from "@/lib/inventory-rules";
import { IMPORT_REF_TYPE, type ImportProduct, type ImportRow } from "@/lib/inventory-import-rules";

const UNDO_REF_TYPE = "stock_import_undo";
type Org = { organizationId: string; userId: string };

/** The products this company can import stock for: active and not archived (the same list Manual Add offers). */
export async function importProducts(organizationId: string): Promise<ImportProduct[]> {
  const rows = await db
    .select({ id: purchasingProducts.id, name: purchasingProducts.name, category: purchasingCategories.name, noExpiration: purchasingProducts.noExpiration })
    .from(purchasingProducts)
    .leftJoin(purchasingCategories, eq(purchasingCategories.id, purchasingProducts.categoryId))
    .where(and(eq(purchasingProducts.organizationId, organizationId), eq(purchasingProducts.active, true), isNull(purchasingProducts.archivedAt)))
    .orderBy(asc(purchasingProducts.name));
  return rows.map((r) => ({ id: r.id, name: r.name, brand: (r.category ?? brandFor(r.name) ?? "Other").trim() || "Other", noExpiration: !!r.noExpiration }));
}

type RefRow = { id: string; kind: string; productKey: string; productId: string | null; productName: string; brand: string | null; condition: string; expirationDate: string | null; expirationEndDate: string | null; lotNumber: string | null; quantity: number; unitCost: number | null; refType: string | null; createdAt: string; createdByUserId: string | null; note: string | null };

async function refRows(organizationId: string, refId: string): Promise<RefRow[]> {
  return db
    .select()
    .from(inventoryMovements)
    .where(and(eq(inventoryMovements.organizationId, organizationId), eq(inventoryMovements.refId, refId), inArray(inventoryMovements.refType, [IMPORT_REF_TYPE, UNDO_REF_TYPE])));
}

const layerKey = (m: { productKey: string; condition: string; expirationDate: string | null; expirationEndDate?: string | null; lotNumber: string | null }) =>
  `${m.productKey}|${normKey(m.condition)}|${(m.expirationDate ?? "").slice(0, 10)}|${(m.expirationEndDate ?? "").slice(0, 10)}|${normKey(m.lotNumber)}`;

/** Units of one import still in stock because of it: what was added minus what was reversed. */
const netUnits = (rows: RefRow[]) => rows.reduce((n, r) => n + r.quantity, 0);

/** Has this exact file been imported and not undone? Returns when. */
export async function activeImport(organizationId: string, refId: string): Promise<{ at: string; by: string | null } | null> {
  const rows = await refRows(organizationId, refId);
  if (!rows.length || netUnits(rows) <= 0) return null;
  const first = rows.filter((r) => r.refType === IMPORT_REF_TYPE).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return first ? { at: first.createdAt, by: first.createdByUserId } : null;
}

export type CommitResult = { ok: true; lines: number; units: number } | { ok: false; error: string };

/**
 * Saves rows that have already been read and checked (status "ok"). One batch, so either every line is added or none is.
 * Refuses a file that is already imported. Estimated prices in the file are saved the way Manual Add saves them.
 */
export async function commitStockImport(org: Org, rows: ImportRow[], meta: { fileName: string; refId: string }): Promise<CommitResult> {
  const good = rows.filter((r) => r.status === "ok" && r.productId && r.quantity);
  if (!good.length) return { ok: false, error: "There is nothing to add." };
  if (await activeImport(org.organizationId, meta.refId)) return { ok: false, error: "This exact file was already imported. Adding it again would double your stock. If you want to import it again, undo the earlier import first (Recent imports, below)." };
  // The products must still be this company's (the file's names were matched a moment ago, but never trust that).
  const ids = [...new Set(good.map((r) => r.productId as string))];
  const owned = await db
    .select({ id: purchasingProducts.id, name: purchasingProducts.name })
    .from(purchasingProducts)
    .where(and(eq(purchasingProducts.organizationId, org.organizationId), inArray(purchasingProducts.id, ids)));
  const byId = new Map(owned.map((p) => [p.id, p]));
  if (ids.some((id) => !byId.has(id))) return { ok: false, error: "A product in the file is no longer in your catalog. Read the file again." };
  const note = `Imported from ${meta.fileName.replace(/[\u0000-\u001f]/g, " ").slice(0, 80)}`;
  const movements = good.map((r) => {
    const p = byId.get(r.productId as string)!;
    return {
      id: newId("invmove"),
      organizationId: org.organizationId,
      kind: "MANUAL_ADD" as const,
      productId: p.id,
      productKey: productKeyOf(p.id, p.name),
      productName: p.name,
      brand: r.brand && r.brand !== "Other" ? r.brand : null,
      condition: r.condition,
      expirationDate: r.noExpiration ? null : r.expiry,
      expirationEndDate: r.noExpiration ? null : r.expiryEnd,
      lotNumber: r.lot,
      quantity: r.quantity as number,
      unitCost: r.unitCost,
      note,
      refType: IMPORT_REF_TYPE,
      refId: meta.refId,
      createdByUserId: org.userId,
    };
  });
  const chunks: (typeof movements)[] = [];
  for (let i = 0; i < movements.length; i += 100) chunks.push(movements.slice(i, i + 100));
  await db.batch(chunks.map((c) => db.insert(inventoryMovements).values(c)) as unknown as Parameters<typeof db.batch>[0]);
  // estimated prices: the last row of a product + condition wins
  const est = new Map<string, { productKey: string; condKey: string; low: number | null; high: number | null }>();
  for (const [i, r] of good.entries()) {
    if (r.estLow == null && r.estHigh == null) continue;
    const productKey = movements[i].productKey;
    est.set(`${productKey}|${normKey(r.condition)}`, { productKey, condKey: normKey(r.condition), low: r.estLow, high: r.estHigh });
  }
  for (const e of est.values()) await saveEstimate(org, e.productKey, e.condKey, e.low, e.high);
  return { ok: true, lines: good.length, units: good.reduce((n, r) => n + (r.quantity as number), 0) };
}

export type ImportSummary = { refId: string; fileName: string; at: string; by: string | null; lines: number; units: number; remaining: number; undone: boolean };

/** The company's imports, newest first, with what is still in stock because of each. */
export async function listStockImports(organizationId: string, limit = 25): Promise<ImportSummary[]> {
  const rows = await db
    .select({ m: inventoryMovements, by: users.name })
    .from(inventoryMovements)
    .leftJoin(users, eq(users.id, inventoryMovements.createdByUserId))
    .where(and(eq(inventoryMovements.organizationId, organizationId), inArray(inventoryMovements.refType, [IMPORT_REF_TYPE, UNDO_REF_TYPE])))
    .orderBy(desc(inventoryMovements.createdAt));
  const groups = new Map<string, ImportSummary>();
  for (const { m, by } of rows) {
    const refId = m.refId ?? "";
    if (!refId) continue;
    const g = groups.get(refId) ?? { refId, fileName: "", at: "", by: null, lines: 0, units: 0, remaining: 0, undone: false };
    g.remaining += m.quantity;
    if (m.refType === IMPORT_REF_TYPE) {
      g.lines += 1;
      g.units += m.quantity;
      if (!g.at || m.createdAt > g.at) g.at = m.createdAt;
      g.fileName = g.fileName || (m.note ?? "").replace(/^Imported from /, "");
      g.by = g.by ?? by ?? null;
    }
    groups.set(refId, g);
  }
  return [...groups.values()].filter((g) => g.lines > 0).map((g) => ({ ...g, undone: g.remaining <= 0 })).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

export type UndoResult = { ok: true; units: number } | { ok: false; error: string };

/**
 * Takes an import back out of stock by adding reversing movements. Refused when some of those units have already been sold or
 * taken out (stock would go below zero): the person fixes that first. Nothing is deleted.
 */
export async function undoStockImport(org: Org, refId: string): Promise<UndoResult> {
  const rows = await refRows(org.organizationId, refId);
  if (!rows.some((r) => r.refType === IMPORT_REF_TYPE)) return { ok: false, error: "That import wasn't found." };
  const net = new Map<string, { sample: RefRow; qty: number }>();
  for (const r of rows) {
    const k = layerKey(r);
    const cur = net.get(k) ?? { sample: r, qty: 0 };
    cur.qty += r.quantity;
    net.set(k, cur);
  }
  const outstanding = [...net.entries()].filter(([, v]) => v.qty > 0);
  if (!outstanding.length) return { ok: false, error: "That import was already undone." };
  // Is each of those units still on the shelf? Stock of the same product, condition, date and lot must cover them.
  const inv = await getInventory(org.organizationId);
  const have = new Map<string, number>();
  for (const l of inv.layers) {
    const k = layerKey({ productKey: l.productKey, condition: l.condition, expirationDate: l.expiry, expirationEndDate: l.expiryEnd ?? null, lotNumber: l.lot });
    have.set(k, (have.get(k) ?? 0) + l.quantity);
  }
  for (const [k, v] of outstanding) {
    if ((have.get(k) ?? 0) < v.qty) return { ok: false, error: `Some of ${v.sample.productName} from this import has already been sold or taken out, so the import can't be undone. Fix that first (Stock History shows where it went).` };
  }
  const now = [...outstanding].map(([, v]) => ({
    id: newId("invmove"),
    organizationId: org.organizationId,
    kind: "ADJUSTMENT" as const,
    productId: v.sample.productId,
    productKey: v.sample.productKey,
    productName: v.sample.productName,
    brand: v.sample.brand,
    condition: v.sample.condition,
    expirationDate: v.sample.expirationDate,
    expirationEndDate: v.sample.expirationEndDate,
    lotNumber: v.sample.lotNumber,
    quantity: -v.qty,
    unitCost: v.sample.unitCost,
    note: `Undid ${(rows.find((r) => r.refType === IMPORT_REF_TYPE)?.note ?? "an import").replace(/^Imported from /, "import of ")}`,
    refType: UNDO_REF_TYPE,
    refId,
    createdByUserId: org.userId,
  }));
  const chunks: (typeof now)[] = [];
  for (let i = 0; i < now.length; i += 100) chunks.push(now.slice(i, i + 100));
  await db.batch(chunks.map((c) => db.insert(inventoryMovements).values(c)) as unknown as Parameters<typeof db.batch>[0]);
  return { ok: true, units: outstanding.reduce((n, [, v]) => n + v.qty, 0) };
}
