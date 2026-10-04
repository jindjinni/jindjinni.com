"use client";

import { useActionState } from "react";
import { changeMyPassword, updateMyName, type AccountActionState } from "@/app/actions/account";

const input =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50";
const btn = "rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60";

function Feedback({ state }: { state: AccountActionState }) {
  if (state?.error) return <p role="alert" className="text-sm text-red-600 dark:text-red-400">{state.error}</p>;
  if (state?.message) return <p className="text-sm text-emerald-700 dark:text-emerald-400">{state.message}</p>;
  return null;
}

export function NameForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(updateMyName, undefined);
  return (
    <form action={action} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1">
        <label htmlFor="acct-name" className="text-xs font-medium text-slate-600 dark:text-slate-400">Full name</label>
        <input id="acct-name" name="name" defaultValue={name} required maxLength={100} autoComplete="name" className={input} />
      </div>
      <button className={btn} disabled={pending}>{pending ? "Saving..." : "Save name"}</button>
      <Feedback state={state} />
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changeMyPassword, undefined);
  return (
    <form action={action} className="mt-3 flex max-w-sm flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="acct-current" className="text-xs font-medium text-slate-600 dark:text-slate-400">Current password</label>
        <input id="acct-current" name="currentPassword" type="password" required autoComplete="current-password" className={input} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="acct-new" className="text-xs font-medium text-slate-600 dark:text-slate-400">New password</label>
        <input id="acct-new" name="newPassword" type="password" required minLength={8} autoComplete="new-password" className={input} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="acct-confirm" className="text-xs font-medium text-slate-600 dark:text-slate-400">Confirm new password</label>
        <input id="acct-confirm" name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" className={input} />
      </div>
      <div><button className={btn} disabled={pending}>{pending ? "Changing..." : "Change password"}</button></div>
      <Feedback state={state} />
    </form>
  );
}
