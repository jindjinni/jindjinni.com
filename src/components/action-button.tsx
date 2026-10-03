"use client";

import { useActionState } from "react";

type SimpleActionState = { error?: string } | undefined;

/**
 * Shared version of the invoices page's ActionButton -- wraps a
 * single-purpose action already bound to the record it acts on (finalize,
 * mark paid, remove a line) in useActionState, purely to surface its error
 * message and a pending label without every call site re-implementing that
 * plumbing. Generic over any action with the common `{ error?: string } |
 * undefined` state shape.
 */
export function ActionButton({
  action,
  label,
  pendingLabel,
  className,
  confirm,
}: {
  action: (state: SimpleActionState, formData: FormData) => Promise<SimpleActionState>;
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
