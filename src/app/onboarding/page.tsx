"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { createOrganization, type ActionState } from "@/app/actions/onboarding";
import { BusinessProfileSignupFields } from "@/components/business-profile-signup-fields";

export default function OnboardingPage() {
  // Called directly rather than through <form action={...}>/useActionState
  // -- see the matching note in src/app/signup/page.tsx for why: React 19
  // resets every uncontrolled field in the form (logo file, phone numbers,
  // tax ID, ...) back to empty the moment an Actions-API-bound action
  // resolves, including on a validation error, which on this long form
  // meant one mistake wiped everything. A classic onSubmit handler still
  // gets native required-field validation for free; it just isn't tied to
  // that reset behavior.
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<ActionState>(undefined);
  const [pending, startCreate] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    startCreate(async () => {
      const result = await createOrganization(undefined, formData);
      setState(result);
    });
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Set up your company</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          You&apos;re signed in, but not attached to an organization yet. Most of this Business Profile is required --
          a few fields are optional.
        </p>

        <form ref={formRef} onSubmit={handleSubmit} className="mt-6 flex flex-col gap-6">
          <BusinessProfileSignupFields />

          {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            {pending ? "Creating organization..." : "Create organization"}
          </button>
        </form>
      </div>
    </div>
  );
}
