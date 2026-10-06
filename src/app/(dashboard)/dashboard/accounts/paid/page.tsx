import { PAID_LIMIT } from "@/lib/accounts-queries";

// Paid Orders, the right-hand side: how to find a payment. The orders themselves are the small cards on the left.
export default function PaidOrdersPage() {
  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Paid Orders</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Every order Accounts has paid, with the date and time it was paid.</p>
        </div>
        <a href="/api/accounts/paid-csv" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
          Download as CSV
        </a>
      </div>
      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
        <p className="font-semibold text-slate-900 dark:text-slate-50">A customer asks &ldquo;did you pay me?&rdquo;</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Open the day on the left (newest first, today is marked), or type the customer&apos;s name, order number or tracking number in the search box.</li>
          <li>Open the order. You see the complete receiving form, with a PAID stamp, the date and time it was paid, the amount and the payment receipt in Step 10.</li>
        </ul>
      </div>
      <p className="mt-3 text-xs text-slate-500">The list shows the most recent {PAID_LIMIT.toLocaleString("en-US")} payments; the CSV has them in a spreadsheet.</p>
    </div>
  );
}
