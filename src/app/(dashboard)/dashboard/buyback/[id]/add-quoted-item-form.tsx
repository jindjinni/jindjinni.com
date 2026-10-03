"use client";

import { useActionState } from "react";
import { addQuotedItem } from "@/app/actions/buyback";

type Product = { id: string; name: string };

export function AddQuotedItemForm({ orderId, products }: { orderId: string; products: Product[] }) {
  const action = addQuotedItem.bind(null, orderId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form
      action={formAction}
      className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-slate-300 p-4 dark:border-slate-700"
    >
      <label className="flex flex-1 min-w-[12rem] flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">What's being quoted</span>
        <input
          name="lineLabel"
          required
          placeholder="e.g. Omnipod 5 5pk (G6/G7) - 3"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Catalog product (optional)</span>
        <select
          name="productId"
          defaultValue=""
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
        >
          <option value="">Not in catalog yet</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Code / variant</span>
        <input
          name="productCodeVariant"
          className="w-32 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Qty quoted</span>
        <input
          name="quotedQuantity"
          type="number"
          min="1"
          step="1"
          required
          className="w-24 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Unit price</span>
        <input
          name="quotedUnitPrice"
          type="number"
          min="0"
          step="0.01"
          required
          className="w-28 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200"
      >
        {pending ? "Adding..." : "Add quoted line"}
      </button>
      {state?.error && (
        <p className="w-full text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
    </form>
  );
}
