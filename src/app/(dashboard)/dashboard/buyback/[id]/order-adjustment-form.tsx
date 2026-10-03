"use client";

import { useActionState, useState } from "react";
import { setOrderAdjustment } from "@/app/actions/buyback";

type ActionState = { error?: string } | undefined;

export function OrderAdjustmentForm({
  orderId,
  adjustmentEnabled,
  deductionAmount,
}: {
  orderId: string;
  adjustmentEnabled: boolean;
  deductionAmount: number;
}) {
  const [enabled, setEnabled] = useState(adjustmentEnabled);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    setOrderAdjustment.bind(null, orderId),
    undefined,
  );

  return (
    <form
      action={formAction}
      className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-slate-300 p-3 text-sm dark:border-slate-700"
    >
      <label className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
        <input
          type="checkbox"
          name="adjustmentEnabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4"
        />
        Apply a deduction to this quote
      </label>
      {enabled && (
        <label className="flex flex-col gap-1">
          <span className="text-slate-600 dark:text-slate-400">Deduction amount</span>
          <input
            name="deductionAmount"
            type="number"
            min="0"
            step="0.01"
            defaultValue={deductionAmount || 0}
            className="w-28 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        {pending ? "Saving..." : "Save"}
      </button>
      {state?.error && <p className="w-full text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </form>
  );
}
