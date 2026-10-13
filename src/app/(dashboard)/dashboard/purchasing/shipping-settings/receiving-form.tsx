"use client";

import { useActionState } from "react";
import { AddressSettingsForm, type AddressValues } from "@/components/address-settings-form";

type ActionState = { error?: string; success?: boolean } | undefined;
type Act = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function ReceivingForm({ save, clear, values, hasOwn }: { save: Act; clear: Act; values: AddressValues; hasOwn: boolean }) {
  const [state, clearAction, pending] = useActionState(clear, undefined);
  return (
    <>
      <AddressSettingsForm prefix="receive" action={save} values={values} testId="receive-form" />
      {hasOwn && (
        <form action={clearAction} className="mt-3 flex max-w-2xl items-center gap-3">
          <button type="submit" disabled={pending} className="text-sm text-slate-600 underline dark:text-slate-400" data-testid="receive-clear">Use my Shipping address instead</button>
          {state?.success && <span className="text-sm text-emerald-700 dark:text-emerald-400" role="status">Done ✓</span>}
          {state?.error && <span className="text-sm text-red-600 dark:text-red-400" role="alert">{state.error}</span>}
        </form>
      )}
    </>
  );
}
