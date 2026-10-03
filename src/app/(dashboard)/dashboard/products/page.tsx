import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getProductsWithOnHand } from "@/lib/queries";
import { AddProductForm } from "./add-product-form";

export default async function ProductsPage() {
  const org = await requireOrg();
  const { conditions, products } = await getProductsWithOnHand(org.organizationId);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
            Live inventory
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            On-hand quantity is always summed from the transaction ledger, never
            typed in directly -- same rule as the original system.
          </p>
        </div>
        <Link
          href="/dashboard/receive"
          className="shrink-0 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Receive stock
        </Link>
      </div>

      <AddProductForm />

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Product</th>
              {conditions.map((c) => (
                <th key={c.id} className="px-4 py-3 text-right font-medium">
                  {c.name}
                </th>
              ))}
              <th className="px-4 py-3 text-right font-medium">Total on hand</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td
                  colSpan={conditions.length + 2}
                  className="px-4 py-8 text-center text-slate-400"
                >
                  No products yet. Add one above to get started.
                </td>
              </tr>
            )}
            {products.map((product) => (
              <tr
                key={product.id}
                className="border-b border-slate-100 last:border-0 dark:border-slate-800"
              >
                <td className="px-4 py-3 text-slate-900 dark:text-slate-50">
                  {product.name}
                  {product.sku && (
                    <span className="ml-2 text-xs text-slate-400">{product.sku}</span>
                  )}
                </td>
                {product.byCondition.map((c) => (
                  <td
                    key={c.conditionId}
                    className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300"
                  >
                    {c.onHand}
                  </td>
                ))}
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                  {product.totalOnHand}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
