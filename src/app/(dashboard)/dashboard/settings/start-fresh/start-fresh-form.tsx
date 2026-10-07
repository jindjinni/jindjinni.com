"use client";

import { useActionState } from "react";
import { startFresh } from "@/app/actions/start-fresh";

const input = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50";

export function StartFreshForm({ phrase, empty, companyName }: { phrase: string; empty: boolean; companyName: string }) {
  const [state, action, pending] = useActionState(startFresh, undefined);
  if (state?.done) {
    return (
      <p role="status" className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200" data-testid="fresh-done">
        {state.done}
      </p>
    );
  }
  if (empty) {
    return (
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400" data-testid="fresh-empty">
        There are no quotations, packages or customers to clear. {companyName} is already fresh.
      </p>
    );
  }
  return (
    <form action={action} className="mt-4 flex max-w-md flex-col gap-3" data-testid="fresh-form">
      <p className="-mb-1 text-sm text-slate-600 dark:text-slate-400">This can&rsquo;t be undone. New quotation numbers start again from 1 for each day.</p>
      <div className="flex flex-col gap-1">
        <label htmlFor="fresh-phrase" className="text-xs font-medium text-slate-600 dark:text-slate-400">
          Type <span className="font-semibold">{phrase}</span> to confirm
        </label>
        <input id="fresh-phrase" name="phrase" required autoComplete="off" className={input} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="fresh-password" className="text-xs font-medium text-slate-600 dark:text-slate-400">
          Your password
        </label>
        <input id="fresh-password" name="password" type="password" required autoComplete="current-password" className={input} />
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input id="fresh-understand" name="understand" type="checkbox" className="mt-1" />
        I understand the test quotations and everything they created will be deleted and can&rsquo;t be brought back.
      </label>
      {state?.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      <div>
        <button disabled={pending} className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
          {pending ? "Clearing..." : "Clear the test data"}
        </button>
      </div>
    </form>
  );
}
