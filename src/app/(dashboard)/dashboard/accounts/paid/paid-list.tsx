"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { dayHeading, groupByDay, localDayOfUtc, localTimeOfUtc, orderMatches, sumAmounts, type AccountsOrder } from "@/lib/accounts-rules";
import { chipClass, MONEY } from "@/lib/receiving-ui";

const control = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const subscribe = () => () => {};

/** The viewer's own "today" as YYYY-MM-DD. */
function localToday() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Paid orders as small cards, under closed headings for the day each was paid (newest day first, today marked).
 * Days are the viewer's own calendar days (a payment at 9 PM is that evening's, not tomorrow's in UTC), so the
 * grouping happens here in the browser; the list is drawn once the page has loaded.
 */
export function PaidList({ orders }: { orders: AccountsOrder[] }) {
  const path = usePathname();
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  if (!ready) return <p className="p-4 text-sm text-slate-500">Loading paid orders…</p>;

  const today = localToday();
  const filtered = orders.filter((o) => {
    const d = localDayOfUtc(o.paidAt);
    return orderMatches(o, q) && (!from || d >= from) && (!to || d <= to);
  });
  const days = groupByDay(filtered, (o) => localDayOfUtc(o.paidAt), true);
  const filtering = !!(q.trim() || from || to);
  const todays = orders.filter((o) => localDayOfUtc(o.paidAt) === today);

  return (
    <div className="flex flex-col">
      <div className="border-b border-slate-200 bg-emerald-50 p-3 dark:border-slate-800 dark:bg-emerald-950/30">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-200">Paid orders</p>
        <p className="mt-1 text-sm text-slate-700 dark:text-slate-200" data-testid="paid-totals">
          <strong className="tabular-nums">{filtered.length}</strong> {filtered.length === 1 ? "order" : "orders"} paid · <strong className="tabular-nums">{MONEY.format(sumAmounts(filtered))}</strong>
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-300" data-testid="paid-today">
          Today: <strong className="tabular-nums">{todays.length}</strong> {todays.length === 1 ? "order" : "orders"}, <strong className="tabular-nums">{MONEY.format(sumAmounts(todays))}</strong>
        </p>
      </div>
      <div className="space-y-2 border-b border-slate-200 p-3 dark:border-slate-800">
        <label htmlFor="po-q" className="sr-only">Search paid orders</label>
        <input id="po-q" value={q} onChange={(e) => setQ(e.target.value)} className={`${control} w-full`} placeholder="Search a customer, order # or tracking #" />
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor="po-from" className="text-[11px] font-medium text-slate-600 dark:text-slate-400">Paid from</label>
            <input id="po-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${control} block w-full`} />
          </div>
          <div className="min-w-0 flex-1">
            <label htmlFor="po-to" className="text-[11px] font-medium text-slate-600 dark:text-slate-400">Paid to</label>
            <input id="po-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${control} block w-full`} />
          </div>
        </div>
        {filtering && (
          <button type="button" onClick={() => { setQ(""); setFrom(""); setTo(""); }} className="text-sm text-emerald-800 underline dark:text-emerald-300">Show everything</button>
        )}
      </div>

      {filtered.length === 0 && (
        <p className="p-4 text-sm text-slate-500">{filtering ? "No paid order matches that." : "Nothing has been paid yet. Orders you mark Paid appear here with the date and time."}</p>
      )}

      <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
        {days.map((d) => {
          const hasActive = d.orders.some((o) => path === `/dashboard/accounts/paid/${o.id}`);
          return (
            <details key={d.day || "none"} open={filtering || hasActive} data-testid="paid-day" className="group">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                <span aria-hidden className="text-[10px] text-slate-400 transition group-open:rotate-90">▶</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">{d.day ? dayHeading(d.day) : "No date"}</span>
                {d.day === today && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-900 dark:bg-green-900/40 dark:text-green-100">Today</span>}
                <span className="text-xs text-slate-600 dark:text-slate-300">
                  <strong className="tabular-nums">{d.orders.length}</strong> · <strong className="tabular-nums">{MONEY.format(d.total)}</strong>
                </span>
              </summary>
              <ul>
                {d.orders.map((o) => {
                  const href = `/dashboard/accounts/paid/${o.id}`;
                  const active = path === href;
                  return (
                    <li key={o.id} data-testid="paid-order">
                      <Link
                        href={href}
                        aria-current={active ? "page" : undefined}
                        className={`flex gap-3 border-t border-slate-100 p-3 hover:bg-emerald-50 dark:border-slate-800/70 dark:hover:bg-slate-800 ${active ? "bg-emerald-100/70 dark:bg-emerald-950/40" : ""}`}
                      >
                        {o.coverPhotoId ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/receiving/photos/${o.coverPhotoId}`}
                            alt=""
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.style.visibility = "hidden";
                            }}
                            className="h-14 w-14 shrink-0 rounded-md bg-stone-200 object-cover dark:bg-slate-800"
                          />
                        ) : (
                          <div aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-stone-200 text-lg dark:bg-slate-800">📦</div>
                        )}
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">{o.customerName} — {o.quotationNumber}</p>
                          <p className="truncate text-xs text-slate-600 dark:text-slate-400">{o.trackingNumber || "No tracking #"}</p>
                          <div className="flex flex-wrap gap-1.5">
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${chipClass(o.customerName)}`}>{o.customerName}</span>
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-900 dark:bg-green-900/40 dark:text-green-100">PAID {localTimeOfUtc(o.paidAt)}</span>
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-blue-900 dark:bg-blue-900/40 dark:text-blue-100">{MONEY.format(o.amount)}</span>
                            {o.receipts === 0 && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-100">No receipt</span>}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
      </div>
    </div>
  );
}
