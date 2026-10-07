"use client";

import { useActionState } from "react";
import { importBuyersAction, type SalesFormState } from "@/app/actions/sales";
import { card } from "@/components/sales-ui";

export function ImportBuyersForm() {
  const [state, action, pending] = useActionState<SalesFormState, FormData>(importBuyersAction, undefined);
  return (
    <details className={`${card} mt-6`} data-testid="buyer-import">
      <summary className="cursor-pointer text-sm font-semibold text-slate-900 dark:text-slate-50">Add many buyers from a spreadsheet</summary>
      <form action={action} className="mt-3 space-y-3">
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Upload a CSV or Excel file with one buyer per row. It should have a <strong>Company Name</strong> column; these are used when present: Contact Name, Billing Address, Shipping Address, City, State, ZIP Code, Phone, Email, Payment Terms, Tax Information, Tax Exempt, Default Invoice Notes. A buyer you already have is left as it is.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="buyer-import-file" className="sr-only">Choose a buyers file</label>
          <input id="buyer-import-file" name="file" type="file" accept=".csv,.xlsx,.xls,text/csv" required className="text-xs text-slate-600 dark:text-slate-400" data-testid="buyer-import-file" />
          <button type="submit" disabled={pending} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-50 dark:text-slate-900" data-testid="buyer-import-go">
            {pending ? "Adding…" : "Add these buyers"}
          </button>
        </div>
        {state?.message && <p className="text-sm text-emerald-800 dark:text-emerald-300" data-testid="buyer-import-message">{state.message}</p>}
        {state?.error && <p className="text-sm text-red-700 dark:text-red-300" data-testid="buyer-import-error">{state.error}</p>}
      </form>
    </details>
  );
}
