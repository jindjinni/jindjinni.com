"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/actions/invoices";

/**
 * Wraps a single-purpose action (finalize, void, remove line) that's
 * already bound to the record it acts on -- so the only thing left for
 * the form to submit is the click itself -- in useActionState, purely to
 * surface its error message and a pending label without every call site
 * re-implementing that plumbing.
 */
export function InvoiceActionButton({
  action,
  label,
  pendingLabel,
  className,
  confirm,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  label: string;
  pendingLabel: string;
  className: string;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <button type="submit" disabled={pending} className={className}>
        {pending ? pendingLabel : label}
      </button>
      {state?.error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
    </form>
  );
}
