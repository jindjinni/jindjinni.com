"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { dayHeading, dayOf, groupByDay, orderMatches, sumAmounts, type AccountsOrder } from "@/lib/accounts-rules";
import { chipClass, MONEY } from "@/lib/receiving-ui";

/** The waiting orders as small cards (like the Receiving intake list), under closed day headings: the day each was received, oldest first. */
export function AccountsList({ orders }: { orders: AccountsOrder[] }) {
  const path = usePathname();
  const [q, setQ] = useState("");
  const shown = useMemo(() => orders.filter((o) => orderMatches(o, q)), [orders, q]);
  const days = useMemo(() => groupByDay(shown, (o) => dayOf(o.receivedAt), false), [shown]);
  const searching = q.trim() !== "";

  return (
    <div className="flex flex-col">
      <div className="border-b border-slate-200 bg-emerald-50 p-3 dark:border-slate-800 dark:bg-emerald-950/30">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-200">To be paid</p>
        <p className="mt-1 text-sm text-slate-700 dark:text-slate-200" data-testid="tbp-totals">
          <strong className="tabular-nums">{shown.length}</strong> {shown.length === 1 ? "order" : "orders"} waiting · <strong className="tabular-nums">{MONEY.format(sumAmounts(shown))}</strong> to pay
        </p>
      </div>
      <div className="border-b border-slate-200 p-3 dark:border-slate-800">
        <label htmlFor="tbp-q" className="sr-only">Search orders waiting to be paid</label>
        <input
          id="tbp-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a customer, order # or tracking #"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
      </div>

      {shown.length === 0 && (
        <p className="p-4 text-sm text-slate-500">
          {orders.length === 0 ? "Nothing is waiting to be paid. When Receiving sets an order to Need to Be Paid, it shows up here by itself." : "No waiting order matches."}
        </p>
      )}

      <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
        {days.map((d) => {
          const hasActive = d.orders.some((o) => path === `/dashboard/accounts/${o.id}`);
          return (
            <details key={d.day || "none"} open={searching || hasActive} data-testid="tbp-day" className="group">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                <span aria-hidden className="text-[10px] text-slate-400 transition group-open:rotate-90">▶</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">{d.day ? dayHeading(d.day) : "No date"}</span>
                <span className="text-xs text-slate-600 dark:text-slate-300">
                  <strong className="tabular-nums">{d.orders.length}</strong> · <strong className="tabular-nums">{MONEY.format(d.total)}</strong>
                </span>
              </summary>
              <ul>
                {d.orders.map((o) => {
                  const href = `/dashboard/accounts/${o.id}`;
                  const active = path === href;
                  return (
                    <li key={o.id} data-testid="tbp-order">
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
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-blue-900 dark:bg-blue-900/40 dark:text-blue-100">{MONEY.format(o.amount)}</span>
                            {o.adjusted && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-900 dark:bg-orange-900/40 dark:text-orange-100">Adjusted</span>}
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${o.receipts > 0 ? "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100" : "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100"}`}>
                              {o.receipts > 0 ? "Receipt attached" : "Needs receipt"}
                            </span>
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
