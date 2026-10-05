"use client";

import { useActionState } from "react";
import { createProductMultiplier, type ActionState } from "@/app/actions/purchasing";

const inputClass =
  "rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

export function AddMultiplierForm({
  products,
  ranges,
}: {
  products: { id: string; name: string }[];
  ranges: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createProductMultiplier, undefined);

  return (
    <form action={action} className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white shadow-sm p-6 dark:border-slate-800 dark:bg-slate-900">
      <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-300">Product</span>
        <select name="productId" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            Choose a product…
          </option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-[10rem] flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-300">Month Range</span>
        <select name="expirationRangeId" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            Choose a range…
          </option>
          {ranges.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-300">Price Multiplier (×)</span>
        <input name="multiplier" type="number" step="0.01" min="0" defaultValue="1" required className={`w-28 ${inputClass}`} />
      </label>
      <button type="submit" disabled={pending} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60">
        {pending ? "Adding…" : "+ Add Multiplier"}
      </button>
      {state?.error && <p className="w-full text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      <p className="w-full text-xs text-slate-400">
        Adding one for a product/month range pair that already has one updates it instead of creating a duplicate.
      </p>
    </form>
  );
}
