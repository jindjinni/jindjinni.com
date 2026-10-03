import { requireOrg } from "@/lib/tenant";
import { getProducts, getConditions } from "@/lib/queries";
import { ReceiveStockForm } from "./receive-stock-form";

export default async function ReceivePage() {
  const org = await requireOrg();
  const [products, conditions] = await Promise.all([
    getProducts(org.organizationId),
    getConditions(org.organizationId),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
        Receive stock
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Posts straight to the ledger -- no approval step, same as the
        original receiving automation. On-hand updates immediately.
      </p>

      {products.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
          Add a product first from the{" "}
          <a href="/dashboard/products" className="font-medium text-emerald-700 dark:text-emerald-400">
            inventory page
          </a>{" "}
          before receiving stock for it.
        </p>
      ) : (
        <ReceiveStockForm products={products} conditions={conditions} />
      )}
    </div>
  );
}
