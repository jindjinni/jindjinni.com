"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { commitStockImportAction, previewStockImportAction, type StockPreview } from "@/app/actions/inventory-import";
import { rangeText } from "@/lib/expiry-range-rules";
import { FIELD_LABEL, STOCK_FIELDS, type StockColumnMap, type StockField } from "@/lib/inventory-import-rules";

type Product = { id: string; name: string; brand: string; noExpiration: boolean };
type Ok = Extract<StockPreview, { ok: true }>;

const field = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const card = "rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";
const money = (n: number | null) => (n == null ? "" : `$${n.toFixed(2)}`);

export function ImportForm({ products, conditions, template }: { products: Product[]; conditions: string[]; template: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [map, setMap] = useState<StockColumnMap | null>(null);
  const [defaultCondition, setDefaultCondition] = useState("Mint");
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [leaveOut, setLeaveOut] = useState(false);
  const [preview, setPreview] = useState<Ok | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function body(f: File, m: StockColumnMap | null, dc: string, mt: Record<string, string>, lo = false) {
    const fd = new FormData();
    fd.set("file", f);
    fd.set("defaultCondition", dc);
    fd.set("matches", JSON.stringify(mt));
    if (m) for (const k of STOCK_FIELDS) fd.set(`col_${k}`, m[k] ?? "");
    if (lo) fd.set("leaveOut", "1");
    return fd;
  }

  function read(f: File, m: StockColumnMap | null, dc: string, mt: Record<string, string>) {
    setError(null);
    start(async () => {
      const res = await previewStockImportAction(body(f, m, dc, mt));
      if (res.ok) {
        setPreview(res);
        setMap(res.map);
      } else {
        setPreview(null);
        setError(res.error);
      }
    });
  }

  function choose(f: File | null) {
    setDone(null);
    setPreview(null);
    setMap(null);
    setMatches({});
    setLeaveOut(false);
    setFile(f);
    if (f) read(f, null, defaultCondition, {});
  }

  function add() {
    if (!file) return;
    setError(null);
    start(async () => {
      const res = await commitStockImportAction(body(file, map, defaultCondition, matches, leaveOut));
      if (res.ok) {
        setDone(res.message ?? "Added.");
        setPreview(null);
        setFile(null);
        setMap(null);
        setMatches({});
        setLeaveOut(false);
        // the page re-renders with the new "Recent imports" list; clear the picker too
        const el = document.getElementById("ii-file") as HTMLInputElement | null;
        if (el) el.value = "";
      } else setError(res.error ?? "Something went wrong.");
    });
  }

  const bad = preview ? preview.counts.match + preview.counts.problem : 0;
  const canAdd = !!preview && preview.counts.ok > 0 && (bad === 0 || leaveOut) && !preview.alreadyImportedAt && !pending;

  return (
    <div className="mt-5 space-y-4">
      {done && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" role="status" data-testid="ii-done">
          {done} <Link href="/dashboard/inventory" className="font-medium underline">See Live Stock</Link>
        </div>
      )}

      <div className={card}>
        <label htmlFor="ii-file" className="text-sm font-medium text-slate-900 dark:text-slate-50">Your stock file</label>
        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
          Excel (.xlsx) or CSV, up to 5MB. One line per product, condition and expiration date. The product names should match your catalog.{" "}
          <a href={template} download="stock-import-template.csv" className="font-medium underline" data-testid="ii-template">Download a blank template</a>
        </p>
        <input
          id="ii-file"
          type="file"
          accept=".csv,.txt,.xlsx,.xls"
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
          className="mt-3 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700 dark:file:bg-slate-100 dark:file:text-slate-900"
          data-testid="ii-file"
        />
        {pending && !preview && <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">Reading your file…</p>}
      </div>

      {error && <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200" role="alert" data-testid="ii-error">{error}</p>}

      {preview && file && (
        <>
          {preview.alreadyImportedAt && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200" data-testid="ii-already">
              This exact file was already imported on {new Date(preview.alreadyImportedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}. Adding it again would double your stock, so it can&apos;t be added. Undo that import first (Recent imports, below), or choose a different file.
            </p>
          )}

          <div className={card} data-testid="ii-columns">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Which column is which</h2>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">I matched your column headings. Change any that look wrong; the lines below update.</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {STOCK_FIELDS.map((k: StockField) => (
                <div key={k}>
                  <label htmlFor={`ii-col-${k}`} className="text-xs font-medium text-slate-700 dark:text-slate-300">{FIELD_LABEL[k]}{k === "product" || k === "quantity" ? " (needed)" : ""}</label>
                  <select
                    id={`ii-col-${k}`}
                    value={(map ?? preview.map)[k] ?? ""}
                    onChange={(e) => { const m = { ...(map ?? preview.map), [k]: e.target.value || null } as StockColumnMap; setMap(m); read(file, m, defaultCondition, matches); }}
                    className={`${field} mt-1`}
                    data-testid={`ii-col-${k}`}
                  >
                    <option value="">Not in my file</option>
                    {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
              <div>
                <label htmlFor="ii-default-cond" className="text-xs font-medium text-slate-700 dark:text-slate-300">Condition when the file doesn&apos;t say</label>
                <select
                  id="ii-default-cond"
                  value={defaultCondition}
                  onChange={(e) => { setDefaultCondition(e.target.value); read(file, map, e.target.value, matches); }}
                  className={`${field} mt-1`}
                  data-testid="ii-default-cond"
                >
                  {conditions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className={card}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">What will be added</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400" data-testid="ii-counts">
                {preview.counts.ok} ready ({preview.counts.units.toLocaleString("en-US")} units)
                {preview.counts.match > 0 && <> &middot; {preview.counts.match} to match</>}
                {preview.counts.problem > 0 && <> &middot; {preview.counts.problem} to fix</>}
                {preview.counts.blank > 0 && <> &middot; {preview.counts.blank} blank {preview.counts.blank === 1 ? "line" : "lines"} skipped</>}
              </p>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm" data-testid="ii-table">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                    <th scope="col" className="py-2 pr-3 font-medium">Row</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Product</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Condition</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Qty</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Expires</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Lot</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Cost</th>
                    <th scope="col" className="py-2 font-medium">Check</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {preview.rows.map((r) => (
                    <tr key={r.rowNo} className="align-top" data-testid={`ii-row-${r.rowNo}`} data-status={r.status}>
                      <td className="py-2 pr-3 tabular-nums text-slate-500">{r.rowNo}</td>
                      <td className="py-2 pr-3">
                        {r.status === "match" || !r.productId ? (
                          <div>
                            <p className="text-slate-900 dark:text-slate-50">{r.rawProduct || "(blank)"}</p>
                            {r.status === "match" && (
                              <>
                                <label htmlFor={`ii-match-${r.rowNo}`} className="sr-only">Choose the product for row {r.rowNo}</label>
                                <select
                                  id={`ii-match-${r.rowNo}`}
                                  value={matches[String(r.rowNo)] ?? ""}
                                  onChange={(e) => { const mt = { ...matches }; if (e.target.value) mt[String(r.rowNo)] = e.target.value; else delete mt[String(r.rowNo)]; setMatches(mt); read(file, map, defaultCondition, mt); }}
                                  className={`${field} mt-1`}
                                  data-testid={`ii-match-${r.rowNo}`}
                                >
                                  <option value="">Choose the product…</option>
                                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                              </>
                            )}
                          </div>
                        ) : (
                          <p className="text-slate-900 dark:text-slate-50">{r.productName}</p>
                        )}
                      </td>
                      <td className="py-2 pr-3">{r.condition}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.quantity ?? ""}</td>
                      <td className="py-2 pr-3 tabular-nums">{r.noExpiration ? "None" : rangeText(r.expiry, r.expiryEnd) ?? r.expiry ?? ""}</td>
                      <td className="py-2 pr-3">{r.lot ?? ""}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{money(r.unitCost)}</td>
                      <td className="py-2">
                        {r.status === "ok" && r.notes.length === 0 && <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">Ready</span>}
                        {r.status === "ok" && r.notes.length > 0 && <span className="text-xs text-amber-800 dark:text-amber-300">Ready. {r.notes.join(" ")}</span>}
                        {r.status === "match" && <span className="text-xs font-medium text-amber-800 dark:text-amber-300">Not in your catalog by that name. Choose one.</span>}
                        {r.status === "problem" && <span className="text-xs font-medium text-red-700 dark:text-red-300">{r.problems.join(" ")}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
            <div className="text-sm">
              {bad > 0 && (
                <label className="flex items-start gap-2 text-slate-800 dark:text-slate-200">
                  <input type="checkbox" checked={leaveOut} onChange={(e) => setLeaveOut(e.target.checked)} className="mt-0.5 h-4 w-4" data-testid="ii-leave-out" />
                  <span>Leave out the {bad} {bad === 1 ? "line" : "lines"} that need attention and add the rest</span>
                </label>
              )}
              {bad === 0 && preview.counts.ok > 0 && <p className="text-slate-700 dark:text-slate-300">Every line is ready. All of them are added together, or none are.</p>}
            </div>
            <button
              type="button"
              disabled={!canAdd}
              onClick={add}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
              data-testid="ii-add"
            >
              {pending ? "Working…" : `Add ${preview.counts.units.toLocaleString("en-US")} ${preview.counts.units === 1 ? "unit" : "units"} to stock`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
