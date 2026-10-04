"use client";

import { useActionState } from "react";
import { restoreCompany } from "@/app/actions/company";
import { AuthError, authBtnPrimary } from "@/components/auth/auth-ui";

export function RestoreForm() {
  const [state, action, pending] = useActionState(restoreCompany, undefined);
  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      {state?.error && <AuthError>{state.error}</AuthError>}
      <button type="submit" disabled={pending} className={authBtnPrimary}>
        {pending ? "Reopening..." : "Reopen my company"}
      </button>
    </form>
  );
}
