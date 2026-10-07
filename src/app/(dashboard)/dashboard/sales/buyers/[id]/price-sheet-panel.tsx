"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { deletePriceItemAction, importPriceSheetAction, matchPriceItemAction, previewPriceSheetAction, removePriceSheetAction, updatePriceItemAction, type SheetPreview } from "@/app/actions/sales";
import { card, field, fmtDay } from "@/components/sales-ui";

export type PriceRow = { id: string; rawName: string; productId: string | null; productName: string; brand: string; condition: string; price: number };
type Product = { id: string; name: string; brand: string };

export function PriceSheetPanel({ buyerId, canWrite, sheet, rows, products }: { buyerId: string; canWrite: boolean; sheet: { fileName: string; uploadedAt: string } | null; rows: PriceRow[]; products: Product[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Extract<SheetPreview, { ok: true }> | null>(null);
  const [cols, setCols] = useState({ product: "", price: "", condition: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [search, setSearch] = useState("");

  const unmatched = rows.filter((r) => !r.productId);
  const matched = rows.filter((r) => r.productId);
  const needle = search.trim().toLowerCase();
  const matchedShown = matched.filter((r) => !needle || `${r.rawName} ${r.productName}`.toLowerCase().includes(needle));
  const byBrand = new Map<string, PriceRow[]>();
  for (const r of matchedShown) byBrand.set(r.brand || "Other", [...(byBrand.get(r.brand || "Other") ?? []), r]);
  const brands = [...byBrand.keys()].sort((a, b) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));

  function read() {
    const f = fileRef.current?.files?.[0];
    if (!f) return setMsg({ ok: false, text: "Choose the buyer's price sheet first." });
    setMsg(null);
    start(async () => {
      const fd = new FormData();
      fd.set("file", f);
      const res = await previewPriceSheetAction(fd);
      if (!res.ok) return setMsg({ ok: false, text: res.error });
      setPreview(res);
      setCols({ product: res.guess.product ?? "", price: res.guess.price ?? "", condition: res.guess.condition ?? "" });
    });
  }

  function load() {
    const f = fileRef.current?.files?.[0];
    if (!f || !preview) return;
    setMsg(null);
    start(async () => {
      const fd = new FormData();
      fd.set("file", f);
      fd.set("buyerId", buyerId);
      fd.set("productCol", cols.product);
      fd.set("priceCol", cols.price);
      fd.set("conditionCol", cols.condition);
      const res = await importPriceSheetAction(fd);
      if (!res.ok) return setMsg({ ok: false, text: res.error });
      setMsg({ ok: true, text: res.message ?? "Loaded." });
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setMsg({ ok: false, text: r.error ?? "Something went wrong." });
      router.refresh();
    });

  return (
    <section className="space-y-3" data-testid="price-sheet">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Price sheet</h2>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          Upload what this buyer pays for each product (Excel or CSV). I read the product names and prices, match them to your products, and the Price Comparison tab uses them. Loading a new sheet replaces the old prices.
        </p>
      </div>

      {sheet && (
        <div className={`${card} flex flex-wrap items-center gap-3 text-sm`} data-testid="price-sheet-current">
          <span className="font-medium text-slate-900 dark:text-slate-50">{sheet.fileName}</span>
          <span className="text-xs text-slate-500">loaded {fmtDay(sheet.uploadedAt)} · {rows.length} prices</span>
          <a href={`/api/sales/buyers/${buyerId}/price-sheet`} className="ml-auto text-xs font-medium text-emerald-800 underline dark:text-emerald-300" data-testid="price-sheet-download">Download the original file</a>
          {canWrite && (
            <button type="button" disabled={pending} onClick={() => { if (confirm("Remove this price sheet and its prices?")) act(() => removePriceSheetAction(buyerId)); }} className="text-xs text-red-700 underline dark:text-red-300" data-testid="price-sheet-remove">Remove</button>
          )}
        </div>
      )}

      {canWrite && (
        <div className={`${card} space-y-3`}>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="ps-file" className="sr-only">Choose the price sheet file</label>
            <input id="ps-file" ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv" onChange={() => { setPreview(null); setMsg(null); }} className="text-xs text-slate-600 dark:text-slate-400" data-testid="ps-file" />
            <button type="button" onClick={read} disabled={pending} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-50 dark:text-slate-900" data-testid="ps-read">{pending && !preview ? "Reading…" : sheet ? "Read a new sheet" : "Read the sheet"}</button>
          </div>
          {preview && (
            <div className="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800" data-testid="ps-columns">
              <p className="text-sm text-slate-700 dark:text-slate-300">I found <strong>{preview.rowCount}</strong> rows. Check which column is which:</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="ps-col-product" className="text-xs font-medium text-slate-700 dark:text-slate-300">Product names</label>
                  <select id="ps-col-product" value={cols.product} onChange={(e) => setCols((c) => ({ ...c, product: e.target.value }))} className={`${field} mt-1`} data-testid="ps-col-product">
                    <option value="">Choose…</option>
                    {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="ps-col-price" className="text-xs font-medium text-slate-700 dark:text-slate-300">Price this buyer pays</label>
                  <select id="ps-col-price" value={cols.price} onChange={(e) => setCols((c) => ({ ...c, price: e.target.value }))} className={`${field} mt-1`} data-testid="ps-col-price">
                    <option value="">Choose…</option>
                    {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="ps-col-condition" className="text-xs font-medium text-slate-700 dark:text-slate-300">Condition (optional)</label>
                  <select id="ps-col-condition" value={cols.condition} onChange={(e) => setCols((c) => ({ ...c, condition: e.target.value }))} className={`${field} mt-1`} data-testid="ps-col-condition">
                    <option value="">None: all prices are for Mint</option>
                    {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200 text-xs dark:border-slate-800">
                <table className="w-full">
                  <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800"><tr>{preview.headers.map((h) => <th key={h} className="px-2 py-1 font-medium">{h}</th>)}</tr></thead>
                  <tbody>{preview.sample.map((r, i) => <tr key={i} className="border-t border-slate-100 dark:border-slate-800">{preview.headers.map((h) => <td key={h} className="px-2 py-1">{r[h]}</td>)}</tr>)}</tbody>
                </table>
              </div>
              <button type="button" onClick={load} disabled={pending || !cols.product || !cols.price} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60" data-testid="ps-load">{pending ? "Loading…" : "Load these prices"}</button>
            </div>
          )}
          {msg && <p className={`text-sm ${msg.ok ? "text-emerald-800 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`} data-testid={msg.ok ? "ps-message" : "ps-error"}>{msg.text}</p>}
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-2">
          {unmatched.length > 0 && (
            <details open className={`${card} !p-0`} data-testid="ps-unmatched">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-50">
                Needs a match <span className="ml-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">{unmatched.length}</span>
                <span className="ml-2 text-xs font-normal text-slate-500">I couldn&apos;t tell which of your products these are.</span>
              </summary>
              <ul className="divide-y divide-slate-100 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {unmatched.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm" data-testid="ps-unmatched-row">
                    <span className="min-w-0 flex-1 basis-48 truncate" title={r.rawName}>{r.rawName}</span>
                    <span className="tabular-nums text-slate-600 dark:text-slate-300">${r.price.toFixed(2)}</span>
                    {canWrite && (
                      <>
                        <label htmlFor={`ps-match-${r.id}`} className="sr-only">Match {r.rawName} to a product</label>
                        <select id={`ps-match-${r.id}`} defaultValue="" onChange={(e) => e.target.value && act(() => matchPriceItemAction(r.id, e.target.value))} className={`${field} !w-64`} data-testid="ps-match">
                          <option value="">Match to a product…</option>
                          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <button type="button" onClick={() => act(() => deletePriceItemAction(r.id))} className="text-xs text-red-700 underline dark:text-red-300" data-testid="ps-delete">Skip</button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {matched.length > 0 && (
            <>
              <label htmlFor="ps-search" className="sr-only">Search this buyer&apos;s prices</label>
              <input id="ps-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search this buyer's prices" className={`${field} max-w-xs`} data-testid="ps-search" />
              {brands.map((b) => (
                <details key={b} open={!!needle} className={`${card} !p-0`} data-testid="ps-brand">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-50">
                    {b} <span className="ml-1 text-xs font-normal text-slate-500">{byBrand.get(b)!.length} prices</span>
                  </summary>
                  <ul className="divide-y divide-slate-100 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                    {byBrand.get(b)!.map((r) => (
                      <PriceLine key={r.id} row={r} canWrite={canWrite} onSave={(price) => act(() => updatePriceItemAction(r.id, price))} onDelete={() => act(() => deletePriceItemAction(r.id))} onRematch={() => act(() => matchPriceItemAction(r.id, null))} />
                    ))}
                  </ul>
                </details>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function PriceLine({ row, canWrite, onSave, onDelete, onRematch }: { row: PriceRow; canWrite: boolean; onSave: (price: number) => void; onDelete: () => void; onRematch: () => void }) {
  const [v, setV] = useState(row.price.toFixed(2));
  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm" data-testid="ps-row">
      <span className="min-w-0 flex-1 basis-56">
        <span className="block truncate font-medium text-slate-900 dark:text-slate-50">{row.productName}</span>
        {row.rawName !== row.productName && <span className="block truncate text-xs text-slate-500" title={row.rawName}>Sheet says: {row.rawName}</span>}
      </span>
      <span className="text-xs text-slate-500">{row.condition}</span>
      {canWrite ? (
        <>
          <label htmlFor={`ps-price-${row.id}`} className="sr-only">Price for {row.productName}</label>
          <span className="flex items-center gap-1">$<input id={`ps-price-${row.id}`} inputMode="decimal" value={v} onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ""))} onBlur={() => Number(v) !== row.price && v !== "" && onSave(Number(v))} className={`${field} !w-24 text-right tabular-nums`} data-testid="ps-price" /></span>
          <button type="button" onClick={onRematch} className="text-xs text-slate-600 underline dark:text-slate-300" data-testid="ps-unmatch">Change match</button>
          <button type="button" onClick={onDelete} className="text-xs text-red-700 underline dark:text-red-300">Remove</button>
        </>
      ) : (
        <span className="tabular-nums">${row.price.toFixed(2)}</span>
      )}
    </li>
  );
}
