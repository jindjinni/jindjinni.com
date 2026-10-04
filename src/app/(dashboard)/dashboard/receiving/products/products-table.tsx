"use client";

import { useMemo, useState } from "react";
import type { CatalogProduct } from "@/lib/receiving-queries";

const PAGE = 200;
const control = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";

export function ProductsTable({ products }: { products: CatalogProduct[] }) {
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState("");
  const [missingNdc, setMissingNdc] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const brands = useMemo(() => Array.from(new Set(products.map((p) => p.brand))), [products]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return products.filter((p) => (!brand || p.brand === brand) && (!missingNdc || !p.ndc) && (!t || `${p.name} ${p.productCode ?? ""} ${p.ndc ?? ""} ${p.brand}`.toLowerCase().includes(t)));
  }, [products, q, brand, missingNdc]);
  const withNdc = products.filter((p) => p.ndc).length;

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="prod-q" className="text-xs font-medium text-slate-600 dark:text-slate-400">Search</label>
          <input id="prod-q" className={`${control} w-full`} placeholder="Product name, code or NDC" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} />
        </div>
        <div>
          <label htmlFor="prod-brand" className="text-xs font-medium text-slate-600 dark:text-slate-400">Brand</label>
          <select id="prod-brand" className={control} value={brand} onChange={(e) => { setBrand(e.target.value); setLimit(PAGE); }}>
            <option value="">All brands</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={missingNdc} onChange={(e) => { setMissingNdc(e.target.checked); setLimit(PAGE); }} />
          Only products with no NDC
        </label>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {rows.length} of {products.length} products · {withNdc} have an NDC · {brands.length} brands
      </p>
      <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Brand</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">NDC</th>
              <th className="px-3 py-2">Expires?</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {rows.slice(0, limit).map((p) => (
              <tr key={p.id}>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-400">{p.brand}</td>
                <td className="px-3 py-2 font-medium">{p.name}</td>
                <td className="whitespace-nowrap px-3 py-2">{p.productCode || "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{p.ndc || <span className="text-slate-400">—</span>}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{p.noExpiration ? "Never expires" : "Yes"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">No products match.</td></tr>}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
          Show {Math.min(PAGE, rows.length - limit)} more
        </button>
      )}
    </div>
  );
}
