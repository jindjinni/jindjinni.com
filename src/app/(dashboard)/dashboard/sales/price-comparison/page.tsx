import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getInventory } from "@/lib/inventory-service";
import { listBuyers, listPriceItems, sellableProducts } from "@/lib/sales-service";
import { normKey } from "@/lib/inventory-rules";
import { CompareTable, type CompareData } from "./compare-table";

export const dynamic = "force-dynamic";

// Price Comparison: for each product, what every buyer's price sheet pays, who pays the most, and what your stock on hand
// would bring in at the best price. Built from the buyers' price sheets and Inventory's live stock.
export default async function PriceComparisonPage() {
  const org = await requireOrg();
  const [buyers, items, products, inv] = await Promise.all([listBuyers(org.organizationId), listPriceItems(org.organizationId), sellableProducts(org.organizationId), getInventory(org.organizationId)]);
  const active = buyers.filter((b) => b.active);
  const withSheets = new Set(items.map((i) => i.buyerId));
  const shownBuyers = active.filter((b) => withSheets.has(b.id));
  const onHand: Record<string, number> = {};
  const stockProducts = new Map<string, { productKey: string; productName: string; brand: string }>();
  for (const l of inv.lines) {
    if (l.quantity <= 0) continue;
    const k = `${l.productKey}|${normKey(l.condition)}`;
    onHand[k] = (onHand[k] ?? 0) + l.quantity;
    stockProducts.set(l.productKey, { productKey: l.productKey, productName: l.productName, brand: l.brand });
  }
  const byKey = new Map(products.map((p) => [p.key, { productKey: p.key, productName: p.name, brand: p.brand }]));
  for (const [k, v] of stockProducts) if (!byKey.has(k)) byKey.set(k, v);
  const conditions = [...new Set([...items.map((i) => i.condition), ...inv.lines.filter((l) => l.quantity > 0).map((l) => l.condition)])];
  const data: CompareData = {
    buyers: shownBuyers.map((b) => ({ id: b.id, name: b.companyName })),
    products: [...byKey.values()],
    prices: items.filter((i) => i.productKey && withSheets.has(i.buyerId) && active.some((b) => b.id === i.buyerId)).map((i) => ({ buyerId: i.buyerId, productKey: i.productKey as string, condition: i.condition, price: i.price })),
    onHand,
    conditions: conditions.sort((a, b) => (normKey(a) === "mint" ? -1 : normKey(b) === "mint" ? 1 : a.localeCompare(b))),
  };
  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Price Comparison</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
        Who pays the most for each product, from your buyers&apos; price sheets, set beside what you have in stock. The highest price is marked, and the last column shows what your units on hand would bring in at that price.
      </p>
      {shownBuyers.length === 0 ? (
        <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300" data-testid="cmp-no-sheets">
          No buyer has a price sheet yet. Open a buyer in <Link href="/dashboard/sales/buyers" className="font-medium text-emerald-800 underline dark:text-emerald-300">Buyers</Link> and upload their Excel or CSV price sheet.
        </div>
      ) : (
        <CompareTable data={data} />
      )}
    </div>
  );
}
