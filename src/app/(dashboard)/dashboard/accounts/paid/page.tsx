import { requireOrg } from "@/lib/tenant";
import { getPaidOrders, PAID_LIMIT } from "@/lib/accounts-queries";
import { PaidOrders } from "./paid-orders";

export const dynamic = "force-dynamic";

// Paid Orders: the database of everything Accounts has paid, with the date and time of each payment.
export default async function PaidOrdersPage() {
  const org = await requireOrg();
  const orders = await getPaidOrders(org.organizationId);
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Paid Orders</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
            Every order Accounts has paid, grouped by the day it was paid, newest first. Open a day to see its orders, the time each was paid and its receipt.
          </p>
        </div>
        <a href="/api/accounts/paid-csv" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
          Download as CSV
        </a>
      </div>
      <PaidOrders orders={orders} truncated={orders.length >= PAID_LIMIT} />
    </div>
  );
}
