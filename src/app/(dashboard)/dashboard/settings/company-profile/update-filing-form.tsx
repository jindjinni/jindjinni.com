"use client";

import { useActionState } from "react";
import { updateFilingNumber } from "@/app/actions/company-profile";

/** Lets the owner replace the state registration / file number on record. */
export function UpdateFilingForm({ current }: { current: string }) {
  const [state, act, busy] = useActionState(updateFilingNumber, undefined);
  return (
    <form action={act} className="flex flex-col gap-2" data-testid="update-filing-form">
      <label htmlFor="stateFileNumber" className="text-xs font-medium text-slate-600 dark:text-slate-300">Update your state registration / file number</label>
      <div className="flex flex-wrap items-center gap-2">
        <input id="stateFileNumber" name="stateFileNumber" defaultValue={current} minLength={3} maxLength={40} required autoComplete="off" className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
        <button disabled={busy} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900">{busy ? "Saving…" : "Save"}</button>
      </div>
      {state?.error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{state.error}</p>}
      {state?.message && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{state.message}</p>}
    </form>
  );
}
