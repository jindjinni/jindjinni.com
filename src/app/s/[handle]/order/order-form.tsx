"use client";

import { useActionState, useMemo, useState } from "react";
import { placeOrderAction } from "@/app/actions/storefront-buyers";
import { AuthError, authBtnPrimary } from "@/components/auth/auth-ui";

export type FormItem = { id: string; name: string; brand: string; condition: string; price: number; inStock: boolean };

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** The pharmacy's price list with a quantity box on every in-stock line, a running total, and Place order. Prices shown are for display; the server prices the order. */
export function OrderForm({ handle, items, formKey }: { handle: string; items: FormItem[]; formKey: string }) {
  const [state, action, pending] = useActionState(placeOrderAction.bind(null, handle), undefined);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => items.filter((i) => !needle || `${i.name} ${i.brand} ${i.condition}`.toLowerCase().includes(needle)), [items, needle]);
  const total = items.reduce((n, i) => n + (i.inStock ? (Number.parseInt(qty[i.id] ?? "", 10) || 0) * i.price : 0), 0);
  const count = items.reduce((n, i) => n + (i.inStock && (Number.parseInt(qty[i.id] ?? "", 10) || 0) > 0 ? 1 : 0), 0);
  const short = new Set(state?.unavailable ?? []);
  const input = "w-24 rounded-lg border border-line bg-white px-2 py-1.5 text-right text-base text-ink";
  return (
    <form action={action} className="mt-6" data-testid="ord-form">
      <input type="hidden" name="key" value={formKey} />
      <label htmlFor="ord-search" className="sr-only">Search products</label>
      <input id="ord-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" className="w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-ink" data-testid="ord-search" />
      <ul className="mt-4 divide-y divide-line rounded-2xl border border-line" data-testid="ord-list">
        {shown.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="ord-row" data-item={i.id} data-stock={i.inStock ? "in" : "out"}>
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-ink">{i.name}</p>
              <p className="text-sm text-muted">{i.condition} · {money(i.price)} each · <span className={i.inStock ? "font-semibold text-emerald-700" : "font-semibold text-red-700"} data-testid="ord-stock">{i.inStock ? "In stock" : "Out of stock"}</span>{short.has(i.id) ? " (just sold out)" : ""}</p>
            </div>
            {i.inStock ? (
              <input name={`q_${i.id}`} type="number" inputMode="numeric" min={0} max={100000} step={1} value={qty[i.id] ?? ""} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} aria-label={`Quantity of ${i.name}`} placeholder="0" className={input} data-testid="ord-qty" />
            ) : (
              <span className="w-24 text-right text-sm text-muted">Unavailable</span>
            )}
          </li>
        ))}
        {shown.length === 0 && <li className="px-4 py-6 text-sm text-muted" data-testid="ord-none">{items.length === 0 ? "Your price list is empty right now. Please contact us." : "No product matches that."}</li>}
      </ul>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-ink">Your PO number <span className="font-normal text-muted">(optional)</span>
          <input name="poNumber" maxLength={60} className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-ink" data-testid="ord-po" />
        </label>
        <label className="text-sm font-semibold text-ink sm:col-span-2">Notes <span className="font-normal text-muted">(optional)</span>
          <textarea name="notes" rows={2} maxLength={500} className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-ink" data-testid="ord-notes" />
        </label>
      </div>
      <div className="sticky bottom-0 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-white py-4">
        <p className="text-base text-ink" data-testid="ord-total"><span className="font-bold">{money(total)}</span> <span className="text-muted">· {count} {count === 1 ? "item" : "items"}</span></p>
        <button type="submit" disabled={pending || count === 0} className={`${authBtnPrimary} !w-auto px-8`} data-testid="ord-submit">{pending ? "Placing order..." : "Place order"}</button>
      </div>
      {state?.error && <AuthError>{state.error}</AuthError>}
    </form>
  );
}
