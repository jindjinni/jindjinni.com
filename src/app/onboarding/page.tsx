"use client";

import { useActionState } from "react";
import { createOrganization } from "@/app/actions/onboarding";
import { BusinessProfileSignupFields } from "@/components/business-profile-signup-fields";

export default function OnboardingPage() {
  const [state, action, pending] = useActionState(createOrganization, undefined);

  return (
    <div className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Set up your company</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          You&apos;re signed in, but not attached to an organization yet. Most of this Business Profile is required --
          a few fields are optional.
        </p>

        <form action={action} className="mt-6 flex flex-col gap-6">
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
