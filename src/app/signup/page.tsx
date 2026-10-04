"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { signUpOrganization, type ActionState } from "@/app/actions/auth";
import { sendSignupVerificationCode, type SendCodeState } from "@/app/actions/email-verification";
import { AuthCard, AuthError, AuthField as Field, AuthSection as Section, AuthShell, authBtnPrimary, authBtnSecondary } from "@/components/auth/auth-ui";
import { Icon } from "@/components/landing/icons";
import { BusinessProfileSignupFields } from "@/components/business-profile-signup-fields";

// Field styling comes from the .auth-theme scope in globals.css.
const inputClass = "";

export default function SignupPage() {
  // Both server actions are called directly here instead of through
  // <form action={...}>/useActionState -- React 19 resets every
  // UNCONTROLLED field in a form (password, logo file, phone numbers, tax
  // ID, ...) back to its defaultValue the moment an action bound to that
  // form resolves, success OR error. On this form that meant: click "Send
  // code" and your typed password vanished; mistype one field and the
  // ENTIRE form -- logo included -- wiped itself. Calling the actions as
  // plain functions from a classic onSubmit/onClick handler sidesteps that
  // reset entirely while keeping native required-field validation (it still
  // runs on submit; it's just not tied to the Actions API anymore).
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<ActionState>(undefined);
  const [pending, startCreate] = useTransition();
  const [sendState, setSendState] = useState<SendCodeState>(undefined);
  const [sendPending, startSend] = useTransition();
  const [accountName, setAccountName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");

  // A code sent for one email shouldn't look "sent" anymore once the person
  // edits the address afterward -- otherwise they could type a code that
  // only matches an email they've since changed away from.
  const codeSentFor = sendState?.sent ? sendState.sentTo : undefined;
  const codeStale = codeSentFor !== undefined && codeSentFor !== accountEmail.toLowerCase().trim();

  function handleSendCode() {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    startSend(async () => {
      const result = await sendSignupVerificationCode(undefined, formData);
      setSendState(result);
    });
  }

  function handleCreateAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    startCreate(async () => {
      const result = await signUpOrganization(undefined, formData);
      setState(result);
    });
  }

  return (
    <AuthShell headerLink={{ prompt: "Already have an account?", label: "Sign In", href: "/login" }}>
      <AuthCard className="max-w-3xl p-6 sm:p-10">
        <p className="inline-flex rounded-full border border-mint-line bg-mint px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-brand-deep">
          Get started
        </p>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Create your account</h1>
        <p className="mt-3 max-w-2xl text-base text-muted">
          Sets up your own organization -- your data stays completely separate from every other company on here.
          We&rsquo;ll also set up your Business Profile now, since it&rsquo;s reused throughout the system (quotation
          receipts and more) -- most of it is required, a few fields are optional.
        </p>

        <form ref={formRef} onSubmit={handleCreateAccount} className="mt-8 flex flex-col gap-6">
          <Section title="Your Account">
            <Field label="Your Name">
              <input name="name" value={accountName} onChange={(e) => setAccountName(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Email" hint="We'll send a verification code here -- it has to be a real, reachable inbox.">
              <input
                name="email"
                type="email"
                required
                value={accountEmail}
                onChange={(e) => setAccountEmail(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Password" hint="At least 8 characters.">
              <input name="password" type="password" minLength={8} required className={inputClass} />
            </Field>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={sendPending || !accountEmail}
                  className={authBtnSecondary}
                >
                  {sendPending
                    ? "Sending..."
                    : codeSentFor && !codeStale
                      ? "Resend code"
                      : "Send verification code"}
                </button>
                {codeSentFor && !codeStale && (
                  <span className="text-sm font-semibold text-brand-deep">
                    Code sent to {codeSentFor} -- check your inbox.
                  </span>
                )}
              </div>
              {sendState?.error && <AuthError>{sendState.error}</AuthError>}

              {codeSentFor && !codeStale && (
                <Field label="Verification Code" hint="The 6-digit code we just emailed you.">
                  <input
                    name="verificationCode"
                    required
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    autoComplete="one-time-code"
                    className={inputClass}
                  />
                </Field>
              )}
              {codeStale && (
                <p className="text-xs font-semibold text-amber-700">
                  You changed the email -- send a new code to this address before creating the account.
                </p>
              )}
            </div>
          </Section>

          <BusinessProfileSignupFields accountName={accountName} accountEmail={accountEmail} />

          {state?.error && <AuthError>{state.error}</AuthError>}

          <button
            type="submit"
            disabled={pending || !codeSentFor || codeStale}
            className={authBtnPrimary}
          >
            {pending ? "Creating account..." : "Create account"}
            {!pending && <Icon name="arrow" className="h-5 w-5" />}
          </button>
        </form>

        <p className="mt-8 border-t border-line pt-6 text-sm font-semibold text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-extrabold text-ink underline decoration-brand decoration-2 underline-offset-4 hover:decoration-ink">
            Sign in
          </Link>
        </p>
      </AuthCard>
    </AuthShell>
  );
}
