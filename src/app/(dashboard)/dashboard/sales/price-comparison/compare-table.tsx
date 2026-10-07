"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { normKey } from "@/lib/inventory-rules";
import { buildComparison, winCounts, type ComparePrice, type CompareProduct } from "@/lib/sales-rules";
import { card, field, fmtMoney } from "@/components/sales-ui";

export type CompareData = { buyers: { id: string; name: string }[]; products: CompareProduct[]; prices: ComparePrice[]; onHand: Record<string, number>; conditions: string[] };

export function CompareTable({ data }: { data: CompareData }) {
  const [condition, setCondition] = useState(data.conditions.find((c) => normKey(c) === "mint") ?? data.conditions[0] ?? "Mint");
  const [onlyInStock, setOnlyInStock] = useState(true);
  const [search, setSearch] = useState("");
  const result = useMemo(
    () => buildComparison({ products: data.products, prices: data.prices, onHand: new Map(Object.entries(data.onHand)), condition, onlyInStock, search }),
    [data, condition, onlyInStock, search],
  );
  const wins = winCounts(result.rows);
  const name = (id: string) => data.buyers.find((b) => b.id === id)?.name ?? "";
  const totalValue = result.rows.reduce((n, r) => n + r.value, 0);
  const units = result.rows.reduce((n, r) => n + r.onHand, 0);
  const noPrice = result.rows.filter((r) => !r.best && r.onHand > 0);
  const searching = search.trim().length > 0;

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="cmp-cond" className="text-xs font-medium text-slate-700 dark:text-slate-300">Condition</label>
          <select id="cmp-cond" value={condition} onChange={(e) => setCondition(e.target.value)} className={`${field} mt-1 !w-44`} data-testid="cmp-cond">
            {(data.conditions.length ? data.conditions : ["Mint"]).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="cmp-search" className="text-xs font-medium text-slate-700 dark:text-slate-300">Find a product</label>
          <input id="cmp-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or brand" className={`${field} mt-1 !w-56`} data-testid="cmp-search" />
        </div>
        <label htmlFor="cmp-stock" className="flex items-center gap-2 pb-2 text-sm text-slate-800 dark:text-slate-100">
          <input id="cmp-stock" type="checkbox" checked={onlyInStock} onChange={(e) => setOnlyInStock(e.target.checked)} data-testid="cmp-only-stock" /> Only products I have in stock
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3" data-testid="cmp-tiles">
        <div className={card}><p className="text-xs uppercase tracking-wide text-slate-500">Products shown</p><p className="mt-1 text-2xl font-bold tabular-nums" data-testid="cmp-count">{result.rows.length}</p><p className="text-xs text-slate-500">{units} units on hand</p></div>
        <div className={card}><p className="text-xs uppercase tracking-wide text-slate-500">Stock worth at best prices</p><p className="mt-1 text-2xl font-bold tabular-nums" data-testid="cmp-value">{fmtMoney(totalValue)}</p>{noPrice.length > 0 && <p className="text-xs text-yellow-700 dark:text-yellow-300" data-testid="cmp-noprice">{noPrice.length} in stock with no buyer price</p>}</div>
        <div className={card}>
          <p className="text-xs uppercase tracking-wide text-slate-500">Pays the most for</p>
          <ul className="mt-1 space-y-0.5 text-sm" data-testid="cmp-wins">
            {data.buyers.filter((b) => wins[b.id]).sort((a, b) => wins[b.id] - wins[a.id]).map((b) => <li key={b.id} className="flex justify-between gap-2"><span className="truncate">{b.name}</span><span className="tabular-nums font-semibold">{wins[b.id]} {wins[b.id] === 1 ? "product" : "products"}</span></li>)}
            {Object.keys(wins).length === 0 && <li className="text-slate-500">Nothing to compare yet.</li>}
          </ul>
        </div>
      </div>

      {result.blocks.length === 0 ? (
        <p className={`${card} text-sm text-slate-600 dark:text-slate-400`} data-testid="cmp-empty">
          {onlyInStock ? "None of the products you have in stock has a price from a buyer in this condition. Untick \"Only products I have in stock\" to see every price." : "No prices match."}
        </p>
      ) : (
        result.blocks.map((b) => (
          <details key={b.key} open={searching} className={`${card} !p-0`} data-testid="cmp-brand">
            <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">{b.brand}</span>
              <span className="text-xs text-slate-500">{b.rows.length} {b.rows.length === 1 ? "product" : "products"}</span>
              <span className="ml-auto text-xs tabular-nums text-slate-600 dark:text-slate-300">{b.onHand} on hand · {fmtMoney(b.value)} at best prices</span>
            </summary>
            <div className="overflow-x-auto border-t border-slate-200 dark:border-slate-800">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2 font-medium">Product</th>
                    <th className="px-2 py-2 text-right font-medium">On hand</th>
                    {data.buyers.map((buyer) => <th key={buyer.id} className="px-2 py-2 text-right font-medium">{buyer.name}</th>)}
                    <th className="px-2 py-2 font-medium">Best</th>
                    <th className="px-4 py-2 text-right font-medium">Stock worth</th>
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r) => (
                    <tr key={r.productKey} className="border-t border-slate-100 dark:border-slate-800" data-testid="cmp-row">
                      <td className="px-4 py-2 font-medium text-slate-900 dark:text-slate-50">{r.productName}</td>
                      <td className="px-2 py-2 text-right tabular-nums" data-testid="cmp-onhand">{r.onHand || <span className="text-slate-400">0</span>}</td>
                      {data.buyers.map((buyer) => {
                        const p = r.prices[buyer.id];
                        const best = p != null && r.bestBuyerIds.includes(buyer.id);
                        return (
                          <td key={buyer.id} className="px-2 py-2 text-right tabular-nums" data-testid="cmp-price" data-buyer={buyer.id}>
                            {p == null ? <span className="text-slate-300 dark:text-slate-600">-</span> : <span className={best ? "rounded-md bg-green-100 px-1.5 py-0.5 font-bold text-green-800 dark:bg-green-950 dark:text-green-200" : ""} data-best={best ? "1" : "0"}>{fmtMoney(p)}</span>}
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-xs" data-testid="cmp-best">
                        {r.best ? (
                          <>
                            <span className="font-semibold">{r.bestBuyerIds.map(name).join(" / ")}</span>
                            {r.lead != null && r.lead > 0 && <span className="block text-slate-500">+{fmtMoney(r.lead)} over next</span>}
                            {r.bestBuyerIds.length > 1 && <span className="block text-slate-500">tied</span>}
                          </>
                        ) : (
                          <span className="text-slate-400">no price</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums" data-testid="cmp-worth">{r.best && r.onHand > 0 ? fmtMoney(r.value) : <span className="text-slate-300 dark:text-slate-600">-</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))
      )}
      <p className="text-xs text-slate-500">Prices come from each buyer&apos;s price sheet. Add or change them under <Link href="/dashboard/sales/buyers" className="underline">Buyers</Link>.</p>
    </div>
  );
}
