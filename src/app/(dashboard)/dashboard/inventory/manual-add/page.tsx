import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingCategories, purchasingProducts } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { canWriteInventory } from "@/lib/permissions";
import { brandFor } from "@/lib/receiving-serial-rules";
import { MANUAL_CONDITIONS } from "@/lib/inventory-conditions";
import { ManualAddForm } from "./manual-add-form";

export const dynamic = "force-dynamic";

// Manual Add: put stock into Inventory by hand, e.g. when a company moves its records over, or to correct a count.
// Pick the brand and product, say how many, the condition and expiration, what it cost and what you expect to sell it for.
export default async function ManualAddPage() {
  const org = await requireOrg();
  if (!canWriteInventory(org.role)) notFound();
  const rows = await db
    .select({ id: purchasingProducts.id, name: purchasingProducts.name, category: purchasingCategories.name, noExpiration: purchasingProducts.noExpiration })
    .from(purchasingProducts)
    .leftJoin(purchasingCategories, eq(purchasingCategories.id, purchasingProducts.categoryId))
    .where(and(eq(purchasingProducts.organizationId, org.organizationId), eq(purchasingProducts.active, true), isNull(purchasingProducts.archivedAt)))
    .orderBy(asc(purchasingProducts.name));
  const products = rows.map((r) => ({ id: r.id, name: r.name, brand: (r.category ?? brandFor(r.name) ?? "Other").trim() || "Other", noExpiration: r.noExpiration }));
  const brands = [...new Set(products.map((p) => p.brand))].sort((a, b) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));
  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Manual Add</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
        Add stock by hand: your starting stock when you move over, or a correction later. After this, stock arrives by itself from Receiving. Every add is saved in the Stock History with who added it.
      </p>
      <ManualAddForm brands={brands} products={products} conditions={[...MANUAL_CONDITIONS]} />
    </div>
  );
}
