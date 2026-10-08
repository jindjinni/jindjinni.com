"use client";

import { useActionState } from "react";
import { cancelPlanAction, undoCancelAction } from "@/app/actions/plan";

/** Owner-only: the cancel confirmation, or "keep my plan" once cancelled. */
export function CancelPlanForm() {
  const [state, act, busy] = useActionState(cancelPlanAction, undefined);
  return (
    <form action={act} className="mt-3 flex flex-col gap-3" data-testid="cancel-form">
      <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input type="checkbox" name="confirm" value="yes" className="mt-1" data-testid="cancel-confirm" />
        <span>I understand, and I want to cancel my plan.</span>
      </label>
      <div>
        <button disabled={busy} data-testid="cancel-submit" className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950">
          {busy ? "Cancelling…" : "Cancel my plan"}
        </button>
      </div>
      {state?.error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{state.error}</p>}
      {state?.message && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{state.message}</p>}
    </form>
  );
}

export function UndoCancelForm() {
  const [state, act, busy] = useActionState(undoCancelAction, undefined);
  return (
    <form action={act} className="mt-3" data-testid="undo-form">
      <button disabled={busy} data-testid="undo-cancel" className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900">
        {busy ? "Saving…" : "Keep my plan"}
      </button>
      {state?.error && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{state.error}</p>}
      {state?.message && <p role="status" className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">{state.message}</p>}
    </form>
  );
}
