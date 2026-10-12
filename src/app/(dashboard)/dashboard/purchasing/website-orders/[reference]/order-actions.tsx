"use client";

import { useActionState } from "react";
import { cancelOrderAction, emailOrderCopyAction, makeOrderLabelAction } from "@/app/actions/storefront";

const primary = "rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60";

export function EmailCopyForm({ reference, email }: { reference: string; email: string }) {
  const [state, action, pending] = useActionState(emailOrderCopyAction.bind(null, reference), undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2" data-testid="wo-copy-form">
      <label className="text-xs text-slate-500">Send to
        <input name="to" type="email" placeholder={email} aria-label="Send the copy to" className="mt-0.5 block w-64 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900" data-testid="wo-copy-to" />
      </label>
      <button disabled={pending} className={primary} data-testid="wo-copy-send">{pending ? "Sending..." : "Email a copy to the customer"}</button>
      {state?.message && <span className="text-sm text-emerald-700 dark:text-emerald-300" role="status" data-testid="wo-copy-ok">{state.message}</span>}
      {state?.error && <span className="text-sm text-red-700 dark:text-red-300" role="alert" data-testid="wo-copy-error">{state.error}</span>}
    </form>
  );
}

export function MakeLabelForm({ reference }: { reference: string }) {
  const [state, action, pending] = useActionState(makeOrderLabelAction.bind(null, reference), undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2" data-testid="wo-label-form">
      <button disabled={pending} className={primary} data-testid="wo-make-label">{pending ? "Making the label..." : "Make the free label now"}</button>
      {state?.message && <span className="text-sm text-emerald-700 dark:text-emerald-300" role="status">{state.message}</span>}
      {state?.error && <span className="text-sm text-red-700 dark:text-red-300" role="alert" data-testid="wo-label-error">{state.error}</span>}
    </form>
  );
}

export function CancelOrderForm({ reference }: { reference: string }) {
  return (
    <form action={cancelOrderAction.bind(null, reference)} data-testid="wo-cancel-form">
      <details>
        <summary className="cursor-pointer text-sm text-red-700 underline dark:text-red-300" data-testid="wo-cancel-open">Cancel this order</summary>
        <p className="mt-2 max-w-md text-xs text-slate-500">The quotation is cancelled and the order set aside (nothing is deleted). If a label was already made, void it in your carrier account so you are not charged for it, and tell the customer not to ship.</p>
        <button className="mt-2 rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300" data-testid="wo-cancel-confirm">Yes, cancel the order</button>
      </details>
    </form>
  );
}
