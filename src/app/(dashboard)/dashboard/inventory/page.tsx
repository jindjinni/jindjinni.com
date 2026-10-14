import { requireOrg } from "@/lib/tenant";
import { canWriteInventory } from "@/lib/permissions";
import { getInventory } from "@/lib/inventory-service";
import { featureOn } from "@/lib/features";
import { reservedByDrafts, sellableProducts } from "@/lib/sales-service";
import { groupStock, totalsOf } from "@/lib/inventory-rules";
import { MANUAL_CONDITIONS } from "@/lib/inventory-conditions";
import { normKey } from "@/lib/inventory-rules";
import { StockList, type BrandView } from "./stock-list";

export const dynamic = "force-dynamic";

// Live Stock: everything in stock right now, by brand, then product, then lines of the same condition and expiration
// group. Receiving's accepted units are read live; manual adds and sales are applied on top.
export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ by?: string }> }) {
  const org = await requireOrg();
  const sp = await searchParams;
  // ?by=range groups by the exact month or month range written on the product, instead of the company's price buckets
  const by = sp.by === "range" ? "range" : "months";
  const snap = await getInventory(org.organizationId, { groupBy: by });
  // With the invoice stock picker on, units that draft invoices and open sales orders are holding show right here, so nobody sells them twice.
  const showHolds = await featureOn("invoice-stock-picker", org.organizationId);
  const heldByProduct: Record<string, number> = {};
  if (showHolds) {
    for (const [k, n] of Object.entries(await reservedByDrafts(org.organizationId))) {
      const pk = k.split("|")[0];
      heldByProduct[pk] = (heldByProduct[pk] ?? 0) + n;
    }
  }
  // "Fix name" (flag `inventory-fix-name`): only for people who may change Inventory, with the company's product list to choose from.
  const mayChange = canWriteInventory(org.role, org.access);
  const [canFix, canEdit] = mayChange ? await Promise.all([featureOn("inventory-fix-name", org.organizationId), featureOn("inventory-edit-stock", org.organizationId)]) : [false, false];
  const catalog = canFix || canEdit ? (await sellableProducts(org.organizationId)).map((p) => ({ id: p.id, key: p.key, name: p.name, brand: p.brand })) : undefined;
  const totals = totalsOf(snap.lines);
  const brands: BrandView[] = groupStock(snap.lines).map((b) => ({
    key: b.key,
    brand: b.brand,
    quantity: b.quantity,
    held: showHolds ? b.products.reduce((n, p) => n + Math.min(heldByProduct[p.key] ?? 0, Math.max(0, p.quantity)), 0) : null,
    costValue: b.costValue,
    estLow: b.estLow,
    estHigh: b.estHigh,
    products: b.products.map((p) => ({
      key: p.key,
      productName: p.productName,
      quantity: p.quantity,
      held: showHolds ? Math.min(heldByProduct[p.key] ?? 0, Math.max(0, p.quantity)) : null,
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
        lots: l.lots.map((lot) => {
          const m = l.layers.filter((x) => normKey(x.lot) === normKey(lot.lot) && (x.expiry ?? "") === (lot.expiry ?? "") && (x.expiryEnd ?? "") === (lot.expiryEnd ?? "") && x.quantity > 0 && x.unitCost != null);
          const u = m.reduce((n, x) => n + x.quantity, 0);
          return { lot: lot.lot, expiry: lot.expiry, expiryEnd: lot.expiryEnd, quantity: lot.quantity, cost: u > 0 ? Math.round((m.reduce((n, x) => n + (x.unitCost as number) * x.quantity, 0) / u) * 100) / 100 : null };
        }),
        received: l.layers.filter((x) => x.source === "RECEIVED").reduce((n, x) => n + x.quantity, 0),
        manual: l.layers.filter((x) => x.source === "MANUAL").reduce((n, x) => n + x.quantity, 0),
      })),
    })),
  }));
  return <StockList key={by} brands={brands} totals={totals} today={snap.today} heldTotal={showHolds ? Object.entries(heldByProduct).reduce((n, [pk, v]) => n + Math.min(v, Math.max(0, snap.lines.filter((l) => l.productKey === pk).reduce((m, l) => m + l.quantity, 0))), 0) : null} by={by} canWrite={mayChange} catalog={canFix ? catalog : undefined} edit={canEdit && catalog ? { catalog, conditions: [...MANUAL_CONDITIONS] } : undefined} />;
}
