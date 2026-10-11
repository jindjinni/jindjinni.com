"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { requestReset } from "@/app/actions/password-reset";
import { AuthCard, AuthError, AuthField, AuthShell, authBtnPrimary } from "@/components/auth/auth-ui";
import { HumanCheck } from "@/components/human-check";
import { RESET_SENT_MESSAGE } from "@/lib/password-reset-rules";

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestReset, undefined);
  // Controlled, so a mistyped address is still there after an error (React clears uncontrolled fields after every submit).
  const [email, setEmail] = useState("");

  return (
    <AuthShell headerLink={{ prompt: "New to jindjinni?", label: "Get Started", href: "/signup" }}>
      <AuthCard className="max-w-xl p-7 sm:p-10">
        {state?.sent ? (
          <div data-testid="forgot-sent">
            <h1 className="text-3xl font-extrabold tracking-tight text-ink">Check your email</h1>
            <p className="mt-3 text-base text-muted">{RESET_SENT_MESSAGE}</p>
            <Link href="/login" className={`${authBtnPrimary} mt-8 inline-flex`}>
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-3xl font-extrabold tracking-tight text-ink">Forgot your password?</h1>
            <p className="mt-2 text-base text-muted">Type the email you sign in with. We&rsquo;ll email you a link to choose a new one.</p>

            <form action={action} className="mt-8 flex flex-col gap-5">
              <AuthField label="Email">
                <input name="email" type="text" required autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="forgot-email" />
              </AuthField>
              <HumanCheck />
              {state?.error && <AuthError>{state.error}</AuthError>}
              <button type="submit" disabled={pending} className={authBtnPrimary}>
                {pending ? "Sending..." : "Send me a link"}
              </button>
            </form>

            <p className="mt-8 border-t border-line pt-6 text-sm font-semibold text-muted">
              Staff login with no email? Your company&rsquo;s admin resets it for you.{" "}
              <Link href="/login" className="font-extrabold text-ink underline decoration-brand decoration-2 underline-offset-4 hover:decoration-ink">
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </AuthCard>
    </AuthShell>
  );
}
