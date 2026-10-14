"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/tenant";
import { canWriteInventory } from "@/lib/permissions";
import { MANUAL_CONDITIONS } from "@/lib/inventory-conditions";
import { addManualStock, correctProductName, correctStockLines, saveEstimate, type ManualLineInput, type StockLineEdit } from "@/lib/inventory-service";
import { heldByProductCondition, reservedByDrafts, retargetHeldLines } from "@/lib/sales-service";
import { featureOn } from "@/lib/features";
import { normKey } from "@/lib/inventory-rules";
import { logActivity } from "@/lib/hr-service";

export type InventoryActionState = { ok?: boolean; error?: string; message?: string };

/** Manual Add: one or more product lines (brand and product, condition, quantity, expiration, cost, estimated price range). */
export async function addStockAction(input: { lines: ManualLineInput[]; note: string }): Promise<InventoryActionState> {
  const org = await requireOrg();
  if (!canWriteInventory(org.role, org.access)) return { error: "Only a Purchasing Manager, Admin or the Owner can add stock by hand." };
  const lines = Array.isArray(input?.lines) ? input.lines.map((l) => ({ ...l, quantity: Number(l.quantity) })) : [];
  const res = await addManualStock(org, lines, String(input?.note ?? "").slice(0, 300), [...MANUAL_CONDITIONS]);
  if (!res.ok) return { error: res.error };
  await logActivity(org, "STOCK_CHANGE", `Added ${res.units} ${res.units === 1 ? "unit" : "units"} to stock by hand${input?.note ? ` (${String(input.note).slice(0, 80)})` : ""}`, null);
  revalidatePath("/dashboard/inventory", "layout");
  return { ok: true, message: `Added ${res.units} ${res.units === 1 ? "unit" : "units"} on ${res.added} ${res.added === 1 ? "line" : "lines"}.` };
}

/** Estimated Prices: the low and high selling price of one product in one condition (blank clears it). */
export async function saveEstimatesAction(rows: { productKey: string; condition: string; low: string; high: string }[]): Promise<InventoryActionState> {
  const org = await requireOrg();
  if (!canWriteInventory(org.role, org.access)) return { error: "Only a Purchasing Manager, Admin or the Owner can change estimated prices." };
  if (!Array.isArray(rows) || rows.length > 2000) return { error: "Nothing to save." };
  const parsed: { productKey: string; condKey: string; low: number | null; high: number | null }[] = [];
  for (const r of rows) {
    const low = String(r.low ?? "").trim() === "" ? null : Number(r.low);
    const high = String(r.high ?? "").trim() === "" ? null : Number(r.high);
    if ([low, high].some((v) => v != null && (!Number.isFinite(v) || v < 0))) return { error: `${r.productKey.startsWith("name:") ? r.productKey.slice(5) : "A product"}: prices must be numbers of 0 or more.` };
    if (low != null && high != null && low > high) return { error: "A lowest price is higher than its highest price." };
    parsed.push({ productKey: String(r.productKey), condKey: normKey(String(r.condition)), low, high });
  }
  for (const p of parsed) await saveEstimate(org, p.productKey, p.condKey, p.low, p.high);
  revalidatePath("/dashboard/inventory", "layout");
  return { ok: true, message: "Estimated prices saved." };
}

/** Fix name: moves all of one product's stock to the right product (a catalog product, or a typed name), quantities unchanged. */
export async function fixProductNameAction(input: { fromKey: string; productId?: string | null; name?: string | null }): Promise<InventoryActionState> {
  const org = await requireOrg();
  if (!canWriteInventory(org.role, org.access)) return { error: "Only a Purchasing Manager, Admin, the Owner, or someone given work in Inventory can correct a product's name." };
  if (!(await featureOn("inventory-fix-name", org.organizationId))) return { error: "Correcting a product's name isn't turned on for your company yet." };
  const fromKey = String(input?.fromKey ?? "");
  if (!fromKey) return { error: "Choose a product." };
  const res = await correctProductName(org, fromKey, { productId: input?.productId ? String(input.productId) : null, name: input?.name ? String(input.name) : null });
  if (!res.ok) return { error: res.error };
  const held = await retargetHeldLines(org.organizationId, fromKey, { key: res.toKey, productId: res.toProductId, name: res.toName });
  await logActivity(org, "STOCK_CHANGE", `Corrected a product name in stock: "${res.fromName}" to "${res.toName}" (${res.units} ${res.units === 1 ? "unit" : "units"})`, null);
  revalidatePath("/dashboard/inventory", "layout");
  revalidatePath("/dashboard/sales", "layout");
  return { ok: true, message: `Done. ${res.units} ${res.units === 1 ? "unit" : "units"} of "${res.fromName}" are now "${res.toName}".${held ? ` ${held} open ${held === 1 ? "invoice line was" : "invoice lines were"} updated too.` : ""}` };
}

/** Edit a stock line: corrects the quantity, condition, expiration, lot, cost (and optionally the product) of one or more lots of a product. */
export async function correctStockAction(input: { productKey: string; productId?: string | null; name?: string | null; reason: string; edits: StockLineEdit[] }): Promise<InventoryActionState> {
  const org = await requireOrg();
  if (!canWriteInventory(org.role, org.access)) return { error: "Only a Purchasing Manager, Admin, the Owner, or someone given work in Inventory can correct stock." };
  if (!(await featureOn("inventory-edit-stock", org.organizationId))) return { error: "Editing stock isn't turned on for your company yet." };
  const edits = Array.isArray(input?.edits) ? input.edits.slice(0, 200) : [];
  const held = heldByProductCondition(await reservedByDrafts(org.organizationId));
  const res = await correctStockLines(org, String(input?.productKey ?? ""), input?.productId || input?.name ? { productId: input.productId ? String(input.productId) : null, name: input.name ? String(input.name) : null } : null, edits, String(input?.reason ?? "").slice(0, 400), [...MANUAL_CONDITIONS], held);
  if (!res.ok) return { error: res.error };
  await logActivity(org, "STOCK_CHANGE", `Corrected stock in Live Stock (${res.rows} adjustment ${res.rows === 1 ? "row" : "rows"}): ${String(input.reason).trim().slice(0, 100)}`, null);
  revalidatePath("/dashboard/inventory", "layout");
  revalidatePath("/dashboard/sales", "layout");
  return { ok: true, message: `Corrected. It is recorded in the movements history.` };
}
