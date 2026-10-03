"use client";

import { useActionState } from "react";
import { receiveStock } from "@/app/actions/inventory";

type Option = { id: string; name: string };

export function ReceiveStockForm({
  products,
  conditions,
}: {
  products: Option[];
  conditions: Option[];
}) {
  const [state, action, pending] = useActionState(receiveStock, undefined);

  return (
    <form
      action={action}
      className="mt-6 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Product</span>
          <select
            name="productId"
            required
            defaultValue=""
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
          >
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
          <span className="font-medium text-slate-700 dark:text-slate-300">Condition</span>
          <select
            name="conditionId"
            required
            defaultValue=""
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="" disabled>
              Choose a condition
            </option>
            {conditions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">
            Quantity received
          </span>
          <input
            name="quantity"
            type="number"
            min="1"
            step="1"
            required
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">
            Expiration date (optional)
          </span>
          <input
            name="expirationDate"
            type="date"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
      </div>

      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || products.length === 0 || conditions.length === 0}
        className="self-start rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {pending ? "Posting..." : "Post receipt to inventory"}
      </button>
    </form>
  );
}
