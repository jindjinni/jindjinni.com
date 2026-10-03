import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import {
  getPurchasingProduct,
  getPurchasingCategories,
  getPurchasingExpirationRanges,
  getProductMultipliers,
} from "@/lib/queries";
import { archivePurchasingProduct, restorePurchasingProduct } from "@/app/actions/purchasing";
import { EditProductForm } from "./edit-product-form";
import { MultipliersSection } from "./multipliers-section";
import { ActionButton } from "@/components/action-button";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = await requireOrg();
  if (org.role === "staff") {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Only a Purchasing Manager or Master Admin can edit the product catalog.
      </p>
    );
  }

  const [product, categories, ranges] = await Promise.all([
    getPurchasingProduct(org.organizationId, id),
    getPurchasingCategories(org.organizationId),
    getPurchasingExpirationRanges(org.organizationId),
  ]);
  if (!product) notFound();
  const multiplierRows = await getProductMultipliers(org.organizationId, id);

  return (
    <div>
      <p className="text-sm">
        <Link href="/dashboard/purchasing/products" className="text-emerald-700 hover:underline dark:text-emerald-400">
          ← Products
        </Link>
      </p>
      <div className="mt-2 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
          {product.name}
          {product.archivedAt && (
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800">
              Archived
            </span>
          )}
        </h1>
        {!product.archivedAt ? (
          <ActionButton
            action={archivePurchasingProduct.bind(null, product.id)}
            label="Archive"
            pendingLabel="Archiving..."
            className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-red-300 hover:text-red-600 dark:border-slate-700 dark:text-slate-300"
          />
        ) : (
          <ActionButton
            action={restorePurchasingProduct.bind(null, product.id)}
            label="Restore"
            pendingLabel="Restoring..."
            className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-300"
          />
        )}
      </div>

      <EditProductForm productId={product.id} product={product} categories={categories} />
      <MultipliersSection productId={product.id} standardPrice={product.standardPrice} ranges={ranges} rows={multiplierRows} />
    </div>
  );
}
