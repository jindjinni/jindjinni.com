"use client";

import Link from "next/link";
import { useState } from "react";
import { PO_STATUSES, PO_STATUS_LABEL, type PoStatus } from "@/lib/purchase-order-rules";
import { card, field, fmtDay, fmtMoney } from "@/components/sales-ui";

export type PoRow = { id: string; number: string; supplier: string; date: string; total: number; status: PoStatus; lines: number };

const TONE: Record<PoStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  SENT: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  CONFIRMED: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  RECEIVED: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  CANCELLED: "bg-stone-200 text-stone-600 line-through dark:bg-stone-800 dark:text-stone-300",
};

export function PoStatusChip({ status }: { status: PoStatus }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[status]}`} data-testid="po-status-chip" data-status={status}>
      {PO_STATUS_LABEL[status]}
    </span>
  );
}

const ORDER: PoStatus[] = ["DRAFT", "SENT", "CONFIRMED", "RECEIVED", "CANCELLED"];

// Purchase orders under closed headings by where they stand (Draft, Sent, Confirmed, Received, Cancelled), each heading showing
// how many and how much. A search opens the groups that have a match.
export function PoList({ rows }: { rows: PoRow[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => !needle || `${r.number} ${r.supplier}`.toLowerCase().includes(needle));
  const groups = PO_STATUSES.slice().sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).map((s) => ({ s, rows: shown.filter((r) => r.status === s) })).filter((g) => g.rows.length);
  return (
    <div className="mt-5 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="po-search" className="sr-only">Search purchase orders</label>
        <input id="po-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by number or supplier" className={`${field} max-w-xs`} data-testid="po-search" />
        <p className="ml-auto text-sm text-slate-600 dark:text-slate-400" data-testid="po-count">{rows.length} {rows.length === 1 ? "order" : "orders"}</p>
      </div>
      {groups.length === 0 ? (
        <p className={`${card} text-sm text-slate-600 dark:text-slate-400`} data-testid="po-empty">
          {rows.length === 0 ? "No purchase orders yet. Use the button above to make the first one." : "No purchase order matches that."}
        </p>
      ) : (
        groups.map((g) => (
          <details key={g.s} open={!!needle} className={`${card} !p-0`} data-testid="po-group" data-status={g.s}>
            <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3">
              <PoStatusChip status={g.s} />
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">{g.rows.length} {g.rows.length === 1 ? "order" : "orders"}</span>
              <span className="ml-auto text-sm tabular-nums text-slate-600 dark:text-slate-300">{fmtMoney(g.rows.reduce((n, r) => n + r.total, 0))}</span>
            </summary>
            <ul className="divide-y divide-slate-100 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {g.rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/dashboard/purchasing/purchase-orders/${r.id}`} className="grid gap-1 px-4 py-2.5 text-sm hover:bg-stone-50 sm:grid-cols-[6rem_1fr_7rem_5rem_7rem] sm:items-center dark:hover:bg-slate-800/50" data-testid="po-row">
                    <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-50">{r.number}</span>
                    <span className="truncate">{r.supplier}</span>
                    <span className="text-slate-500">{fmtDay(r.date)}</span>
                    <span className="text-slate-500">{r.lines} {r.lines === 1 ? "item" : "items"}</span>
                    <span className="tabular-nums sm:text-right">{fmtMoney(r.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ))
      )}
    </div>
  );
}
