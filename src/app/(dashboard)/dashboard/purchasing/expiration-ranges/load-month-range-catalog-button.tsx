"use client";

import { useActionState } from "react";
import { loadPurchasingMonthRangeCatalog, type SeedCatalogActionState } from "@/app/actions/purchasing";

export function LoadMonthRangeCatalogButton() {
  const [state, action, pending] = useActionState<SeedCatalogActionState, FormData>(loadPurchasingMonthRangeCatalog, undefined);

  return (
    <form action={action} className="mt-3 flex flex-col items-start gap-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        {pending ? "Loading…" : "Load the 17 real month ranges"}
      </button>
      <p className="text-xs text-slate-400">
        Adds your real 1-2/3-5/4+/.../12+ month list with its multipliers -- safe to click more than once, won&rsquo;t duplicate anything already in your list.
      </p>
      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {state?.message && <p className="text-sm text-emerald-700 dark:text-emerald-400">{state.message}</p>}
    </form>
  );
}
