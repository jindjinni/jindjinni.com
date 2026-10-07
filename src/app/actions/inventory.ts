"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/tenant";
import { canWriteInventory } from "@/lib/permissions";
import { MANUAL_CONDITIONS } from "@/lib/inventory-conditions";
import { addManualStock, saveEstimate, type ManualLineInput } from "@/lib/inventory-service";
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
