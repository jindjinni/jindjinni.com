import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getPurchasingQuotations } from "@/lib/queries";

const statusStyles: Record<string, string> = {
  QUOTED: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  CONFIRMED: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  RECEIVED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  CANCELLED: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
};

export default async function PurchasingQuotationsPage() {
  const org = await requireOrg();
  const quotations = await getPurchasingQuotations(org.organizationId);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Quotations</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Every quotation given to a customer -- this is also the shared Overall Orders record Receiving will read from later.
          </p>
        </div>
        <Link
          href="/dashboard/purchasing/quotations/new"
          className="shrink-0 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Generate quotation
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Reference</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Tracking</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Grand total</th>
            </tr>
          </thead>
          <tbody>
            {quotations.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No quotations yet.
                </td>
              </tr>
            )}
            {quotations.map((q) => (
              <tr key={q.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-4 py-3">
                  <Link
                    href={`/dashboard/purchasing/quotations/${q.id}`}
                    className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    {q.quotationNumber}
                  </Link>
                  {q.archivedAt && (
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800">
                      Archived
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{q.customerNameSnapshot}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{q.quotationDate}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{q.trackingNumber ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[q.status] ?? ""}`}>
                    {q.status}
                  </span>
                </td>
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
