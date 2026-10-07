"use client";

import Link from "next/link";
import { useState } from "react";

export type HistoryRow = {
  id: string;
  day: string;
  kind: "RECEIVED" | "MANUAL_ADD" | "SALE" | "ADJUSTMENT";
  productName: string;
  brand: string;
  condition: string;
  expiry: string | null;
  lot: string | null;
  quantity: number;
  detail: string;
  href: string | null;
  by: string;
};

const KIND: Record<HistoryRow["kind"], { label: string; cls: string }> = {
  RECEIVED: { label: "Received", cls: "bg-lime-100 text-lime-900 dark:bg-lime-900/40 dark:text-lime-100" },
  MANUAL_ADD: { label: "Added by hand", cls: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100" },
  SALE: { label: "Sold", cls: "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100" },
  ADJUSTMENT: { label: "Correction", cls: "bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100" },
};
const control = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";

export function HistoryList({ rows }: { rows: HistoryRow[] }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const term = q.trim().toLowerCase();
  const shown = rows.filter((r) => (!kind || r.kind === kind) && (!term || [r.productName, r.brand, r.condition, r.lot ?? "", r.detail, r.by].some((x) => x.toLowerCase().includes(term))));
  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        <label htmlFor="sh-q" className="sr-only">Search the history</label>
        <input id="sh-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a product, lot, order or person" className={`${control} w-full sm:w-80`} data-testid="sh-search" />
        <label htmlFor="sh-kind" className="sr-only">Type of change</label>
        <select id="sh-kind" value={kind} onChange={(e) => setKind(e.target.value)} className={control} data-testid="sh-kind">
          <option value="">Every change</option>
          {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      {shown.length === 0 && <p className="mt-6 text-sm text-slate-600 dark:text-slate-300" data-testid="sh-empty">{rows.length ? "Nothing matches that." : "Nothing has changed the stock yet."}</p>}
      {shown.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[760px] text-left text-sm" data-testid="sh-table">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Change</th>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium">Condition</th>
                <th className="px-3 py-2 font-medium">Expiration</th>
                <th className="px-3 py-2 text-right font-medium">Units</th>
                <th className="px-3 py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} data-testid="sh-row" className="border-t border-slate-100 align-top dark:border-slate-800">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{r.day}</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${KIND[r.kind].cls}`}>{KIND[r.kind].label}</span></td>
                  <td className="px-3 py-2"><span className="font-medium text-slate-900 dark:text-slate-50">{r.productName}</span>{r.brand && <span className="block text-xs text-slate-500">{r.brand}</span>}</td>
                  <td className="px-3 py-2">{r.condition}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{r.expiry ?? "none"}{r.lot && <span className="block text-xs text-slate-500">lot {r.lot}</span>}</td>
                  <td className={`px-3 py-2 text-right font-semibold tabular-nums ${r.quantity < 0 ? "text-red-700 dark:text-red-300" : ""}`}>{r.quantity > 0 ? `+${r.quantity}` : r.quantity}</td>
                  <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                    {r.href ? <Link href={r.href} className="underline">{r.detail}</Link> : r.detail}
                    {r.by && <span className="block text-slate-500">by {r.by}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
