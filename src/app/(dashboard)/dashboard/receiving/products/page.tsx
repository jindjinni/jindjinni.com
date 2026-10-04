import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { isPurchasingManager } from "@/lib/permissions";
import { getReceivingCatalog } from "@/lib/receiving-queries";
import { backfillProductNdcs } from "@/lib/purchasing-ndc";
import { ProductsTable } from "./products-table";

export const dynamic = "force-dynamic";

export default async function ReceivingProductsPage() {
  const org = await requireOrg();
  // Fills any blank NDC from the product's notes / the built-in catalog (never overwrites one). Cheap and safe to repeat.
  await backfillProductNdcs(org.organizationId);
  const products = await getReceivingCatalog(org.organizationId);
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Products</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
        The product list receiving agents choose from. It is the same catalog Purchasing quotes from, so a product added there shows up here. When a product has an NDC, it is filled in on the receiving line as soon as the product is picked.
        {isPurchasingManager(org.role) && (
          <>
            {" "}To add products or change an NDC, use <Link href="/dashboard/purchasing/products" className="font-medium text-amber-800 underline dark:text-amber-300">Purchasing &rarr; Products</Link>.
          </>
        )}
      </p>
      <ProductsTable products={products} />
    </div>
  );
}
