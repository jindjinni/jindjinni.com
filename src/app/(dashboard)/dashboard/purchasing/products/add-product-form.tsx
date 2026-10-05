"use client";

import { useActionState } from "react";
import { createPurchasingProduct } from "@/app/actions/purchasing";

const inputClass =
  "rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

type Category = { id: string; name: string };

export function AddProductForm({ categories }: { categories: Category[] }) {
  const [state, action, pending] = useActionState(createPurchasingProduct, undefined);

  return (
    <form action={action} className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm p-6 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Add product</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-slate-600 dark:text-slate-400">Product name</span>
          <input name="name" required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Category</span>
          <select name="categoryId" className={inputClass} defaultValue="">
            <option value="">— None —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Product code</span>
          <input name="productCode" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">NDC</span>
          <input name="ndc" placeholder="e.g. 53885-0245-50" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Standard price ($)</span>
          <input name="standardPrice" type="number" step="0.01" min="0" defaultValue={0} className={inputClass} />
        </label>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {pending ? "Adding..." : "Add product"}
      </button>
      {state?.error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </form>
  );
}
