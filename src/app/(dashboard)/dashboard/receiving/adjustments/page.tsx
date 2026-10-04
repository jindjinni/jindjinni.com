import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { canWriteAccounts } from "@/lib/permissions";
import { listAdjustments, listNeedingAdjustment } from "@/lib/receiving-adjustment-service";
import { chipClass, MONEY, formatUtcStamp } from "@/lib/receiving-ui";
import { adjustmentDifference } from "@/lib/receiving-adjustment";
import { StartAdjustmentButton } from "./start-button";

export const dynamic = "force-dynamic";

export default async function OrderAdjustmentsPage() {
  const org = await requireOrg();
  const [rows, waiting] = await Promise.all([listAdjustments(org.organizationId), listNeedingAdjustment(org.organizationId)]);
  const canWrite = canWriteAccounts(org.role);
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Order Adjustments</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        An adjustment quotation is a corrected version of the quotation the customer was given. Build it from a shipment, finalize it, and it is attached to that receiving order so it goes out with the customer email.
      </p>

      {waiting.length > 0 && (
        <section className="mt-6" aria-labelledby="waiting-h">
          <h2 id="waiting-h" className="text-sm font-semibold text-slate-900 dark:text-slate-50">Shipments marked &ldquo;Adjustment Needed&rdquo; ({waiting.length})</h2>
          <ul className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {waiting.map((w) => (
              <li key={w.packageId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${chipClass(w.customerName)}`}>{w.customerName}</span>
                  <span className="ml-2 text-sm font-medium">{w.quotationNumber}</span>
                  {w.details && <p className="mt-1 max-w-xl truncate text-xs text-slate-500">{w.details}</p>}
                </div>
                {canWrite ? <StartAdjustmentButton packageId={w.packageId} /> : <Link href={`/dashboard/receiving/intake/${w.packageId}`} className="text-sm text-amber-800 underline dark:text-amber-300">Open shipment</Link>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6" aria-labelledby="all-h">
        <h2 id="all-h" className="text-sm font-semibold text-slate-900 dark:text-slate-50">Adjustment quotations ({rows.length})</h2>
        {rows.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
            None yet. Open a shipment in the Receiving Intake Form and use &ldquo;Create adjustment quotation&rdquo; in Step 7.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Adjustment</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2 text-right">Original</th>
                  <th className="px-3 py-2 text-right">Adjusted</th>
                  <th className="px-3 py-2 text-right">Change</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {rows.map((r) => {
                  const diff = adjustmentDifference(r.originalTotal, r.adjustedTotal);
                  return (
                    <tr key={r.id}>
                      <td className="px-3 py-2"><Link href={`/dashboard/receiving/adjustments/${r.id}`} className="font-medium text-amber-800 underline dark:text-amber-300">{r.number}</Link></td>
                      <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${chipClass(r.customerName)}`}>{r.customerName}</span></td>
                      <td className="px-3 py-2">{r.reason || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{MONEY.format(r.originalTotal)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{MONEY.format(r.adjustedTotal)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${diff < 0 ? "text-red-700 dark:text-red-300" : ""}`}>{diff > 0 ? "+" : ""}{MONEY.format(diff)}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === "FINAL" ? "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100" : "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-100"}`}>{r.status === "FINAL" ? "Final" : "Draft"}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500" suppressHydrationWarning>{formatUtcStamp(r.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
