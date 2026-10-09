"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { beginTwoStepSetup, cancelTwoStepSetup, finishTwoStepSetup, makeNewBackupCodes, turnOffTwoStep, type TwoStepState } from "@/app/actions/two-step";

const input = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50";
const btn = "rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60";
const btnGhost = "rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";

function Feedback({ state }: { state: TwoStepState }) {
  if (state?.error) return <p role="alert" className="text-sm text-red-600 dark:text-red-400">{state.error}</p>;
  if (state?.message) return <p className="text-sm text-emerald-700 dark:text-emerald-400">{state.message}</p>;
  return null;
}

export function BackupCodes({ codes }: { codes: string[] }) {
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40" data-testid="backup-codes">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Save these backup codes now. They are shown only once.</p>
      <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">Each one signs you in once if you lose your phone. Keep them somewhere safe, like a password manager.</p>
      <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm text-slate-900 dark:text-slate-50">
        {codes.map((c) => <li key={c} data-testid="backup-code">{c}</li>)}
      </ul>
    </div>
  );
}

export function StartSetupForm() {
  const [state, action, pending] = useActionState(beginTwoStepSetup, undefined);
  return (
    <form action={action} className="mt-3 flex max-w-sm flex-col gap-3" data-testid="twostep-start">
      <div className="flex flex-col gap-1">
        <label htmlFor="ts-start-pw" className="text-xs font-medium text-slate-600 dark:text-slate-400">Your password</label>
        <input id="ts-start-pw" name="currentPassword" type="password" required autoComplete="current-password" className={input} />
      </div>
      <div><button className={btn} disabled={pending}>{pending ? "Starting..." : "Turn on two-step sign-in"}</button></div>
      <Feedback state={state} />
    </form>
  );
}

export function FinishSetupForm({ secret, svg }: { secret: string; svg: string | null }) {
  const [state, action, pending] = useActionState(finishTwoStepSetup, undefined);
  const [cancelState, cancel, cancelling] = useActionState(cancelTwoStepSetup, undefined);
  void cancelState;
  const router = useRouter();
  if (state?.backupCodes) {
    return (
      <div className="mt-3 flex flex-col gap-3">
        <Feedback state={state} />
        <BackupCodes codes={state.backupCodes} />
        <div><button type="button" className={btn} onClick={() => router.refresh()} data-testid="twostep-done">I saved them. Done</button></div>
      </div>
    );
  }
  return (
    <div className="mt-3 flex flex-col gap-4" data-testid="twostep-setup">
      <ol className="list-decimal pl-5 text-sm text-slate-700 dark:text-slate-300">
        <li>Install an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password, Authy).</li>
        <li>Scan this picture with the app, or choose &ldquo;enter a key&rdquo; and type the key below.</li>
        <li>Type the 6-digit code the app shows.</li>
      </ol>
      <div className="flex flex-wrap items-start gap-5">
        {svg && <div className="rounded-md border border-slate-200 bg-white p-1" data-testid="twostep-qr" dangerouslySetInnerHTML={{ __html: svg }} />}
        <div className="text-sm">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Key to type if you can&apos;t scan</p>
          <p className="mt-1 break-all font-mono text-base tracking-wider text-slate-900 dark:text-slate-50" data-testid="twostep-secret">{secret.match(/.{1,4}/g)?.join(" ")}</p>
        </div>
      </div>
      <form action={action} className="flex max-w-sm flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="ts-code" className="text-xs font-medium text-slate-600 dark:text-slate-400">6-digit code</label>
          <input id="ts-code" name="code" inputMode="numeric" pattern="[0-9 ]{6,7}" maxLength={7} autoComplete="one-time-code" required className={input} />
        </div>
        <div className="flex gap-2">
          <button className={btn} disabled={pending}>{pending ? "Checking..." : "Check the code and turn on"}</button>
          <button type="submit" formAction={cancel} formNoValidate className={btnGhost} disabled={cancelling}>Cancel</button>
        </div>
        <Feedback state={state} />
      </form>
    </div>
  );
}

export function TurnOffForm() {
  const [state, action, pending] = useActionState(turnOffTwoStep, undefined);
  return (
    <form action={action} className="mt-3 flex max-w-sm flex-col gap-3" data-testid="twostep-off">
      <div className="flex flex-col gap-1">
        <label htmlFor="ts-off-pw" className="text-xs font-medium text-slate-600 dark:text-slate-400">Your password</label>
        <input id="ts-off-pw" name="currentPassword" type="password" required autoComplete="current-password" className={input} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="ts-off-code" className="text-xs font-medium text-slate-600 dark:text-slate-400">A current code (or a backup code)</label>
        <input id="ts-off-code" name="code" required autoComplete="one-time-code" maxLength={12} className={input} />
      </div>
      <div><button className={btnGhost} disabled={pending}>{pending ? "Turning off..." : "Turn off two-step sign-in"}</button></div>
      <Feedback state={state} />
    </form>
  );
}

export function NewCodesForm() {
  const [state, action, pending] = useActionState(makeNewBackupCodes, undefined);
  return (
    <form action={action} className="mt-3 flex max-w-sm flex-col gap-3" data-testid="twostep-newcodes">
      <div className="flex flex-col gap-1">
        <label htmlFor="ts-new-pw" className="text-xs font-medium text-slate-600 dark:text-slate-400">Your password</label>
        <input id="ts-new-pw" name="currentPassword" type="password" required autoComplete="current-password" className={input} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="ts-new-code" className="text-xs font-medium text-slate-600 dark:text-slate-400">A current code</label>
        <input id="ts-new-code" name="code" required autoComplete="one-time-code" maxLength={12} className={input} />
      </div>
      <div><button className={btnGhost} disabled={pending}>{pending ? "Making..." : "Make new backup codes"}</button></div>
      <Feedback state={state} />
      {state?.backupCodes && <BackupCodes codes={state.backupCodes} />}
    </form>
  );
}
