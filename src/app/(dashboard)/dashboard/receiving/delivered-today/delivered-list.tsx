"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { dayHeading } from "@/lib/accounts-rules";
import { addDays } from "@/lib/payment-due";
import { formatUtcStamp } from "@/lib/receiving-ui";
import type { DeliveredRow } from "@/lib/tracking-queries";

const RECEIVING_CHIP: Record<DeliveredRow["receiving"], { text: string; cls: string }> = {
  NONE: { text: "Not received yet", cls: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" },
  IN_PROGRESS: { text: "Receiving started", cls: "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100" },
  DONE: { text: "Received", cls: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100" },
};

const link = "font-medium text-slate-900 hover:underline dark:text-slate-50";

export function DeliveredList({ rows, today, canOpenQuotation }: { rows: DeliveredRow[]; today: string; canOpenQuotation: boolean }) {
  const router = useRouter();
  // The list updates itself: new deliveries show up within a minute without pressing anything.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 60_000);
    return () => clearInterval(t);
  }, [router]);

  const todays = rows.filter((r) => r.day === today);
  const earlier = rows.filter((r) => r.day !== today);
  const days = [...new Set(earlier.map((r) => r.day))].sort().reverse();

  // Purchasing roles open the quotation. A receiver can't open Purchasing, so their links go to the receiving record.
  const hrefFor = (r: DeliveredRow) => (canOpenQuotation ? `/dashboard/purchasing/quotations/${r.quotationId}` : r.packageId ? `/dashboard/receiving/intake/${r.packageId}` : "/dashboard/receiving/intake");

  const table = (list: DeliveredRow[]) => (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800" data-testid="delivered-rows">
      {list.map((r) => (
        <li key={r.id} data-testid="delivered-row" className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-sm">
          <Link href={hrefFor(r)} data-testid="delivered-name" className={`${link} min-w-[10rem]`}>{r.customerName}</Link>
          <Link href={hrefFor(r)} data-testid="delivered-quotation" className="text-emerald-800 underline dark:text-emerald-300">{r.quotationNumber}</Link>
          <Link href={hrefFor(r)} data-testid="delivered-tracking" className="font-mono text-xs text-slate-700 underline dark:text-slate-200">{r.trackingNumber}</Link>
          <span className="text-xs text-slate-500">{r.carrier}</span>
          <span className="text-xs text-slate-500" suppressHydrationWarning>{formatUtcStamp(r.deliveredAt).replace(/^[A-Za-z]{3} \d{1,2}, \d{4}, /, "")}</span>
          <span data-testid="delivered-received" className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${RECEIVING_CHIP[r.receiving].cls}`}>{RECEIVING_CHIP[r.receiving].text}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Delivered Today</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
        Packages the carrier says were delivered, straight from Purchasing&apos;s live tracking. Click a name, quotation or tracking number to open the order.
      </p>

      <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" data-testid="delivered-today">
        <div className="flex flex-wrap items-baseline gap-x-3 border-b border-slate-100 bg-amber-50 px-3 py-2.5 dark:border-slate-800 dark:bg-amber-950/30">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Today · {dayHeading(today)}</h2>
          <span className="text-xs text-slate-700 dark:text-slate-200" data-testid="delivered-count">
            <strong className="tabular-nums">{todays.length}</strong> {todays.length === 1 ? "package" : "packages"}
          </span>
        </div>
        {todays.length === 0 ? <p className="p-4 text-sm text-slate-500" data-testid="delivered-none">Nothing has been delivered yet today. New deliveries appear here by themselves.</p> : table(todays)}
      </section>

      {days.length > 0 && (
        <div className="mt-5 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Earlier this week</h2>
          {days.map((d) => {
            const list = earlier.filter((r) => r.day === d);
            return (
              <details key={d} data-testid="delivered-day" className="group overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <span aria-hidden className="text-[10px] text-slate-400 transition group-open:rotate-90">▶</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">{d === addDays(today, -1) ? `Yesterday · ${dayHeading(d)}` : dayHeading(d)}</span>
                  <span className="text-xs text-slate-600 dark:text-slate-300"><strong className="tabular-nums">{list.length}</strong> {list.length === 1 ? "package" : "packages"}</span>
                </summary>
                {table(list)}
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
