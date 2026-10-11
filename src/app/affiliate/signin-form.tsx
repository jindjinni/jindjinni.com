"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { requestAffiliateLink } from "@/app/actions/affiliate-portal";
import { AuthCard, AuthError, AuthField, AuthShell, authBtnPrimary } from "@/components/auth/auth-ui";
import { HumanCheck } from "@/components/human-check";

export function AffiliateSigninForm() {
  const [state, action, pending] = useActionState(requestAffiliateLink, undefined);
  // Controlled, so a mistyped address is still there after an error (React clears uncontrolled fields after every submit).
  const [email, setEmail] = useState("");
  return (
    <AuthShell headerLink={{ prompt: "Not an affiliate yet?", label: "Become an affiliate", href: "/affiliates" }}>
      <AuthCard className="max-w-xl p-7 sm:p-10">
        {state?.sent ? (
          <div data-testid="aff-signin-sent">
            <h1 className="text-3xl font-extrabold tracking-tight text-ink">Check your email</h1>
            <p className="mt-3 text-base text-muted">If that email belongs to an approved affiliate, we have sent a sign-in link. It works once, for 30 minutes.</p>
            <Link href="/affiliates" className={`${authBtnPrimary} mt-8 inline-flex`}>Back to the affiliate program</Link>
          </div>
        ) : (
          <>
            <h1 className="text-3xl font-extrabold tracking-tight text-ink">Affiliate portal</h1>
            <p className="mt-2 text-base text-muted">Approved affiliates only. Type the email you applied with and we&rsquo;ll email you a one-time sign-in link. There is no password.</p>
            <form action={action} className="mt-8 flex flex-col gap-5">
              <AuthField label="Email">
                <input name="email" type="text" required autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="aff-signin-email" />
              </AuthField>
              <HumanCheck />
              {state?.error && <AuthError>{state.error}</AuthError>}
              <button type="submit" disabled={pending} className={authBtnPrimary} data-testid="aff-signin-submit">{pending ? "Sending..." : "Email me a sign-in link"}</button>
            </form>
          </>
        )}
      </AuthCard>
    </AuthShell>
  );
}
