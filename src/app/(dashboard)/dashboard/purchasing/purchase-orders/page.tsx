import Link from "next/link";
import { lineCounts, listPurchaseOrders } from "@/lib/purchase-order-service";
import { isPoStatus } from "@/lib/purchase-order-rules";
import { PoList, type PoRow } from "./po-list";
import { requirePoPage } from "./gate";

export const dynamic = "force-dynamic";

// Purchase orders a distributor sends to the wholesalers it buys from.
export default async function PurchaseOrdersPage() {
  const { org, canWrite } = await requirePoPage();
  const [orders, counts] = await Promise.all([listPurchaseOrders(org.organizationId), lineCounts(org.organizationId)]);
  const rows: PoRow[] = orders.map((o) => ({ id: o.id, number: o.poNumber, supplier: o.supplierName, date: o.issueDate, total: o.total, status: isPoStatus(o.status) ? o.status : "DRAFT", lines: counts[o.id] ?? 0 }));
  return (
    <div className="max-w-5xl" data-testid="po-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Purchase Orders</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Orders you send to the wholesalers you buy from, with the part numbers and NDCs. Each one goes out as a PDF and as an email with the order written out. Quotations stay under their own tab.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/purchasing/suppliers" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-white dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-900">Suppliers</Link>
          {canWrite && (
            <Link href="/dashboard/purchasing/purchase-orders/new" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800" data-testid="po-new">
              + New purchase order
            </Link>
          )}
        </div>
      </div>
      <PoList rows={rows} />
    </div>
  );
}
