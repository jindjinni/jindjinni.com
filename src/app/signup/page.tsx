"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { signUpOrganization, type ActionState } from "@/app/actions/auth";
import { sendSignupVerificationCode, type SendCodeState } from "@/app/actions/email-verification";
import { Field, Section } from "@/components/form-section";
import { BusinessProfileSignupFields } from "@/components/business-profile-signup-fields";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

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
    <div className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Create your account</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Sets up your own organization -- your data stays completely separate from every other company on here.
          We&rsquo;ll also set up your Business Profile now, since it&rsquo;s reused throughout the system (quotation
          receipts and more) -- most of it is required, a few fields are optional.
        </p>

        <form ref={formRef} onSubmit={handleCreateAccount} className="mt-6 flex flex-col gap-6">
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
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={sendPending || !accountEmail}
                  className="rounded-md border border-emerald-700 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-500 dark:text-emerald-400 dark:hover:bg-emerald-950"
                >
                  {sendPending
                    ? "Sending..."
                    : codeSentFor && !codeStale
                      ? "Resend code"
                      : "Send verification code"}
                </button>
                {codeSentFor && !codeStale && (
                  <span className="text-sm text-emerald-700 dark:text-emerald-400">
                    Code sent to {codeSentFor} -- check your inbox.
                  </span>
                )}
              </div>
              {sendState?.error && <p className="text-sm text-red-600 dark:text-red-400">{sendState.error}</p>}

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
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  You changed the email -- send a new code to this address before creating the account.
                </p>
              )}
            </div>
          </Section>

          <BusinessProfileSignupFields accountName={accountName} accountEmail={accountEmail} />

          {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}

          <button
            type="submit"
            disabled={pending || !codeSentFor || codeStale}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            {pending ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-emerald-700 dark:text-emerald-400">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
