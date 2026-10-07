"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { dayHeading, localDayOfUtc, localTimeOfUtc, sumAmounts } from "@/lib/accounts-rules";
import { csMatches, groupEmailed, groupWaiting, TEMPLATE_LABEL, type CsOrder } from "@/lib/customer-service-rules";
import { chipClass, MONEY } from "@/lib/receiving-ui";

const control = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const subscribe = () => () => {};

function localToday() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Orders under closed headings by day, with totals and a search. "waiting" = paid orders not yet emailed (grouped by the
 * day paid, longest wait first); "emailed" = orders the customer was told about (grouped by the day sent, newest first).
 * Days are the viewer's own calendar days, so the grouping happens in the browser once the page has loaded.
 */
export function CsList({ mode, orders }: { mode: "waiting" | "emailed"; orders: CsOrder[] }) {
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const [q, setQ] = useState("");
  const [onlyReady, setOnlyReady] = useState(false);
  const waiting = mode === "waiting";

  if (!ready) return <p className="text-sm text-slate-500">Loading orders…</p>;

  const today = localToday();
  const filtered = orders.filter((o) => csMatches(o, q) && (!waiting || !onlyReady || o.blockers.length === 0));
  const days = waiting ? groupWaiting(filtered) : groupEmailed(filtered);
  const filtering = !!q.trim() || onlyReady;
  const readyCount = orders.filter((o) => o.blockers.length === 0).length;

  return (
    <div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm text-slate-700 dark:text-slate-200" data-testid="cs-totals">
          <strong className="tabular-nums">{filtered.length}</strong> {filtered.length === 1 ? "order" : "orders"} {waiting ? "waiting to be emailed" : "emailed"} ·{" "}
          <strong className="tabular-nums">{MONEY.format(sumAmounts(filtered))}</strong>
          {waiting && (
            <>
              {" "}· <strong className="tabular-nums" data-testid="cs-ready-count">{readyCount}</strong> ready to send
            </>
          )}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label htmlFor="cs-q" className="sr-only">Search orders</label>
          <input id="cs-q" value={q} onChange={(e) => setQ(e.target.value)} className={`${control} w-full max-w-sm`} placeholder="Search a customer, order # or email" />
          {waiting && (
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={onlyReady} onChange={(e) => setOnlyReady(e.target.checked)} className="h-4 w-4 accent-emerald-700" />
              Only ready to send
            </label>
          )}
          {filtering && (
            <button type="button" onClick={() => { setQ(""); setOnlyReady(false); }} className="text-sm text-emerald-800 underline dark:text-emerald-300">Show everything</button>
          )}
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="mt-4 text-sm text-slate-500" data-testid="cs-empty">
          {filtering
            ? "No order matches that."
            : waiting
              ? "Nothing is waiting. When Accounts marks an order Paid, it appears here ready for you to email."
              : "No customer has been emailed yet. Emails you send appear here."}
        </p>
      )}

      <div className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {days.map((d) => (
          <details key={d.day || "none"} open={filtering} data-testid="cs-day" className="group">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60">
              <span aria-hidden className="text-[10px] text-slate-400 transition group-open:rotate-90">▶</span>
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">{d.day ? dayHeading(d.day) : "No date"}</span>
              {d.day === today && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-900 dark:bg-green-900/40 dark:text-green-100">Today</span>}
              <span className="text-xs text-slate-600 dark:text-slate-300">
                <strong className="tabular-nums">{d.orders.length}</strong> · <strong className="tabular-nums">{MONEY.format(d.total)}</strong>
                {waiting && d.orders.some((o) => o.blockers.length > 0) && (
                  <> · <span className="font-medium text-amber-800 dark:text-amber-300">{d.orders.filter((o) => o.blockers.length > 0).length} need attention</span></>
                )}
              </span>
            </summary>
            <ul>
              {d.orders.map((o) => (
                <li key={o.id} data-testid="cs-order">
                  <Link href={`/dashboard/customer-service/order/${o.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 px-4 py-3 hover:bg-emerald-50 dark:border-slate-800/70 dark:hover:bg-slate-800">
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">{o.customerName} — {o.quotationNumber}</p>
                      <p className="truncate text-xs text-slate-600 dark:text-slate-400">{o.email ?? "No email address"}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${chipClass(o.customerName)}`}>{TEMPLATE_LABEL[o.template] ?? o.template}</span>
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-blue-900 dark:bg-blue-900/40 dark:text-blue-100">{MONEY.format(o.amount)}</span>
                      {o.adjusted && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">Adjusted</span>}
                      {waiting ? (
                        <>
                          <span className="text-xs text-slate-500">Paid {localDayOfUtc(o.paidAt) === today ? "today " : ""}{localTimeOfUtc(o.paidAt)}</span>
                          {o.blockers.length === 0 ? (
                            <span data-testid="cs-badge" className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-900 dark:bg-green-900/40 dark:text-green-100">Ready to send</span>
                          ) : (
                            <span data-testid="cs-badge" title={o.blockers.join(" ")} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">Needs attention</span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="text-xs text-slate-500">Emailed {localTimeOfUtc(o.emailedAt)}</span>
                          {o.emailCount > 1 && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-100">Sent {o.emailCount} times</span>}
                        </>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </div>
  );
}
