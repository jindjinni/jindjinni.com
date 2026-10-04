"use client";

import { useActionState } from "react";
import { acceptInvitation } from "@/app/actions/team";
import { AuthError, AuthField, authBtnPrimary } from "@/components/auth/auth-ui";
import { TermsCheckbox } from "@/components/legal/terms-checkbox";

export function AcceptForm({ token, mode }: { token: string; mode: "create" | "join" }) {
  const [state, action, pending] = useActionState(acceptInvitation.bind(null, token), undefined);
  return (
    <form action={action} className="mt-8 flex flex-col gap-5">
      {mode === "create" && (
        <>
          <AuthField label="Your name">
            <input name="name" type="text" required autoComplete="name" placeholder="Full name" />
          </AuthField>
          <AuthField label="Choose a password" hint="At least 8 characters.">
            <input name="password" type="password" required minLength={8} autoComplete="new-password" />
          </AuthField>
          <TermsCheckbox />
        </>
      )}
      {state?.error && <AuthError>{state.error}</AuthError>}
      <button type="submit" disabled={pending} className={authBtnPrimary}>
        {pending ? "Joining..." : mode === "create" ? "Create account & join" : "Join workspace"}
      </button>
    </form>
  );
}
