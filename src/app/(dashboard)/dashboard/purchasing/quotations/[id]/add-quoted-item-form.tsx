"use client";

import { useActionState } from "react";
import { addPurchasingQuotedItem } from "@/app/actions/purchasing";

type ActionState = { error?: string } | undefined;

const inputClass =
  "rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

type Product = { id: string; name: string; standardPrice: number };
type Condition = { id: string; name: string };
type Range = { id: string; label: string };

export function AddQuotedItemForm({
  quotationId,
  products,
  conditions,
  ranges,
  canOverridePrice,
}: {
  quotationId: string;
  products: Product[];
  conditions: Condition[];
  ranges: Range[];
  canOverridePrice: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addPurchasingQuotedItem.bind(null, quotationId),
    undefined,
  );

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Product</span>
        <select name="productId" required className={`min-w-[12rem] ${inputClass}`}>
          <option value="" disabled>
            Choose a product
          </option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Condition</span>
        <select name="conditionId" className={inputClass} defaultValue="">
          <option value="">— None —</option>
          {conditions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Expiry</span>
        <select name="expirationRangeId" className={inputClass} defaultValue="">
          <option value="">— None —</option>
          {ranges.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Qty</span>
        <input name="quantity" type="number" min="1" step="1" required defaultValue={1} className={`w-20 ${inputClass}`} />
      </label>
      {canOverridePrice && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Override unit price ($)</span>
          <input name="overrideUnitPrice" type="number" step="0.01" min="0" placeholder="auto" className={`w-32 ${inputClass}`} />
        </label>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {pending ? "Adding..." : "Add line"}
      </button>
      {state?.error && <p className="w-full text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </form>
  );
}
