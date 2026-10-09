"use client";

import { useActionState } from "react";
import { saveOperationType } from "@/app/actions/operation-type";
import { OperationTypeField } from "@/components/operation-type-field";
import type { OperationType } from "@/lib/operation-type";

/** Lets the owner or an admin choose (or change) what type of operation the company runs. */
export function OperationForm({ current }: { current: OperationType | null }) {
  const [state, act, busy] = useActionState(saveOperationType, undefined);
  return (
    <form action={act} className="flex flex-col gap-3" data-testid="operation-form">
      <OperationTypeField initial={current} variant="app" />
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900">{busy ? "Saving…" : "Save"}</button>
        {state?.error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{state.error}</p>}
        {state?.message && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{state.message}</p>}
      </div>
    </form>
  );
}
