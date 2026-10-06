"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { groupByDay, dayHeading, localDayOfUtc, orderMatches, sumAmounts, type AccountsOrder } from "@/lib/accounts-rules";
import { chipClass, formatUtcStamp, MONEY } from "@/lib/receiving-ui";

const control = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const subscribe = () => () => {};

/** The viewer's own "today" as YYYY-MM-DD. */
function localToday() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Days are the viewer's own calendar days (a payment at 9 PM is that evening's, not tomorrow's in UTC), so the
// grouping happens here in the browser; the list is drawn once the page has loaded.
export function PaidOrders({ orders, truncated }: { orders: AccountsOrder[]; truncated: boolean }) {
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  if (!ready) return <p className="mt-6 text-sm text-slate-500">Loading paid orders…</p>;

  const today = localToday();
  const filtered = orders.filter((o) => {
    const d = localDayOfUtc(o.paidAt);
    return orderMatches(o, q) && (!from || d >= from) && (!to || d <= to);
  });
  const days = groupByDay(filtered, (o) => localDayOfUtc(o.paidAt), true);
  const filtering = !!(q.trim() || from || to);
  const todays = filtered.filter((o) => localDayOfUtc(o.paidAt) === today);

  return (
    <div>
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="po-from" className="text-xs font-medium text-slate-600 dark:text-slate-400">Paid from</label>
          <input id="po-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${control} block`} />
        </div>
        <div>
          <label htmlFor="po-to" className="text-xs font-medium text-slate-600 dark:text-slate-400">Paid to</label>
          <input id="po-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${control} block`} />
        </div>
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="po-q" className="text-xs font-medium text-slate-600 dark:text-slate-400">Search a customer, quotation number or tracking number</label>
          <input id="po-q" value={q} onChange={(e) => setQ(e.target.value)} className={`${control} w-full`} placeholder="e.g. a customer name" />
        </div>
        {filtering && (
          <button type="button" onClick={() => { setQ(""); setFrom(""); setTo(""); }} className="pb-2 text-sm text-emerald-800 underline dark:text-emerald-300">Show everything</button>
        )}
      </div>

      <p className="mt-4 text-sm text-slate-600 dark:text-slate-300" data-testid="paid-totals">
        <strong className="tabular-nums">{filtered.length}</strong> {filtered.length === 1 ? "order" : "orders"} paid · <strong className="tabular-nums">{MONEY.format(sumAmounts(filtered))}</strong>
        {" · "}Today: <strong className="tabular-nums">{todays.length}</strong> {todays.length === 1 ? "order" : "orders"}, <strong className="tabular-nums">{MONEY.format(sumAmounts(todays))}</strong>
      </p>
      {truncated && <p className="mt-1 text-xs text-slate-500">Showing the most recent payments. Download the CSV for everything.</p>}

      {filtered.length === 0 && (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          {filtering ? "No paid order matches that." : "Nothing has been paid yet. Orders you mark Paid appear here with the date and time."}
        </p>
      )}

      <div className="mt-3 space-y-3">
        {days.map((d) => (
          <details key={d.day || "none"} open={filtering} data-testid="paid-day" className="group rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3">
              <span aria-hidden className="text-xs text-slate-400 transition group-open:rotate-90">▶</span>
              <span className="font-semibold text-slate-900 dark:text-slate-50">{d.day ? dayHeading(d.day) : "No date"}</span>
              {d.day === today && <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-900 dark:bg-green-900/40 dark:text-green-100">Today</span>}
              <span className="text-sm text-slate-600 dark:text-slate-300"><strong className="tabular-nums">{d.orders.length}</strong> {d.orders.length === 1 ? "order" : "orders"}</span>
              <span className="text-sm text-slate-600 dark:text-slate-300"><strong className="tabular-nums">{MONEY.format(d.total)}</strong></span>
            </summary>
            <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-2 font-medium">Paid at</th>
                    <th className="px-3 py-2 font-medium">Customer</th>
                    <th className="px-3 py-2 font-medium">Quotation</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {d.orders.map((o) => (
                    <tr key={o.id} data-testid="paid-order">
                      <td className="whitespace-nowrap px-4 py-2 tabular-nums">{formatUtcStamp(o.paidAt)}</td>
                      <td className="px-3 py-2"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${chipClass(o.customerName)}`}>{o.customerName}</span></td>
                      <td className="px-3 py-2"><Link href={`/dashboard/accounts/${o.id}`} className="font-medium text-emerald-800 underline dark:text-emerald-300">{o.quotationNumber}</Link></td>
                      <td className="px-3 py-2 text-right tabular-nums">{MONEY.format(o.amount)}</td>
                      <td className="px-3 py-2">
                        {o.receiptId ? <a href={`/api/receiving/photos/${o.receiptId}`} target="_blank" rel="noreferrer" className="text-emerald-800 underline dark:text-emerald-300">View{o.receipts > 1 ? ` (${o.receipts})` : ""}</a> : <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
