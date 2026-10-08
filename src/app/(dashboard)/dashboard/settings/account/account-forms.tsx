"use client";

import { useActionState, useState } from "react";
import { changeMyPassword, confirmEmailChange, requestEmailChange, updateMyName, type AccountActionState } from "@/app/actions/account";

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

/** Change the sign-in email: password + new address, then the 6-digit code sent to the new address. */
export function EmailForm() {
  const [sendState, sendAction, sending] = useActionState(requestEmailChange, undefined);
  const [confirmState, confirmAction, confirming] = useActionState(confirmEmailChange, undefined);
  // Controlled fields: React clears an uncontrolled form after every action, and step 2 needs the same email and password.
  const [newEmail, setNewEmail] = useState("");
  const [pw, setPw] = useState("");
  const shown = confirmState?.sent ? confirmState : sendState;
  const codeStep = !!(sendState?.sent || confirmState?.sent);
  return (
    <form className="mt-3 flex max-w-sm flex-col gap-3" data-testid="email-form">
      <div className="flex flex-col gap-1">
        <label htmlFor="acct-newemail" className="text-xs font-medium text-slate-600 dark:text-slate-400">New sign-in email</label>
        <input id="acct-newemail" name="newEmail" type="email" required autoComplete="off" maxLength={200} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className={input} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="acct-emailpw" className="text-xs font-medium text-slate-600 dark:text-slate-400">Current password</label>
        <input id="acct-emailpw" name="currentPassword" type="password" required autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} className={input} />
      </div>
      {!codeStep && (
        <div><button formAction={sendAction} className={btn} disabled={sending} data-testid="email-send">{sending ? "Sending..." : "Send code to the new email"}</button></div>
      )}
      {codeStep && (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-400" data-testid="email-sent">We sent a 6-digit code to {shown?.sentTo}. It expires in 10 minutes.</p>
          <div className="flex flex-col gap-1">
            <label htmlFor="acct-emailcode" className="text-xs font-medium text-slate-600 dark:text-slate-400">6-digit code</label>
            <input id="acct-emailcode" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" className={input} />
          </div>
          <div className="flex gap-2">
            <button formAction={confirmAction} className={btn} disabled={confirming} data-testid="email-confirm">{confirming ? "Changing..." : "Change my sign-in email"}</button>
            <button formAction={sendAction} formNoValidate className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700" disabled={sending}>Send a new code</button>
          </div>
        </>
      )}
      <Feedback state={confirmState?.error ? confirmState : sendState?.error ? sendState : confirmState?.message ? confirmState : undefined} />
    </form>
  );
}
