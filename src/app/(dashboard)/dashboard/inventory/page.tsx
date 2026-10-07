import { requireOrg } from "@/lib/tenant";
import { canWriteInventory } from "@/lib/permissions";
import { getInventory } from "@/lib/inventory-service";
import { groupStock, totalsOf } from "@/lib/inventory-rules";
import { StockList, type BrandView } from "./stock-list";

export const dynamic = "force-dynamic";

// Live Stock: everything in stock right now, by brand, then product, then lines of the same condition and expiration
// group. Receiving's accepted units are read live; manual adds and sales are applied on top.
export default async function InventoryPage() {
  const org = await requireOrg();
  const snap = await getInventory(org.organizationId);
  const totals = totalsOf(snap.lines);
  const brands: BrandView[] = groupStock(snap.lines).map((b) => ({
    key: b.key,
    brand: b.brand,
    quantity: b.quantity,
    costValue: b.costValue,
    estLow: b.estLow,
    estHigh: b.estHigh,
    products: b.products.map((p) => ({
      key: p.key,
      productName: p.productName,
      quantity: p.quantity,
      costValue: p.costValue,
      estLow: p.estLow,
      estHigh: p.estHigh,
      lines: p.lines.map((l) => ({
        key: l.key,
        condition: l.condition,
        groupKey: l.group.key,
        groupLabel: l.group.label,
        quantity: l.quantity,
        costValue: l.costValue,
        costKnownUnits: l.costKnownUnits,
        expiryFrom: l.expiryFrom,
        expiryTo: l.expiryTo,
        lotCount: l.lots.length,
        estLow: l.estLow,
        estHigh: l.estHigh,
        hasEstimate: !!l.estimate,
        received: l.layers.filter((x) => x.source === "RECEIVED").reduce((n, x) => n + x.quantity, 0),
        manual: l.layers.filter((x) => x.source === "MANUAL").reduce((n, x) => n + x.quantity, 0),
      })),
    })),
  }));
  return <StockList brands={brands} totals={totals} today={snap.today} canWrite={canWriteInventory(org.role)} />;
}
