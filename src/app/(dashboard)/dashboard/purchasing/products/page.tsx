import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getPurchasingProducts, getPurchasingCategories } from "@/lib/queries";
import { AddProductForm } from "./add-product-form";
import { LoadCatalogButton } from "./load-catalog-button";

export default async function PurchasingProductsPage() {
  const org = await requireOrg();
  const canEdit = org.role !== "staff";
  const [products, categories] = await Promise.all([
    getPurchasingProducts(org.organizationId, { includeInactive: canEdit }),
    getPurchasingCategories(org.organizationId),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Products</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        One unified catalog, priced from a standard price × an expiration-range multiplier you set per product.
      </p>

      {canEdit && <LoadCatalogButton />}
      {canEdit && <AddProductForm categories={categories} />}

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 text-right font-medium">Standard price</th>
              {canEdit && <th className="px-4 py-3 font-medium">Active</th>}
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No products yet -- add one above.
                </td>
              </tr>
            )}
            {products.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-4 py-3">
                  {canEdit ? (
                    <Link
                      href={`/dashboard/purchasing/products/${p.id}`}
                      className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      {p.name}
                    </Link>
                  ) : (
                    <span className="text-slate-900 dark:text-slate-50">{p.name}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{p.categoryName ?? "—"}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{p.productCode ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-900 dark:text-slate-50">
                  ${p.standardPrice.toFixed(2)}
                </td>
                {canEdit && (
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    {p.archivedAt ? "Archived" : p.active ? "Yes" : "No"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
