"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { isMonth, localDayOfUtc, monthHeading, monthOfDay, shiftMonth, sumAmounts, dayHeading, type ReportOrder } from "@/lib/accounts-rules";
import { MONEY } from "@/lib/receiving-ui";

const subscribe = () => () => {};
const control = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";

const localMonthNow = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const shortDay = (day: string) => dayHeading(day).replace(/^[A-Za-z]+, /, "");

const csvCell = (v: string) => {
  let s = v;
  // A cell that starts like a formula would run in a spreadsheet; keep it plain text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * One month of payments: date paid, customer, the complete items quoted, and the final payout, with the month's total.
 * The month is the viewer's own calendar month (a payment at 9 PM on the 31st belongs to that month), so the list is
 * drawn in the browser. It prints cleanly (Print / Save as PDF) and downloads as a spreadsheet.
 */
export function MonthlyReport({ month, explicit, rows, companyName }: { month: string; explicit: boolean; rows: ReportOrder[]; companyName: string }) {
  const router = useRouter();
  const ready = useSyncExternalStore(subscribe, () => true, () => false);

  // No month in the address: open on the viewer's own current month, if that is not the one the server picked.
  useEffect(() => {
    if (!explicit) {
      const now = localMonthNow();
      if (now !== month) router.replace(`/dashboard/accounts/report?month=${now}`);
    }
  }, [explicit, month, router]);

  // Newest payment first, like the Airtable view this replaces.
  const inMonth = ready ? rows.filter((r) => monthOfDay(localDayOfUtc(r.paidAt)) === month).reverse() : [];
  const total = sumAmounts(inMonth.map((r) => ({ amount: r.payout })));

  function download() {
    const lines = [
      ["Customer", "Date paid", "Final payout", "Items"].map(csvCell).join(","),
      ...inMonth.map((r) => [r.customerName, localDayOfUtc(r.paidAt), r.payout.toFixed(2), r.items.join(", ")].map(csvCell).join(",")),
      ["Total", "", total.toFixed(2), ""].map(csvCell).join(","),
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `paid-report-${month}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Monthly Report</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
            Everybody Accounts paid in a month: the customer, the date paid, the final payout and the complete items quoted for the order. Each row links to its quotation. Pull it at the end of the day or the end of the month.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={download} disabled={!ready || inMonth.length === 0} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
            Download as CSV
          </button>
          <button type="button" onClick={() => window.print()} disabled={!ready} className="rounded-lg bg-[var(--dept-accent,#60a5fa)] px-3 py-2 text-sm font-semibold text-emerald-950 hover:brightness-95 disabled:opacity-50">
            Print / Save as PDF
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3 print:hidden">
        <Link href={`/dashboard/accounts/report?month=${shiftMonth(month, -1)}`} className={`${control} font-medium hover:bg-slate-50`} aria-label="Previous month">‹ Previous</Link>
        <div>
          <label htmlFor="rep-month" className="text-xs font-medium text-slate-600 dark:text-slate-400">Month</label>
          <input
            id="rep-month"
            type="month"
            value={month}
            onChange={(e) => {
              if (isMonth(e.target.value)) router.push(`/dashboard/accounts/report?month=${e.target.value}`);
            }}
            className={`${control} block`}
          />
        </div>
        <Link href={`/dashboard/accounts/report?month=${shiftMonth(month, 1)}`} className={`${control} font-medium hover:bg-slate-50`} aria-label="Next month">Next ›</Link>
        <Link href={`/dashboard/accounts/report?month=${localMonthNow()}`} className="pb-2 text-sm text-emerald-800 underline dark:text-emerald-300">This month</Link>
      </div>

      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-slate-300 pb-2 dark:border-slate-700">
        <div>
          <p className="hidden text-sm font-semibold text-slate-600 print:block">{companyName}</p>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50" data-testid="report-title">Paid orders: {monthHeading(month)}</h2>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300" data-testid="report-totals">
          {!ready ? "Loading…" : (
            <>
              <strong className="tabular-nums">{inMonth.length}</strong> {inMonth.length === 1 ? "customer" : "customers"} paid · <strong className="tabular-nums">{MONEY.format(total)}</strong> total
            </>
          )}
        </p>
      </div>

      {ready && inMonth.length === 0 && (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          Nothing was paid in {monthHeading(month)}.
        </p>
      )}

      {inMonth.length > 0 && (
        <div className="mt-2 overflow-x-auto print:overflow-visible">
          <table className="w-full min-w-[44rem] text-sm" data-testid="report-table">
            <thead>
              <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wider text-slate-500 dark:border-slate-700">
                <th className="py-2 pr-4 font-medium">Customer</th>
                <th className="whitespace-nowrap py-2 pr-4 font-medium">Date paid</th>
                <th className="whitespace-nowrap py-2 pr-4 text-right font-medium">Final payout</th>
                <th className="py-2 pr-4 font-medium">Items quoted for this order</th>
                <th className="whitespace-nowrap py-2 font-medium print:hidden">Quotation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {inMonth.map((r) => (
                <tr key={r.id} data-testid="report-row" className="align-top print:break-inside-avoid">
                  <td className="py-2.5 pr-4 font-medium text-slate-900 dark:text-slate-50">{r.customerName}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4 tabular-nums">{shortDay(localDayOfUtc(r.paidAt))}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right font-semibold tabular-nums">{MONEY.format(r.payout)}</td>
                  <td className="py-2.5 pr-4">{r.items.length === 0 ? <span className="text-slate-400">—</span> : r.items.join(", ")}</td>
                  <td className="whitespace-nowrap py-2.5 print:hidden">
                    {r.items.length === 0 ? <span className="text-slate-400">—</span> : (
                      <a href={`/api/receiving/packages/${r.id}/quotation-receipt`} target="_blank" rel="noreferrer" className="text-emerald-800 underline dark:text-emerald-300">View quotation</a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-400 dark:border-slate-600">
                <td colSpan={2} className="py-2.5 pr-4 text-right text-sm font-semibold">Total paid in {monthHeading(month)}</td>
                <td className="whitespace-nowrap py-2.5 pr-4 text-right text-base font-bold tabular-nums" data-testid="report-total">{MONEY.format(total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
