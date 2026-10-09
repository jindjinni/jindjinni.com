"use client";

import { useActionState } from "react";
import { recheckRegistryAction } from "@/app/actions/approvals";

/** "Check again" for the state-records check on one company. */
export function RegistryRecheck({ orgId, canCheck }: { orgId: string; canCheck: boolean }) {
  const [state, act, busy] = useActionState(recheckRegistryAction, undefined);
  if (!canCheck) return null;
  return (
    <form action={act} className="inline">
      <input type="hidden" name="orgId" value={orgId} />
      <button className="text-sm font-medium text-emerald-700 underline disabled:opacity-60 dark:text-emerald-300" disabled={busy} data-testid="registry-recheck">
        {busy ? "Checking…" : "Check again"}
      </button>
      {state?.error && <span role="alert" className="ml-2 text-sm text-red-700 dark:text-red-300">{state.error}</span>}
    </form>
  );
}
