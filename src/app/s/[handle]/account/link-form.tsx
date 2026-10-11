"use client";

import { useActionState, useState } from "react";
import { requestBuyerLinkAction } from "@/app/actions/storefront-buyers";
import { AuthError, AuthField, authBtnPrimary } from "@/components/auth/auth-ui";
import { HumanCheck } from "@/components/human-check";

export function LinkForm({ handle }: { handle: string }) {
  const [state, action, pending] = useActionState(requestBuyerLinkAction.bind(null, handle), undefined);
  const [email, setEmail] = useState("");
  if (state?.sent) {
    return (
      <div className="mt-8 rounded-2xl border border-line p-6" data-testid="acc-sent">
        <h2 className="text-2xl font-extrabold text-ink">Check your email</h2>
        <p className="mt-2 text-base text-muted">If that email belongs to an approved pharmacy, we have sent a sign-in link. It works once, for 30 minutes.</p>
      </div>
    );
  }
  return (
    <form action={action} className="mt-8 flex flex-col gap-5">
      <AuthField label="Email"><input name="email" type="text" required autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} data-testid="acc-email" /></AuthField>
      <HumanCheck />
      {state?.error && <AuthError>{state.error}</AuthError>}
      <button type="submit" disabled={pending} className={authBtnPrimary} data-testid="acc-submit">{pending ? "Sending..." : "Email me a sign-in link"}</button>
    </form>
  );
}
