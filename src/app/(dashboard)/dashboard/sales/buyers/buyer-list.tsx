"use client";

import Link from "next/link";
import { useState } from "react";
import { card, field, fmtDay, fmtMoney } from "@/components/sales-ui";

export type BuyerRow = { id: string; name: string; contact: string; email: string; phone: string; terms: string; active: boolean; invoices: number; invoiced: number; owed: number; lastInvoice: string; prices: number; unmatched: number };

export function BuyerList({ rows }: { rows: BuyerRow[] }) {
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => (showInactive || r.active) && (!needle || `${r.name} ${r.contact} ${r.email}`.toLowerCase().includes(needle)));
  const owed = rows.reduce((n, r) => n + r.owed, 0);
  return (
    <div className="mt-5 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="buyer-search" className="sr-only">Search buyers</label>
        <input id="buyer-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search buyers" className={`${field} max-w-xs`} data-testid="buyer-search" />
        <label htmlFor="buyer-inactive" className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input id="buyer-inactive" type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} data-testid="buyer-show-inactive" /> Show inactive buyers
        </label>
        <p className="ml-auto text-sm text-slate-600 dark:text-slate-400" data-testid="buyer-owed">
          {rows.filter((r) => r.active).length} buyers · owed to you <strong className="tabular-nums">{fmtMoney(owed)}</strong>
        </p>
      </div>
      {shown.length === 0 ? (
        <p className={`${card} text-sm text-slate-600 dark:text-slate-400`} data-testid="buyer-empty">
          {rows.length === 0 ? "No buyers yet. Add one, or upload a spreadsheet of your buyers below." : "No buyer matches that."}
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {shown.map((r) => (
            <li key={r.id} data-testid="buyer-row">
              <Link href={`/dashboard/sales/buyers/${r.id}`} className="grid gap-1 px-4 py-3 hover:bg-stone-50 sm:grid-cols-[1.4fr_1fr_auto] sm:items-center dark:hover:bg-slate-800/50">
                <span>
                  <span className="font-semibold text-slate-900 dark:text-slate-50">{r.name}</span>
                  {!r.active && <span className="ml-2 rounded-full bg-stone-200 px-2 py-0.5 text-xs text-stone-700 dark:bg-stone-800 dark:text-stone-300">Inactive</span>}
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{[r.contact, r.email, r.terms].filter(Boolean).join(" · ") || "No contact details yet"}</span>
                </span>
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  {r.invoices ? `${r.invoices} ${r.invoices === 1 ? "invoice" : "invoices"} · ${fmtMoney(r.invoiced)}${r.lastInvoice ? ` · last ${fmtDay(r.lastInvoice)}` : ""}` : "No invoices yet"}
                </span>
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  {r.owed > 0 && <span className="rounded-full bg-yellow-100 px-2 py-0.5 font-semibold text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">Owes {fmtMoney(r.owed)}</span>}
                  <span className={`rounded-full px-2 py-0.5 ${r.prices ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                    {r.prices ? `${r.prices} prices${r.unmatched ? ` · ${r.unmatched} to match` : ""}` : "No price sheet"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
