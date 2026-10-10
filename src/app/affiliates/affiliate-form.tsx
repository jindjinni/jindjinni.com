"use client";

import { useActionState } from "react";
import { applyAffiliateAction } from "@/app/actions/pricing-public";
import { AuthError, AuthField, authBtnPrimary } from "@/components/auth/auth-ui";
import { HumanCheck } from "@/components/human-check";

export function AffiliateForm() {
  const [state, action, pending] = useActionState(applyAffiliateAction, undefined);
  if (state?.done) {
    return (
      <div className="mt-8 rounded-xl border border-mint-line bg-mint p-5" role="status" data-testid="affiliate-thanks">
        <p className="font-extrabold text-ink">Thank you. We got your request.</p>
        <p className="mt-1 text-sm text-muted">We will review it and email you at the address you gave us. If we approve it, the email has your code and your link.</p>
      </div>
    );
  }
  return (
    <form action={action} className="mt-8 flex flex-col gap-5" data-testid="affiliate-form">
      <AuthField label="Your name" required>
        <input name="name" type="text" required maxLength={80} autoComplete="name" data-testid="aff-name" />
      </AuthField>
      <AuthField label="Your email" required>
        <input name="email" type="email" required maxLength={120} autoComplete="email" data-testid="aff-email" />
      </AuthField>
      <AuthField label="How would you tell people about us? (optional)">
        <textarea name="about" rows={4} maxLength={600} data-testid="aff-about" />
      </AuthField>
      <HumanCheck />
      {state?.error && <AuthError>{state.error}</AuthError>}
      <button type="submit" disabled={pending} className={authBtnPrimary} data-testid="aff-submit">{pending ? "Sending..." : "Send my request"}</button>
    </form>
  );
}
