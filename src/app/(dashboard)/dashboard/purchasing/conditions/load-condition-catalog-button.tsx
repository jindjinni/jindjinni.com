"use client";

import { useActionState } from "react";
import { loadPurchasingConditionCatalog, type SeedCatalogActionState } from "@/app/actions/purchasing";

export function LoadConditionCatalogButton() {
  const [state, action, pending] = useActionState<SeedCatalogActionState, FormData>(loadPurchasingConditionCatalog, undefined);

  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        {pending ? "Loading…" : "Load the real Mint / Ding conditions"}
      </button>
      {state?.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
      {state?.message && <p className="text-xs text-emerald-700 dark:text-emerald-400">{state.message}</p>}
    </form>
  );
}
