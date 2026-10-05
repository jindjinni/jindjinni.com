"use client";

import { useActionState } from "react";
import { updatePurchasingProduct } from "@/app/actions/purchasing";

type ActionState = { error?: string } | undefined;

const inputClass =
  "rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

type Category = { id: string; name: string };
type Product = {
  name: string;
  categoryId: string | null;
  productCode: string | null;
  ndc: string | null;
  standardPrice: number;
  notes: string | null;
  active: boolean;
};

export function EditProductForm({
  productId,
  product,
  categories,
}: {
  productId: string;
  product: Product;
  categories: Category[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updatePurchasingProduct.bind(null, productId),
    undefined,
  );

  return (
    <form action={action} className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-slate-600 dark:text-slate-400">Product name</span>
          <input name="name" required defaultValue={product.name} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Category</span>
          <select name="categoryId" defaultValue={product.categoryId ?? ""} className={inputClass}>
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
          <input name="productCode" defaultValue={product.productCode ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">NDC</span>
          <input name="ndc" defaultValue={product.ndc ?? ""} placeholder="e.g. 53885-0245-50" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Standard price ($)</span>
          <input name="standardPrice" type="number" step="0.01" min="0" defaultValue={product.standardPrice} className={inputClass} />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" name="active" defaultChecked={product.active} /> Active
        </label>
      </div>
      <label className="mt-3 flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Notes</span>
        <textarea name="notes" defaultValue={product.notes ?? ""} rows={2} className={inputClass} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200"
      >
        {pending ? "Saving..." : "Save product"}
      </button>
      {state?.error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </form>
  );
}
