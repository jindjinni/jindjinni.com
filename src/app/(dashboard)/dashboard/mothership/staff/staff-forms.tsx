"use client";

import { useActionState, useState } from "react";
import { addStaffPerson, changeStaffLevel, newStaffPassword, removeStaffPerson, resetStaffTwoStep, type StaffState } from "@/app/actions/mothership";
import { LEVEL_LABELS, type StaffLevel } from "@/lib/mothership-rules";

const input = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50";
const btn = "rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60";
const ghost = "rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";
const danger = "rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950";

function Feedback({ state }: { state: StaffState }) {
  return (
    <>
      {state?.error && <p role="alert" className="text-sm text-red-600 dark:text-red-400" data-testid="staff-error">{state.error}</p>}
      {state?.message && <p className="text-sm text-emerald-700 dark:text-emerald-400" data-testid="staff-ok">{state.message}</p>}
      {state?.credentials && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100" data-testid="staff-credentials">
          <p>Sign-in for <strong>{state.credentials.name}</strong></p>
          <p>Email: <code data-testid="cred-email">{state.credentials.email}</code></p>
          <p>Temporary password: <code className="font-mono" data-testid="cred-password">{state.credentials.password}</code></p>
        </div>
      )}
    </>
  );
}

export function AddStaffForm({ levels }: { levels: Exclude<StaffLevel, "owner">[] }) {
  const [state, action, pending] = useActionState(addStaffPerson, undefined);
  // Controlled, so a "that email is taken" message doesn't wipe what was typed.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState<string>(levels[levels.length - 1] ?? "support");
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.message) { setName(""); setEmail(""); }
  }
  return (
    <form action={action} className="mt-3 grid gap-3 sm:grid-cols-2" data-testid="add-staff-form">
      <div>
        <label htmlFor="staff-name" className="text-xs font-medium text-slate-600 dark:text-slate-400">Name</label>
        <input id="staff-name" name="name" required maxLength={100} className={input} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label htmlFor="staff-email" className="text-xs font-medium text-slate-600 dark:text-slate-400">Email (they sign in with it)</label>
        <input id="staff-email" name="email" type="email" required maxLength={200} className={input} value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label htmlFor="staff-level" className="text-xs font-medium text-slate-600 dark:text-slate-400">Level</label>
        <select id="staff-level" name="level" className={input} value={level} onChange={(e) => setLevel(e.target.value)}>
          {levels.map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
        </select>
      </div>
      <div className="flex items-end"><button className={btn} disabled={pending} data-testid="add-staff-go">{pending ? "Adding..." : "Add"}</button></div>
      <div className="flex flex-col gap-2 sm:col-span-2"><Feedback state={state} /></div>
    </form>
  );
}

export function StaffRowActions({ userId, level, levels, managed, hasTwoStep }: { userId: string; level: Exclude<StaffLevel, "owner">; levels: Exclude<StaffLevel, "owner">[]; managed: boolean; hasTwoStep: boolean }) {
  const [lvlState, lvlAction, lvlPending] = useActionState(changeStaffLevel.bind(null, userId), undefined);
  const [pwState, pwAction, pwPending] = useActionState(newStaffPassword.bind(null, userId), undefined);
  const [tsState, tsAction, tsPending] = useActionState(resetStaffTwoStep.bind(null, userId), undefined);
  const [rmState, rmAction, rmPending] = useActionState(removeStaffPerson.bind(null, userId), undefined);
  const [sure, setSure] = useState(false);
  const [next, setNext] = useState<string>(level);
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 dark:border-slate-800" data-testid="staff-actions">
      <div className="flex flex-wrap items-center gap-2">
        <form action={lvlAction} className="flex items-center gap-2">
          <label htmlFor={`lvl-${userId}`} className="sr-only">Level</label>
          <select id={`lvl-${userId}`} name="level" className={`${input} !w-auto`} value={next} onChange={(e) => setNext(e.target.value)} data-testid="staff-level-select">
            {levels.map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
          </select>
          <button className={ghost} disabled={lvlPending || next === level} data-testid="staff-level-save">Change level</button>
        </form>
        {managed && (
          <form action={pwAction}><button className={ghost} disabled={pwPending} data-testid="staff-newpw">New temporary password</button></form>
        )}
        {hasTwoStep && (
          <form action={tsAction}><button className={ghost} disabled={tsPending} data-testid="staff-reset-twostep">Reset two-step</button></form>
        )}
        {!sure ? (
          <button type="button" className={danger} onClick={() => setSure(true)} data-testid="staff-remove">Remove…</button>
        ) : (
          <form action={rmAction} className="flex items-center gap-2">
            <span className="text-sm text-slate-600 dark:text-slate-300">They can no longer sign in.</span>
            <button className={danger} disabled={rmPending} data-testid="staff-remove-confirm">Yes, remove</button>
            <button type="button" className={ghost} onClick={() => setSure(false)}>Cancel</button>
          </form>
        )}
      </div>
      <Feedback state={lvlState} />
      <Feedback state={pwState} />
      <Feedback state={tsState} />
      <Feedback state={rmState} />
    </div>
  );
}
