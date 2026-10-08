"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { resubmitVerification, type ResubmitState } from "@/app/actions/verification";
import { AuthError, authBtnPrimary } from "@/components/auth/auth-ui";
import { BusinessVerificationFields } from "@/components/business-verification-fields";

// Called as a plain function from onSubmit (not through the form's action) so a mistake never wipes the file picker and
// the typed fields -- the same reason the sign-up form does it this way.
export function ResubmitForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<ResubmitState>(undefined);
  const [pending, start] = useTransition();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    start(async () => setState(await resubmitVerification(undefined, fd)));
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="mt-6 flex flex-col gap-5" data-testid="resubmit-form">
      <BusinessVerificationFields />
      {state?.error && <AuthError>{state.error}</AuthError>}
      <button type="submit" disabled={pending} className={authBtnPrimary}>
        {pending ? "Sending..." : "Send my details again"}
      </button>
    </form>
  );
}
