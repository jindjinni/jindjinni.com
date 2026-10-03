import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getInvoices } from "@/lib/queries";

const statusStyles: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  FINALIZED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  VOID: "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400",
};

export default async function InvoicesPage() {
  const org = await requireOrg();
  const invoices = await getInvoices(org.organizationId);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
            Invoices
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Numbered automatically per organization. Finalizing one deducts
            stock; voiding one returns it.
          </p>
        </div>
        <Link
          href="/dashboard/invoices/new"
          className="shrink-0 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          New invoice
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Buyer</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No invoices yet.
                </td>
              </tr>
            )}
            {invoices.map((invoice) => (
              <tr
                key={invoice.id}
                className="border-b border-slate-100 last:border-0 dark:border-slate-800"
              >
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-50">
                  <Link
                    href={`/dashboard/invoices/${invoice.id}`}
                    className="hover:text-emerald-700 dark:hover:text-emerald-400"
                  >
                    {invoice.invoiceNumber ?? "—"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  {invoice.buyerCompanyName ?? "—"}
                </td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                  {invoice.invoiceDate ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[invoice.status]}`}
                  >
                    {invoice.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-900 dark:text-slate-50">
                  ${invoice.total.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
