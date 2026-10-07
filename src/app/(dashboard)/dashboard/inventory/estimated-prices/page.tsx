import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canWriteInventory } from "@/lib/permissions";
import { getInventory } from "@/lib/inventory-service";
import { normKey } from "@/lib/inventory-rules";
import { PricesForm, type PriceRow } from "./prices-form";

export const dynamic = "force-dynamic";

// Estimated Prices (Settings): the lowest and highest price you expect to sell one unit of each product for, per
// condition. Live Stock multiplies them by what is in stock to show an estimated value range.
export default async function EstimatedPricesPage() {
  const org = await requireOrg();
  if (!canWriteInventory(org.role)) notFound();
  const snap = await getInventory(org.organizationId);
  const seen = new Map<string, PriceRow>();
  for (const l of snap.lines) {
    const k = `${l.productKey}|${normKey(l.condition)}`;
    if (seen.has(k)) continue;
    const e = snap.estimates.get(k);
    seen.set(k, { productKey: l.productKey, productName: l.productName, brand: l.brand, condition: l.condition, low: e?.low == null ? "" : String(e.low), high: e?.high == null ? "" : String(e.high) });
  }
  const rows = [...seen.values()].sort((a, b) => a.brand.localeCompare(b.brand) || a.productName.localeCompare(b.productName) || a.condition.localeCompare(b.condition));
  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Estimated Prices</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
        The lowest and highest price you expect to sell <strong>one unit</strong> for, by product and condition. Live Stock multiplies these by what is in stock to show an estimated value. You can also set them while adding stock with Manual Add.
      </p>
      <PricesForm rows={rows} />
    </div>
  );
}
