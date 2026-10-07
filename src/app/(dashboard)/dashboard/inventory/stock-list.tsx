"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { expirySpan, MONEY, rangeLabel } from "@/lib/inventory-rules";
import { conditionChip } from "@/lib/inventory-ui";

export type LineView = {
  key: string;
  condition: string;
  groupKey: string;
  groupLabel: string;
  quantity: number;
  costValue: number;
  costKnownUnits: number;
  expiryFrom: string | null;
  expiryTo: string | null;
  lotCount: number;
  estLow: number | null;
  estHigh: number | null;
  hasEstimate: boolean;
  received: number;
  manual: number;
};
export type ProductView = { key: string; productName: string; quantity: number; costValue: number; estLow: number | null; estHigh: number | null; lines: LineView[] };
export type BrandView = { key: string; brand: string; quantity: number; costValue: number; estLow: number | null; estHigh: number | null; products: ProductView[] };
export type Totals = { units: number; lines: number; products: number; costValue: number; estLow: number | null; estHigh: number | null; oversold: number };

const control = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const nf = new Intl.NumberFormat("en-US");

const GROUP_CLASS = (key: string) =>
  key === "expired"
    ? "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100"
    : key === "none"
      ? "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
      : "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100";

export function StockList({ brands, totals, today, canWrite }: { brands: BrandView[]; totals: Totals; today: string; canWrite: boolean }) {
  const [q, setQ] = useState("");
  const [cond, setCond] = useState("");
  const [grp, setGrp] = useState("");

  const conditions = useMemo(() => [...new Set(brands.flatMap((b) => b.products.flatMap((p) => p.lines.map((l) => l.condition))))].sort(), [brands]);
  const groups = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of brands) for (const p of b.products) for (const l of p.lines) m.set(l.groupKey, l.groupLabel);
    return [...m.entries()];
  }, [brands]);

  const term = q.trim().toLowerCase();
  const filtering = !!(term || cond || grp);
  const shown = useMemo(() => {
    if (!filtering) return brands;
    const out: BrandView[] = [];
    for (const b of brands) {
      const products: ProductView[] = [];
      for (const p of b.products) {
        const hit = !term || p.productName.toLowerCase().includes(term) || b.brand.toLowerCase().includes(term);
        const lines = p.lines.filter((l) => hit && (!cond || l.condition === cond) && (!grp || l.groupKey === grp));
        if (lines.length) {
          const sum = (f: (l: LineView) => number | null) => {
            const v = lines.map(f).filter((x): x is number => x != null);
            return v.length ? v.reduce((n, x) => n + x, 0) : null;
          };
          products.push({ ...p, lines, quantity: lines.reduce((n, l) => n + l.quantity, 0), costValue: lines.reduce((n, l) => n + l.costValue, 0), estLow: sum((l) => l.estLow), estHigh: sum((l) => l.estHigh) });
        }
      }
      if (products.length) {
        const sum = (f: (p: ProductView) => number | null) => {
          const v = products.map(f).filter((x): x is number => x != null);
          return v.length ? v.reduce((n, x) => n + x, 0) : null;
        };
        out.push({ ...b, products, quantity: products.reduce((n, p) => n + p.quantity, 0), costValue: products.reduce((n, p) => n + p.costValue, 0), estLow: sum((p) => p.estLow), estHigh: sum((p) => p.estHigh) });
      }
    }
    return out;
  }, [brands, filtering, term, cond, grp]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Live Stock</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            What is in stock right now, by brand and product. Stock arrives by itself from Receiving (only good items: no recalls, no counterfeit holds, nothing going back). Products of the same condition and expiration group share one line.
          </p>
        </div>
        {canWrite && (
          <Link href="/dashboard/inventory/manual-add" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800" data-testid="inv-manual-link">
            Manual Add
          </Link>
        )}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="inv-summary">
        <Tile label="Units in stock" value={nf.format(totals.units)} testid="inv-units" note={`${totals.products} ${totals.products === 1 ? "product" : "products"} · ${totals.lines} ${totals.lines === 1 ? "line" : "lines"}`} />
        <Tile label="Cost value" value={MONEY.format(totals.costValue)} testid="inv-cost" note="what the stock cost" />
        <Tile label="Estimated value" value={rangeLabel(totals.estLow, totals.estHigh) || "Not set"} testid="inv-est" note="from your estimated prices" />
        <Tile label="As of" value={today} testid="inv-today" note="expiration groups follow today" />
      </dl>
      {totals.oversold > 0 && (
        <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100" data-testid="inv-oversold">
          {totals.oversold} {totals.oversold === 1 ? "line has" : "lines have"} sold more than is in stock. Look for the red numbers below.
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <label htmlFor="inv-q" className="sr-only">Search stock</label>
        <input id="inv-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a brand or product" className={`${control} w-full sm:w-72`} data-testid="inv-search" />
        <label htmlFor="inv-cond" className="sr-only">Condition</label>
        <select id="inv-cond" value={cond} onChange={(e) => setCond(e.target.value)} className={control} data-testid="inv-cond">
          <option value="">Every condition</option>
          {conditions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label htmlFor="inv-grp" className="sr-only">Expiration group</label>
        <select id="inv-grp" value={grp} onChange={(e) => setGrp(e.target.value)} className={control} data-testid="inv-grp">
          <option value="">Every expiration group</option>
          {groups.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {filtering && (
          <button type="button" onClick={() => { setQ(""); setCond(""); setGrp(""); }} className="text-sm text-emerald-800 underline dark:text-emerald-300">Show everything</button>
        )}
      </div>

      {brands.length === 0 && (
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300" data-testid="inv-empty">
          Nothing is in stock yet. Products appear here as soon as Receiving submits a package{canWrite ? ", or you can load your starting stock with Manual Add." : "."}
        </p>
      )}
      {brands.length > 0 && shown.length === 0 && <p className="mt-6 text-sm text-slate-600 dark:text-slate-300">No stock matches that.</p>}

      <div className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {shown.map((b) => (
          <details key={b.key} open={filtering} data-testid="inv-brand" className="group">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60">
              <span aria-hidden className="text-[10px] text-slate-400 transition group-open:rotate-90">▶</span>
              <span className="min-w-[8rem] text-base font-semibold text-slate-900 dark:text-slate-50" data-testid="inv-brand-name">{b.brand}</span>
              <Totals qty={b.quantity} cost={b.costValue} low={b.estLow} high={b.estHigh} />
            </summary>
            <div className="border-t border-slate-100 bg-stone-50/60 dark:border-slate-800 dark:bg-slate-950/40">
              {b.products.map((p) => (
                <details key={p.key} open={filtering} data-testid="inv-product" className="group/p border-b border-slate-100 last:border-b-0 dark:border-slate-800/70">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 py-2.5 pl-9 pr-4 hover:bg-white dark:hover:bg-slate-900">
                    <span aria-hidden className="text-[10px] text-slate-400 transition group-open/p:rotate-90">▶</span>
                    <span className="min-w-[10rem] flex-1 text-sm font-semibold text-slate-900 dark:text-slate-50" data-testid="inv-product-name">{p.productName}</span>
                    <Totals qty={p.quantity} cost={p.costValue} low={p.estLow} high={p.estHigh} />
                  </summary>
                  <div className="overflow-x-auto pb-3 pl-9 pr-4">
                    <table className="w-full min-w-[640px] text-left text-sm" data-testid="inv-lines">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          <th className="py-1.5 pr-3 font-medium">Condition</th>
                          <th className="py-1.5 pr-3 font-medium">Expiration</th>
                          <th className="py-1.5 pr-3 text-right font-medium">In stock</th>
                          <th className="py-1.5 pr-3 text-right font-medium">Cost value</th>
                          <th className="py-1.5 pr-3 text-right font-medium">Estimated value</th>
                          <th className="py-1.5 font-medium">Lots</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.lines.map((l) => (
                          <tr key={l.key} data-testid="inv-line" className="border-t border-slate-200 align-top dark:border-slate-800">
                            <td className="py-2 pr-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${conditionChip(l.condition)}`} data-testid="inv-line-cond">{l.condition}</span></td>
                            <td className="py-2 pr-3">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${GROUP_CLASS(l.groupKey)}`} data-testid="inv-line-group">{l.groupLabel}</span>
                              {l.expiryFrom && <span className="ml-2 text-xs text-slate-600 dark:text-slate-300" data-testid="inv-line-span">{expirySpan(l.expiryFrom, l.expiryTo)}</span>}
                            </td>
                            <td className={`py-2 pr-3 text-right font-semibold tabular-nums ${l.quantity < 0 ? "text-red-700 dark:text-red-300" : "text-slate-900 dark:text-slate-50"}`} data-testid="inv-line-qty">
                              {nf.format(l.quantity)}
                              {(l.received > 0 && l.manual > 0) && <span className="block text-[11px] font-normal text-slate-500">{nf.format(l.received)} received · {nf.format(l.manual)} added</span>}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums" data-testid="inv-line-cost">
                              {l.costKnownUnits > 0 ? MONEY.format(l.costValue) : <span className="text-slate-400">-</span>}
                              {l.costKnownUnits > 0 && l.costKnownUnits < l.quantity && <span className="block text-[11px] text-slate-500">cost known for {nf.format(l.costKnownUnits)}</span>}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums" data-testid="inv-line-est">{rangeLabel(l.estLow, l.estHigh) || <span className="text-slate-400">{l.hasEstimate ? "-" : "not set"}</span>}</td>
                            <td className="py-2 text-xs text-slate-600 dark:text-slate-300">{l.lotCount} {l.lotCount === 1 ? "lot" : "lots"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <Link href={`/dashboard/inventory/p/${encodeURIComponent(p.key)}`} className="mt-1 inline-block text-sm font-medium text-emerald-800 underline dark:text-emerald-300" data-testid="inv-details-link">
                      Lots, serial numbers and history
                    </Link>
                  </div>
                </details>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function Tile({ label, value, note, testid }: { label: string; value: string; note: string; testid: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-slate-50" data-testid={testid}>{value}</dd>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{note}</p>
    </div>
  );
}

function Totals({ qty, cost, low, high }: { qty: number; cost: number; low: number | null; high: number | null }) {
  const est = rangeLabel(low, high);
  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-slate-600 dark:text-slate-300">
      <span><strong className={`tabular-nums ${qty < 0 ? "text-red-700 dark:text-red-300" : ""}`} data-testid="inv-total-qty">{nf.format(qty)}</strong> in stock</span>
      <span>cost <strong className="tabular-nums">{MONEY.format(cost)}</strong></span>
      {est && <span>est. <strong className="tabular-nums">{est}</strong></span>}
    </span>
  );
}
