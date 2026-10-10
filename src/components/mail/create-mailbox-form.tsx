"use client";

import { useActionState } from "react";
import { createMailboxAction, type MailState } from "@/app/actions/mailbox";
import { field, primaryBtn } from "@/components/sales-ui";

/** Adds a mailbox: a shared one for the department (an admin), or a personal one (anyone who can open the department). */
export function CreateMailboxForm({ dept, kind, defaultName, button }: { dept: string; kind: "SHARED" | "PERSONAL"; defaultName?: string; button: string }) {
  const [state, action, pending] = useActionState<MailState, FormData>(createMailboxAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2" data-testid={`create-${kind.toLowerCase()}`}>
      <input type="hidden" name="dept" value={dept} />
      <input type="hidden" name="kind" value={kind} />
      <div className="min-w-[14rem] flex-1">
        <label htmlFor={`name-${kind}`} className="mb-1 block text-sm font-medium text-slate-800 dark:text-slate-200">
          Name
        </label>
        <input id={`name-${kind}`} name="name" maxLength={60} defaultValue={defaultName ?? ""} placeholder={kind === "SHARED" ? "For example: Purchasing" : "For example: My mailbox"} className={field} />
      </div>
      <button className={primaryBtn} disabled={pending} data-testid={`create-${kind.toLowerCase()}-btn`}>
        {pending ? "Adding…" : button}
      </button>
      {state?.error && (
        <p className="w-full text-sm text-red-700 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
