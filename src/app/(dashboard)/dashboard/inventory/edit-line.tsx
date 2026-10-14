"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { correctStockAction } from "@/app/actions/inventory";
import { ExpiryField } from "@/components/expiry-field";
import { toInputText } from "@/lib/expiry-range-rules";
import { card, field, primaryBtn } from "@/components/sales-ui";
import type { CatalogChoice } from "./fix-name";

export type LotView = { lot: string | null; expiry: string | null; expiryEnd: string | null; quantity: number; cost: number | null };

/**
 * "Edit" on a stock line in Live Stock (reconciliation): each lot of the line can be corrected -- quantity, condition, expiration or
 * month range, lot number, cost per unit -- and the whole line can be moved to the right product. A reason is required. The server writes
 * adjustment rows to the movements history; Receiving's own records are never changed.
 */
export function EditLine({ productKey, productName, condition, lots, conditions, catalog, onDone }: { productKey: string; productName: string; condition: string; lots: LotView[]; conditions: string[]; catalog: CatalogChoice[]; onDone?: () => void }) {
  const router = useRouter();
  const options = conditions.includes(condition) ? conditions : [condition, ...conditions];
  const [rows, setRows] = useState(() => lots.map((l) => ({ condition, expiry: toInputText(l.expiry, l.expiryEnd), lot: l.lot ?? "", quantity: String(l.quantity), cost: l.cost == null ? "" : String(l.cost) })));
  const [product, setProduct] = useState(productName);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const chosen = catalog.find((c) => c.name.toLowerCase() === product.trim().toLowerCase());
  const productChanged = product.trim().toLowerCase() !== productName.trim().toLowerCase();

  function save() {
    setMsg(null);
    start(async () => {
      const r = await correctStockAction({
        productKey,
        productId: productChanged ? chosen?.id ?? null : null,
        name: productChanged && !chosen ? product : null,
        reason,
        edits: rows.map((row, i) => ({
          from: { condition, expiry: lots[i].expiry, expiryEnd: lots[i].expiryEnd, lot: lots[i].lot },
          to: { condition: row.condition, expiry: row.expiry, lot: row.lot, quantity: Number(row.quantity), unitCost: row.cost.trim() === "" ? null : row.cost },
        })),
      });
      if (r.error) return setMsg(r.error);
      onDone?.();
      router.refresh();
    });
  }

  return (
    <div className={`${card} space-y-3`} data-testid="el-panel">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`el-p-${productKey}-${condition}`} className="text-xs font-medium text-slate-700 dark:text-slate-300">Product</label>
          <input id={`el-p-${productKey}-${condition}`} list={`el-list-${productKey}`} value={product} onChange={(e) => setProduct(e.target.value)} className={`${field} mt-1`} data-testid="el-product" autoComplete="off" />
          <datalist id={`el-list-${productKey}`}>{catalog.map((c) => <option key={c.id} value={c.name} />)}</datalist>
          {productChanged && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400" data-testid="el-product-note">{chosen ? `These lots will move to ${chosen.name}.` : "Not on your product list: it will be saved under the name as typed."}</p>}
        </div>
        <div>
          <label htmlFor={`el-r-${productKey}-${condition}`} className="text-xs font-medium text-slate-700 dark:text-slate-300">Why are you correcting this? (required)</label>
          <input id={`el-r-${productKey}-${condition}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Recount, graded wrong, import mistake…" className={`${field} mt-1`} data-testid="el-reason" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm" data-testid="el-rows">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <th className="py-1 pr-3 font-medium">Condition</th>
              <th className="py-1 pr-3 font-medium">Expiration</th>
              <th className="py-1 pr-3 font-medium">Lot</th>
              <th className="py-1 pr-3 font-medium">Quantity</th>
              <th className="py-1 font-medium">Cost per unit ($)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-200 align-top dark:border-slate-800" data-testid="el-row">
                <td className="py-2 pr-3">
                  <select aria-label="Condition" value={r.condition} onChange={(e) => set(i, { condition: e.target.value })} className={field} data-testid="el-cond">
                    {options.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td className="py-2 pr-3"><ExpiryField id={`el-x-${productKey}-${condition}-${i}`} value={r.expiry} onChange={(t) => set(i, { expiry: t })} testid="el-expiry" className="min-w-[14rem]" /></td>
                <td className="py-2 pr-3"><input aria-label="Lot number" value={r.lot} onChange={(e) => set(i, { lot: e.target.value })} className={`${field} !w-36`} data-testid="el-lot" /></td>
                <td className="py-2 pr-3"><input aria-label="Quantity" inputMode="numeric" value={r.quantity} onChange={(e) => set(i, { quantity: e.target.value.replace(/[^\d]/g, "") })} className={`${field} !w-24 tabular-nums`} data-testid="el-qty" /></td>
                <td className="py-2"><input aria-label="Cost per unit" inputMode="decimal" value={r.cost} onChange={(e) => set(i, { cost: e.target.value.replace(/[^\d.]/g, "") })} placeholder="unknown" className={`${field} !w-28 tabular-nums`} data-testid="el-cost" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Receiving&apos;s own records are never changed. The correction is added to the movements history so anyone can see what it was and what it became.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending} onClick={save} className={primaryBtn} data-testid="el-save">{pending ? "Saving…" : "Save correction"}</button>
        {msg && <span className="text-sm text-red-700 dark:text-red-300" data-testid="el-error">{msg}</span>}
      </div>
    </div>
  );
}
