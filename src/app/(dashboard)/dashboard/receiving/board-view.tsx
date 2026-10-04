"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { BoardCard } from "@/lib/receiving-queries";
import { STATUS_LABELS } from "@/lib/receiving-rules";
import { MONEY, STATUS_PILL, chipClass, formatStamp } from "@/lib/receiving-ui";

const COLUMNS = ["IN_PROGRESS", "RECEIVING_COMPLETE", "RECEIVING_COMPLETE_WITH_DISCREPANCY"] as const;
const HEAD: Record<(typeof COLUMNS)[number], string> = {
  IN_PROGRESS: "border-yellow-400",
  RECEIVING_COMPLETE: "border-green-500",
  RECEIVING_COMPLETE_WITH_DISCREPANCY: "border-orange-500",
};

export function BoardView({ cards }: { cards: BoardCard[] }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? cards.filter((c) => c.searchText.includes(t)) : cards;
  }, [cards, q]);

  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">All Shipments</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {cards.length} {cards.length === 1 ? "shipment" : "shipments"} · grouped by receiving status
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="board-search" className="sr-only">Search shipments</label>
          <input
            id="board-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search customer, order # or tracking"
            className="w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <Link href="/dashboard/receiving/intake" className="rounded-lg bg-[#F7B838] px-3 py-2 text-sm font-semibold text-amber-950 hover:brightness-95">
            Receive an order
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = shown.filter((c) => c.status === col);
          return (
            <section key={col} aria-label={STATUS_LABELS[col]} className="min-w-0">
              <h2 className={`mb-3 flex items-center justify-between border-b-4 pb-2 text-sm font-semibold text-slate-800 dark:text-slate-100 ${HEAD[col]}`}>
                <span>{STATUS_LABELS[col]}</span>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs dark:bg-slate-800">{list.length}</span>
              </h2>
              <div className="flex flex-col gap-3">
                {list.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">Nothing here.</p>}
                {list.map((c) => (
                  <Link
                    key={c.id}
                    href={`/dashboard/receiving/intake/${c.id}`}
                    className="block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-600 dark:border-slate-800 dark:bg-slate-900"
                  >
                    {c.coverPhotoId ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/receiving/photos/${c.coverPhotoId}`} alt="Unopened package" loading="lazy" className="h-36 w-full object-cover" />
                    ) : (
                      <div className="flex h-20 w-full items-center justify-center bg-stone-100 text-xs text-slate-500 dark:bg-slate-800">No package photo yet</div>
                    )}
                    <div className="space-y-2 p-3">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">{c.trackingNumber || "No tracking #"}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${chipClass(c.customerName)}`}>{c.customerName}</span>
                        <span className="text-xs text-slate-600 dark:text-slate-400">{c.quotationNumber}</span>
                      </div>
                      <dl className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                        <div className="flex items-center justify-between gap-2">
                          <dt>Order Total</dt>
                          <dd className="rounded-full bg-sky-100 px-2 py-0.5 font-medium tabular-nums text-sky-900 dark:bg-sky-900/50 dark:text-sky-100">{MONEY.format(c.grandTotal)}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <dt>Received</dt>
                          <dd className="text-slate-800 dark:text-slate-200">{formatStamp(c.receivedAt)}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <dt>Adjustment</dt>
                          <dd>
                            {c.adjustmentNeeded === "YES" ? (
                              <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-900 dark:bg-red-900/40 dark:text-red-100">Needed</span>
                            ) : c.adjustmentNeeded === "NO" ? (
                              <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-900 dark:bg-green-900/40 dark:text-green-100">None</span>
                            ) : (
                              <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_PILL.IN_PROGRESS}`}>Not checked</span>
                            )}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
