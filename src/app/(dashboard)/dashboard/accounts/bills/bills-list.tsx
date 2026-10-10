"use client";

import Link from "next/link";
import { useState } from "react";
import { AGE_BUCKETS, AGE_LABEL, type AgeBucket } from "@/lib/receivable-rules";
import type { BillStatus } from "@/lib/payable-rules";
import { card, field, fmtDay, fmtMoney } from "@/components/sales-ui";

export type BillRow = {
  id: string; number: string; supplier: string; poNumber: string; invoiceNumber: string; dueDate: string | null; total: number; balance: number;
  status: BillStatus; statusLabel: string; bucket: AgeBucket; dueText: string;
};

const TONE: Record<AgeBucket, string> = {
  D60_PLUS: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  D31_60: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200",
  D1_30: "bg-yellow-100 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200",
  CURRENT: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
};

const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  APPROVED: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  PARTIALLY_PAID: "bg-yellow-100 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200",
};

/** Open bills under closed headings by how late they are (worst first), each heading showing how many and how much. A search opens the headings that match. */
export function BillsList({ rows }: { rows: BillRow[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => !needle || `${r.number} ${r.supplier} ${r.poNumber} ${r.invoiceNumber}`.toLowerCase().includes(needle));
  const groups = AGE_BUCKETS.map((b) => ({ b, rows: shown.filter((r) => r.bucket === b) })).filter((g) => g.rows.length);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="bills-search" className="sr-only">Search bills</label>
        <input id="bills-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by supplier, bill, invoice or order number" className={`${field} max-w-sm`} data-testid="bills-search" />
        <p className="ml-auto text-sm text-slate-600 dark:text-slate-400" data-testid="bills-count">{rows.length} {rows.length === 1 ? "bill" : "bills"} to pay</p>
      </div>
      {groups.length === 0 ? (
        <p className={`${card} text-sm text-slate-600 dark:text-slate-400`} data-testid="bills-empty">{rows.length === 0 ? "No bills to pay right now. A bill appears here when a supplier's order is marked received." : "No bill matches that."}</p>
      ) : (
        groups.map((g) => {
          const owed = g.rows.reduce((n, r) => n + r.balance, 0);
          return (
            <details key={g.b} open={!!needle} className={`${card} !p-0`} data-testid="bills-group" data-bucket={g.b}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[g.b]}`}>{AGE_LABEL[g.b]}</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">{g.rows.length} {g.rows.length === 1 ? "bill" : "bills"}</span>
                <span className="ml-auto text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-50" data-testid="bills-group-owed">{fmtMoney(owed)} to pay</span>
              </summary>
              <ul className="divide-y divide-slate-100 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {g.rows.map((r) => (
                  <li key={r.id}>
                    <Link href={`/dashboard/accounts/bills/${r.id}`} className="grid gap-1 px-4 py-2.5 text-sm hover:bg-stone-50 sm:grid-cols-[6rem_1fr_9rem_8rem_8rem] sm:items-center dark:hover:bg-slate-800/50" data-testid="bills-row" data-status={r.status}>
                      <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-50">{r.number}</span>
                      <span className="min-w-0 truncate">{r.supplier}<span className={`ml-2 rounded px-1.5 text-xs ${STATUS_TONE[r.status] ?? ""}`}>{r.statusLabel}</span></span>
                      <span className={g.b === "CURRENT" ? "text-slate-500" : "font-medium text-red-700 dark:text-red-300"}>{r.dueText}{r.dueDate ? ` · ${fmtDay(r.dueDate)}` : ""}</span>
                      <span className="tabular-nums text-slate-500 sm:text-right">of {fmtMoney(r.total)}</span>
                      <span className="font-semibold tabular-nums sm:text-right">{fmtMoney(r.balance)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          );
        })
      )}
    </div>
  );
}
