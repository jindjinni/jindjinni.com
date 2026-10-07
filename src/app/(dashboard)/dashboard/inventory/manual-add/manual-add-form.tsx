"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addStockAction } from "@/app/actions/inventory";

type Product = { id: string; name: string; brand: string; noExpiration: boolean };
type Row = { rid: number; brand: string; productId: string; condition: string; quantity: string; expiry: string; lot: string; unitCost: string; estLow: string; estHigh: string };

const field = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const card = "rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";

// Rows added after the page loads count up from 1000; the first row is always 1, so the server's HTML and the browser agree on the field ids.
let counter = 1000;
const blank = (brand = ""): Row => ({ rid: ++counter, brand, productId: "", condition: "Mint", quantity: "", expiry: "", lot: "", unitCost: "", estLow: "", estHigh: "" });

export function ManualAddForm({ brands, products, conditions }: { brands: string[]; products: Product[]; conditions: string[] }) {
  const [rows, setRows] = useState<Row[]>(() => [{ ...blank(), rid: 1 }]);
  const [note, setNote] = useState("Opening stock");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const set = (rid: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.rid === rid ? { ...r, ...patch } : r)));
  const byId = new Map(products.map((p) => [p.id, p]));

  function save() {
    setMsg(null);
    start(async () => {
      const res = await addStockAction({
        note,
        lines: rows.map((r) => ({
          productId: r.productId,
          condition: r.condition,
          quantity: Number(r.quantity),
          expiry: byId.get(r.productId)?.noExpiration ? null : r.expiry || null,
          lot: r.lot || null,
          unitCost: r.unitCost === "" ? null : Number(r.unitCost),
          estLow: r.estLow === "" ? null : Number(r.estLow),
          estHigh: r.estHigh === "" ? null : Number(r.estHigh),
        })),
      });
      if (res.ok) {
        setMsg({ ok: true, text: res.message ?? "Added." });
        setRows([blank()]);
      } else setMsg({ ok: false, text: res.error ?? "Something went wrong." });
    });
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="space-y-3">
        {rows.map((r, i) => {
          const list = products.filter((p) => !r.brand || p.brand === r.brand);
          const product = byId.get(r.productId);
          return (
            <div key={r.rid} className={card} data-testid="ma-row">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Line {i + 1}</p>
                {rows.length > 1 && (
                  <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.rid !== r.rid))} className="text-xs text-red-700 underline dark:text-red-300">Remove line</button>
                )}
              </div>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label htmlFor={`ma-brand-${r.rid}`} className="text-xs font-medium text-slate-700 dark:text-slate-300">Brand</label>
                  <select id={`ma-brand-${r.rid}`} value={r.brand} onChange={(e) => set(r.rid, { brand: e.target.value, productId: "" })} className={`${field} mt-1`} data-testid="ma-brand">
                    <option value="">All brands</option>
                    {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-1 lg:col-span-2">
                  <label htmlFor={`ma-product-${r.rid}`} className="text-xs font-medium text-slate-700 dark:text-slate-300">Product</label>
                  <select id={`ma-product-${r.rid}`} value={r.productId} onChange={(e) => { const p = byId.get(e.target.value); set(r.rid, { productId: e.target.value, brand: p ? p.brand : r.brand, expiry: p?.noExpiration ? "" : r.expiry }); }} className={`${field} mt-1`} data-testid="ma-product">
                    <option value="">Choose a product…</option>
                    {list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor={`ma-cond-${r.rid}`} className="text-xs font-medium text-slate-700 dark:text-slate-300">Condition</label>
                  <select id={`ma-cond-${r.rid}`} value={r.condition} onChange={(e) => set(r.rid, { condition: e.target.value })} className={`${field} mt-1`} data-testid="ma-cond">
                    {conditions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor={`ma-qty-${r.rid}`} className="text-xs font-medium text-slate-700 dark:text-slate-300">Quantity in stock</label>
                  <input id={`ma-qty-${r.rid}`} inputMode="numeric" value={r.quantity} onChange={(e) => set(r.rid, { quantity: e.target.value.replace(/[^\d]/g, "") })} className={`${field} mt-1`} placeholder="e.g. 50" data-testid="ma-qty" />
                </div>
                <div>
                  <label htmlFor={`ma-exp-${r.rid}`} className="text-xs font-medium text-slate-700 dark:text-slate-300">Expiration date</label>
                  <input id={`ma-exp-${r.rid}`} type="date" value={product?.noExpiration ? "" : r.expiry} disabled={!!product?.noExpiration} onChange={(e) => set(r.rid, { expiry: e.target.value })} className={`${field} mt-1 disabled:opacity-50`} data-testid="ma-exp" />
                  {product?.noExpiration && <p className="mt-1 text-[11px] text-slate-500">This product doesn&apos;t expire.</p>}
                </div>
                <div>
                  <label htmlFor={`ma-lot-${r.rid}`} className="text-xs font-medium text-slate-700 dark:text-slate-300">Lot number (optional)</label>
                  <input id={`ma-lot-${r.rid}`} value={r.lot} onChange={(e) => set(r.rid, { lot: e.target.value })} className={`${field} mt-1`} data-testid="ma-lot" />
                </div>
                <div>
                  <label htmlFor={`ma-cost-${r.rid}`} className="text-xs font-medium text-slate-700 dark:text-slate-300">Cost per unit ($)</label>
                  <input id={`ma-cost-${r.rid}`} inputMode="decimal" value={r.unitCost} onChange={(e) => set(r.rid, { unitCost: e.target.value.replace(/[^\d.]/g, "") })} className={`${field} mt-1`} placeholder="what you paid" data-testid="ma-cost" />
                </div>
                <div>
                  <label htmlFor={`ma-low-${r.rid}`} className="text-xs font-medium text-slate-700 dark:text-slate-300">Estimated price, lowest ($)</label>
                  <input id={`ma-low-${r.rid}`} inputMode="decimal" value={r.estLow} onChange={(e) => set(r.rid, { estLow: e.target.value.replace(/[^\d.]/g, "") })} className={`${field} mt-1`} data-testid="ma-low" />
                </div>
                <div>
                  <label htmlFor={`ma-high-${r.rid}`} className="text-xs font-medium text-slate-700 dark:text-slate-300">Estimated price, highest ($)</label>
                  <input id={`ma-high-${r.rid}`} inputMode="decimal" value={r.estHigh} onChange={(e) => set(r.rid, { estHigh: e.target.value.replace(/[^\d.]/g, "") })} className={`${field} mt-1`} data-testid="ma-high" />
                </div>
              </div>
              {r.quantity && r.unitCost && (
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Cost value of this line: <strong className="tabular-nums">${(Number(r.quantity) * Number(r.unitCost)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>
              )}
            </div>
          );
        })}
      </div>

      <button type="button" onClick={() => setRows((rs) => [...rs, blank(rs[rs.length - 1]?.brand ?? "")])} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-white dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-900" data-testid="ma-add-line">
        + Add another line
      </button>

      <div className={`${card} space-y-3`}>
        <div>
          <label htmlFor="ma-note" className="text-sm font-medium text-slate-900 dark:text-slate-50">Why are you adding this?</label>
          <input id="ma-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className={`${field} mt-1`} data-testid="ma-note" />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Saved with every line in the Stock History.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={pending} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60" data-testid="ma-save">
            {pending ? "Saving…" : `Add to stock (${rows.length} ${rows.length === 1 ? "line" : "lines"})`}
          </button>
          {msg && (
            <span className={`text-sm ${msg.ok ? "text-emerald-800 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`} data-testid={msg.ok ? "ma-message" : "ma-error"}>
              {msg.text} {msg.ok && <Link href="/dashboard/inventory" className="underline">See Live Stock</Link>}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
