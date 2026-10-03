"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signUpOrganization } from "@/app/actions/auth";
import { Field, Section } from "@/components/form-section";
import { BusinessProfileSignupFields } from "@/components/business-profile-signup-fields";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

export default function SignupPage() {
  const [state, action, pending] = useActionState(signUpOrganization, undefined);
  const [accountName, setAccountName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");

  return (
    <div className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Create your account</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Sets up your own organization -- your data stays completely separate from every other company on here.
          We&rsquo;ll also set up your Business Profile now, since it&rsquo;s reused throughout the system (quotation
          receipts and more) -- most of it is required, a few fields are optional.
        </p>

        <form action={action} className="mt-6 flex flex-col gap-6">
          <Section title="Your Account">
            <Field label="Your Name">
              <input name="name" value={accountName} onChange={(e) => setAccountName(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Email">
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
          </Section>

          <BusinessProfileSignupFields accountName={accountName} accountEmail={accountEmail} />

          {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}

          <button
            type="submit"
            disabled={pending}
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
