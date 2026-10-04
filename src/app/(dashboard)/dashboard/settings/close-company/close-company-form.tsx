"use client";

import { useActionState } from "react";
import { closeCompany } from "@/app/actions/company";

const input =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50";

export function CloseCompanyForm({ companyName }: { companyName: string }) {
  const [state, action, pending] = useActionState(closeCompany, undefined);
  return (
    <form action={action} className="mt-4 flex max-w-md flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="close-name" className="text-xs font-medium text-slate-600 dark:text-slate-400">
          Type <span className="font-semibold">{companyName}</span> to confirm
        </label>
        <input id="close-name" name="companyName" required autoComplete="off" className={input} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="close-password" className="text-xs font-medium text-slate-600 dark:text-slate-400">Your password</label>
        <input id="close-password" name="password" type="password" required autoComplete="current-password" className={input} />
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input id="close-understand" name="understand" type="checkbox" className="mt-1" />
        I understand my team will be locked out and my data is deleted after 30 days.
      </label>
      {state?.error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      <div>
        <button disabled={pending} className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
          {pending ? "Closing..." : "Close company"}
        </button>
      </div>
    </form>
  );
}
