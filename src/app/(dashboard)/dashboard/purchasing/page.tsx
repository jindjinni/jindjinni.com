import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getPurchasingDashboardCounts, getPurchasingQuotations } from "@/lib/queries";

export default async function PurchasingDashboardPage() {
  const org = await requireOrg();
  const [counts, recentQuotations] = await Promise.all([
    getPurchasingDashboardCounts(org.organizationId),
    getPurchasingQuotations(org.organizationId),
  ]);

  const tiles = [
    { label: "Open quotations", value: counts.openQuotations, href: "/dashboard/purchasing/quotations" },
    {
      label: "Open quotations value",
      value: `$${counts.openQuotationsValue.toFixed(2)}`,
      href: "/dashboard/purchasing/quotations",
    },
    { label: "Customers on file", value: counts.customers, href: "/dashboard/purchasing/customers" },
    { label: "Active products", value: counts.products, href: "/dashboard/purchasing/products" },
  ];

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Purchasing</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Quote customers, manage the product catalog, and track quotations through to the shared Overall Orders record.
          </p>
        </div>
        <Link
          href="/dashboard/purchasing/quotations/new"
          className="shrink-0 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Generate quotation
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            className="rounded-xl border border-slate-200 bg-white p-5 hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="text-3xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">{tile.value}</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{tile.label}</p>
          </Link>
        ))}
      </div>

      <h2 className="mt-8 text-lg font-semibold text-slate-900 dark:text-slate-50">Recent quotations</h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Reference</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Grand total</th>
            </tr>
          </thead>
          <tbody>
            {recentQuotations.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No quotations yet.
                </td>
              </tr>
            )}
            {recentQuotations.slice(0, 8).map((q) => (
              <tr key={q.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-4 py-3">
                  <Link
                    href={`/dashboard/purchasing/quotations/${q.id}`}
                    className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    {q.quotationNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{q.customerNameSnapshot}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{q.quotationDate}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{q.status}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-900 dark:text-slate-50">
                  ${q.grandTotal.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
