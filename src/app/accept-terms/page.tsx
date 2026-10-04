"use client";

import { useActionState } from "react";
import { acceptCurrentTerms } from "@/app/actions/account";
import { AuthCard, AuthError, AuthShell, authBtnPrimary } from "@/components/auth/auth-ui";
import { TermsCheckbox } from "@/components/legal/terms-checkbox";

export default function AcceptTermsPage() {
  const [state, action, pending] = useActionState(acceptCurrentTerms, undefined);
  return (
    <AuthShell>
      <AuthCard className="max-w-xl p-7 sm:p-10">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">One quick thing</h1>
        <p className="mt-3 text-base text-muted">
          We&rsquo;ve added our Terms of Service, Privacy Policy and Acceptable Use Policy. Please read and agree to keep using your workspace.
        </p>
        <form action={action} className="mt-8 flex flex-col gap-5">
          <TermsCheckbox />
          {state?.error && <AuthError>{state.error}</AuthError>}
          <button type="submit" disabled={pending} className={authBtnPrimary}>
            {pending ? "Saving..." : "Agree and continue"}
          </button>
        </form>
      </AuthCard>
    </AuthShell>
  );
}
