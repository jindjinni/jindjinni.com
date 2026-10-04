import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getAllProductMultipliersForOrg, getPurchasingProducts, getPurchasingExpirationRanges } from "@/lib/queries";
import { AddMultiplierForm } from "./add-multiplier-form";
import { ProductMultipliersTable } from "./product-multipliers-table";

export default async function ProductMultipliersPage() {
  const org = await requireOrg();
  if (org.role === "staff") {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Only a Purchasing Manager or Master Admin can edit product multipliers.
      </p>
    );
  }

  const [rows, products, ranges] = await Promise.all([
    getAllProductMultipliersForOrg(org.organizationId),
    getPurchasingProducts(org.organizationId),
    getPurchasingExpirationRanges(org.organizationId),
  ]);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Product Multipliers</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Every product&rsquo;s own override on top of its month range&rsquo;s default -- this is what wins when both exist. Final unit price = standard price × this multiplier.
          </p>
        </div>
        <Link
          href="/dashboard/purchasing/products"
          className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          ← Back
        </Link>
      </div>

      <AddMultiplierForm products={products.map((p) => ({ id: p.id, name: p.name }))} ranges={ranges.map((r) => ({ id: r.id, label: r.label }))} />

      <div className="mt-6">
        <ProductMultipliersTable rows={rows} />
      </div>
    </div>
  );
}
