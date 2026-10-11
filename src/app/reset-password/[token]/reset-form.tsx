"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { resetPassword } from "@/app/actions/password-reset";
import { AuthCard, AuthError, AuthField, AuthShell, authBtnPrimary } from "@/components/auth/auth-ui";
import { HumanCheck } from "@/components/human-check";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, undefined);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  return (
    <AuthShell>
      <AuthCard className="max-w-xl p-7 sm:p-10">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Choose a new password</h1>
        <p className="mt-2 text-base text-muted">Pick something you don&rsquo;t use anywhere else. You&rsquo;ll go to the sign-in page afterwards.</p>

        <form action={action} className="mt-8 flex flex-col gap-5">
          <input type="hidden" name="token" value={token} />
          <AuthField label="New password" hint="At least 8 characters.">
            <input name="password" type="password" required minLength={8} autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} data-testid="reset-password" />
          </AuthField>
          <AuthField label="Type it again">
            <input name="confirm" type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} data-testid="reset-confirm" />
          </AuthField>
          <HumanCheck />
          {state?.error && <AuthError>{state.error}</AuthError>}
          {state?.expired && (
            <Link href="/forgot-password" className="text-sm font-extrabold text-ink underline decoration-brand decoration-2 underline-offset-4">
              Get a new link
            </Link>
          )}
          <button type="submit" disabled={pending} className={authBtnPrimary}>
            {pending ? "Saving..." : "Save new password"}
          </button>
        </form>
      </AuthCard>
    </AuthShell>
  );
}
