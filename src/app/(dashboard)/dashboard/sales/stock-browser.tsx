"use client";

import { useMemo, useState } from "react";
import { normKey } from "@/lib/inventory-rules";
import { availability, type Reserved, type StockMap } from "@/lib/sales-rules";
import { card, field } from "@/components/sales-ui";

export type PickedStock = { productKey: string; condition: string; groupKey: string | null; groupLabel: string | null; quantity: string };

type Row = { key: string; condition: string; groupKey: string | null; label: string; available: number; onHand: number };
type ProductBlock = { productKey: string; name: string; available: number; rows: Row[] };
type BrandBlock = { brand: string; available: number; products: ProductBlock[] };

/**
 * "Browse stock": everything that can be sold right now, closed under its brand (category), then product; opening a product
 * shows each condition and each exact expiration month or month range with what is left to sell. A row adds itself to the
 * invoice with its quantity. The counts already take away what other drafts hold and what this document's lines asked for.
 */
export function StockBrowser({ stock, held, onAdd }: { stock: StockMap; held: Reserved; onAdd: (p: PickedStock) => void }) {
  const [q, setQ] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const needle = q.trim().toLowerCase();

  const brands = useMemo(() => {
    const byBrand = new Map<string, ProductBlock[]>();
    for (const [productKey, p] of Object.entries(stock)) {
      const rows: Row[] = [];
      let total = 0;
      for (const c of Object.values(p.conditions)) {
        const all = availability(stock, held, productKey, c.condition, null);
        if (all.available <= 0) continue;
        total += all.available;
        rows.push({ key: `${productKey}|${normKey(c.condition)}|`, condition: c.condition, groupKey: null, label: "Any dating (earliest first)", available: all.available, onHand: all.onHand });
        for (const g of c.exact) {
          const a = availability(stock, held, productKey, c.condition, g.key);
          if (a.available > 0) rows.push({ key: `${productKey}|${normKey(c.condition)}|${g.key}`, condition: c.condition, groupKey: g.key, label: g.label, available: a.available, onHand: a.onHand });
        }
      }
      if (!rows.length) continue;
      const brand = p.brand || "Other";
      const list = byBrand.get(brand) ?? [];
      list.push({ productKey, name: p.productName, available: total, rows });
      byBrand.set(brand, list);
    }
    const out: BrandBlock[] = [...byBrand.entries()].map(([brand, products]) => ({
      brand,
      available: products.reduce((n, p) => n + p.available, 0),
      products: products.sort((a, b) => a.name.localeCompare(b.name)),
    }));
    return out.sort((a, b) => a.brand.localeCompare(b.brand));
  }, [stock, held]);

  const shown = useMemo(() => {
    if (!needle) return brands;
    return brands
      .map((b) => (b.brand.toLowerCase().includes(needle) ? b : { ...b, products: b.products.filter((p) => p.name.toLowerCase().includes(needle)) }))
      .filter((b) => b.products.length > 0)
      .map((b) => ({ ...b, available: b.products.reduce((n, p) => n + p.available, 0) }));
  }, [brands, needle]);

  return (
    <details className={`${card} group`} data-testid="sb-panel">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2" data-testid="sb-toggle">
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">
          <span aria-hidden className="mr-2 inline-block text-[10px] text-slate-400 transition group-open:rotate-90">▶</span>
          Browse stock
        </span>
        <span className="text-xs text-slate-500">{brands.reduce((n, b) => n + b.available, 0).toLocaleString("en-US")} units you can sell, by brand</span>
      </summary>
      <div className="mt-3 space-y-3">
        <div>
          <label htmlFor="sb-search" className="sr-only">Search stock</label>
          <input id="sb-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a brand or product" className={`${field} sm:w-72`} data-testid="sb-search" autoComplete="off" />
        </div>
        {brands.length === 0 && <p className="text-sm text-slate-500" data-testid="sb-empty">Nothing is in stock to sell right now.</p>}
        {brands.length > 0 && shown.length === 0 && <p className="text-sm text-slate-500">No stock matches that.</p>}
        <div className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {shown.map((b) => (
            <details key={b.brand} open={!!needle} className="group/b" data-testid="sb-brand">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                <span aria-hidden className="text-[10px] text-slate-400 transition group-open/b:rotate-90">▶</span>
                <span className="min-w-[8rem] text-sm font-semibold text-slate-900 dark:text-slate-50" data-testid="sb-brand-name">{b.brand}</span>
                <span className="text-xs text-slate-600 dark:text-slate-300"><strong className="tabular-nums" data-testid="sb-brand-qty">{b.available.toLocaleString("en-US")}</strong> available · {b.products.length} {b.products.length === 1 ? "product" : "products"}</span>
              </summary>
              <div className="border-t border-slate-100 bg-stone-50/60 dark:border-slate-800 dark:bg-slate-950/40">
                {b.products.map((p) => (
                  <details key={p.productKey} open={!!needle} className="group/p border-b border-slate-100 last:border-b-0 dark:border-slate-800/70" data-testid="sb-product">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 py-2 pl-8 pr-3 hover:bg-white dark:hover:bg-slate-900">
                      <span aria-hidden className="text-[10px] text-slate-400 transition group-open/p:rotate-90">▶</span>
                      <span className="min-w-[10rem] flex-1 text-sm font-medium text-slate-900 dark:text-slate-50" data-testid="sb-product-name">{p.name}</span>
                      <span className="text-xs tabular-nums text-slate-600 dark:text-slate-300" data-testid="sb-product-qty">{p.available.toLocaleString("en-US")} available</span>
                    </summary>
                    <div className="overflow-x-auto pb-2 pl-8 pr-3">
                      <table className="w-full min-w-[520px] text-left text-sm">
                        <thead>
                          <tr className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            <th className="py-1 pr-3 font-medium">Condition</th>
                            <th className="py-1 pr-3 font-medium">Expiration</th>
                            <th className="py-1 pr-3 text-right font-medium">Available</th>
                            <th className="py-1 pr-3 font-medium">Quantity</th>
                            <th className="py-1" />
                          </tr>
                        </thead>
                        <tbody>
                          {p.rows.map((r) => (
                            <tr key={r.key} className="border-t border-slate-200 align-middle dark:border-slate-800" data-testid="sb-row">
                              <td className="py-1.5 pr-3">{r.condition}</td>
                              <td className={`py-1.5 pr-3 ${r.groupKey ? "font-medium" : "text-slate-500"}`} data-testid="sb-row-exp">{r.label}</td>
                              <td className="py-1.5 pr-3 text-right font-semibold tabular-nums" data-testid="sb-row-avail">{r.available}</td>
                              <td className="py-1.5 pr-3">
                                <label htmlFor={`sb-qty-${r.key}`} className="sr-only">Quantity of {p.name}, {r.condition}, {r.label}</label>
                                <input
                                  id={`sb-qty-${r.key}`}
                                  inputMode="numeric"
                                  value={qty[r.key] ?? ""}
                                  placeholder={String(r.available)}
                                  onChange={(e) => setQty((m) => ({ ...m, [r.key]: e.target.value.replace(/[^\d]/g, "") }))}
                                  className={`${field} !w-24`}
                                  data-testid="sb-qty"
                                />
                              </td>
                              <td className="py-1.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const n = Math.min(Number(qty[r.key]) || r.available, r.available);
                                    onAdd({ productKey: p.productKey, condition: r.condition, groupKey: r.groupKey, groupLabel: r.groupKey ? r.label : null, quantity: String(n) });
                                    setQty((m) => ({ ...m, [r.key]: "" }));
                                  }}
                                  className="rounded-lg border border-emerald-700 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 dark:border-emerald-600 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                                  data-testid="sb-add"
                                >
                                  Add
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ))}
              </div>
            </details>
          ))}
        </div>
        <p className="text-xs text-slate-500">Leave the quantity empty to take everything shown on that row. Units other drafts and this document&apos;s other items are already holding are not counted.</p>
      </div>
    </details>
  );
}
