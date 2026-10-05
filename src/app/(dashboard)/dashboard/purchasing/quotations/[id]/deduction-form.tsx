"use client";

import { useActionState, useState } from "react";
import { setPurchasingQuotationDeduction } from "@/app/actions/purchasing";

type ActionState = { error?: string } | undefined;

export function DeductionForm({
  quotationId,
  deductionEnabled,
  deductionAmount,
  deductionReason,
}: {
  quotationId: string;
  deductionEnabled: boolean;
  deductionAmount: number;
  deductionReason: string | null;
}) {
  const [enabled, setEnabled] = useState(deductionEnabled);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    setPurchasingQuotationDeduction.bind(null, quotationId),
    undefined,
  );

  return (
    <form action={formAction} className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
      <label className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          name="deductionEnabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Apply a manual deduction
      </label>
      {enabled && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-slate-600 dark:text-slate-400">Deduction amount ($)</span>
            <input
              name="deductionAmount"
              type="number"
              step="0.01"
              min="0"
              defaultValue={deductionAmount}
              className="w-32 rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-slate-600 dark:text-slate-400">Reason (required)</span>
            <input
              name="deductionReason"
              defaultValue={deductionReason ?? ""}
              className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-3 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200"
      >
        {pending ? "Saving..." : "Save"}
      </button>
      {state?.error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </form>
  );
}
