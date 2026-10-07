"use client";

import { useState, useTransition } from "react";
import { saveEstimatesAction } from "@/app/actions/inventory";

export type PriceRow = { productKey: string; productName: string; brand: string; condition: string; low: string; high: string };
const field = "w-24 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-right text-sm tabular-nums dark:border-slate-700 dark:bg-slate-900";

export function PricesForm({ rows: initial }: { rows: PriceRow[] }) {
  const [rows, setRows] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const key = (r: PriceRow) => `${r.productKey}|${r.condition}`;
  const set = (r: PriceRow, patch: Partial<PriceRow>) => setRows((rs) => rs.map((x) => (key(x) === key(r) ? { ...x, ...patch } : x)));

  if (initial.length === 0) return <p className="mt-6 text-sm text-slate-600 dark:text-slate-300" data-testid="ep-empty">No products are in stock yet. Once stock arrives or you add some, set the prices here.</p>;

  return (
    <div className="mt-5">
      <div className="relative overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full min-w-[620px] text-left text-sm" data-testid="ep-table">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <th className="px-3 py-2 font-medium">Product</th>
              <th className="px-3 py-2 font-medium">Condition</th>
              <th className="px-3 py-2 text-right font-medium">Lowest ($)</th>
              <th className="px-3 py-2 text-right font-medium">Highest ($)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={key(r)} data-testid="ep-row" className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2"><span className="font-medium text-slate-900 dark:text-slate-50">{r.productName}</span><span className="block text-xs text-slate-500">{r.brand}</span></td>
                <td className="px-3 py-2">{r.condition}</td>
                <td className="px-3 py-2 text-right"><label className="sr-only" htmlFor={`ep-low-${key(r)}`}>Lowest price for {r.productName}, {r.condition}</label><input id={`ep-low-${key(r)}`} inputMode="decimal" value={r.low} onChange={(e) => set(r, { low: e.target.value.replace(/[^\d.]/g, "") })} className={field} data-testid="ep-low" /></td>
                <td className="px-3 py-2 text-right"><label className="sr-only" htmlFor={`ep-high-${key(r)}`}>Highest price for {r.productName}, {r.condition}</label><input id={`ep-high-${key(r)}`} inputMode="decimal" value={r.high} onChange={(e) => set(r, { high: e.target.value.replace(/[^\d.]/g, "") })} className={field} data-testid="ep-high" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => { setMsg(null); start(async () => { const res = await saveEstimatesAction(rows.map((r) => ({ productKey: r.productKey, condition: r.condition, low: r.low, high: r.high }))); setMsg(res.ok ? { ok: true, text: res.message ?? "Saved." } : { ok: false, text: res.error ?? "Could not save." }); }); }}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
          data-testid="ep-save"
        >
          {pending ? "Saving…" : "Save prices"}
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-800 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`} data-testid={msg.ok ? "ep-message" : "ep-error"}>{msg.text}</span>}
      </div>
    </div>
  );
}
