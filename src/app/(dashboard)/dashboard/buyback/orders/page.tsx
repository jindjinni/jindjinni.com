import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getBuybackOrders, getSellers } from "@/lib/queries";
import { NewOrderForm } from "./new-order-form";

export default async function BuybackOrdersPage() {
  const org = await requireOrg();
  const [orders, sellers] = await Promise.all([
    getBuybackOrders(org.organizationId),
    getSellers(org.organizationId),
  ]);

  return (
    <div>
      <p className="text-sm">
        <Link href="/dashboard/buyback" className="text-emerald-700 hover:underline dark:text-emerald-400">
          ← Operations Center
        </Link>
      </p>
      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
            Quotes
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Quotes given to sellers before their package ships in. Ported from
            the USA Test Strips Center receiving workflow.
          </p>
        </div>
        <Link
          href="/dashboard/buyback/shipments"
          className="shrink-0 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          All shipments
        </Link>
      </div>

      <NewOrderForm sellers={sellers} />

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Seller</th>
              <th className="px-4 py-3 font-medium">Reference</th>
              <th className="px-4 py-3 font-medium">Package status</th>
              <th className="px-4 py-3 text-right font-medium">Quoted total</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  No buyback orders yet. Add one above.
                </td>
              </tr>
            )}
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-4 py-3">
                  <Link
                    href={`/dashboard/buyback/${o.id}`}
                    className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    {o.sellerName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  {o.orderReference ?? "—"}
                </td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{o.packageStatus}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-900 dark:text-slate-50">
                  ${o.quotedTotal.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
