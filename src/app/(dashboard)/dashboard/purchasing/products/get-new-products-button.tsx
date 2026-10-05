"use client";

import { useActionState } from "react";
import { getNewProducts, type CatalogTemplateActionState } from "@/app/actions/catalog-template";

export function GetNewProductsButton({ available }: { available: number }) {
  const [state, action, pending] = useActionState<CatalogTemplateActionState, FormData>(getNewProducts, undefined);

  return (
    <form action={action} className="mt-3 flex flex-col items-start gap-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        {pending ? "Getting…" : available > 0 ? `Get new products (${available})` : "Get new products"}
      </button>
      <p className="text-xs text-slate-400">
        Your list started from our default catalog. This adds products we&rsquo;ve added to it since, at $0 &mdash; it never changes products you edited, repriced or removed.
      </p>
      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {state?.message && <p className="text-sm text-emerald-700 dark:text-emerald-400">{state.message}</p>}
    </form>
  );
}
