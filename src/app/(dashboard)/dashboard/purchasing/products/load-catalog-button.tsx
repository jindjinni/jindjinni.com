"use client";

import { useActionState } from "react";
import { loadPurchasingProductCatalog, type SeedCatalogActionState } from "@/app/actions/purchasing";

export function LoadCatalogButton() {
  const [state, action, pending] = useActionState<SeedCatalogActionState, FormData>(loadPurchasingProductCatalog, undefined);

  return (
    <form action={action} className="mt-3 flex flex-col items-start gap-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        {pending ? "Loading…" : "Load product catalog"}
      </button>
      <p className="text-xs text-slate-400">
        Adds the full Dexcom / Omnipod / Freestyle / Medtronic / etc. catalog at $0 -- safe to click more than once, won&rsquo;t duplicate anything already in your list.
      </p>
      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {state?.message && <p className="text-sm text-emerald-700 dark:text-emerald-400">{state.message}</p>}
    </form>
  );
}
