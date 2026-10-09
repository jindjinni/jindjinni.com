"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { createOrganization, type ActionState } from "@/app/actions/onboarding";
import { AuthCard, AuthError, AuthSection as Section, AuthShell, authBtnPrimary } from "@/components/auth/auth-ui";
import { Icon } from "@/components/landing/icons";
import { BusinessProfileSignupFields } from "@/components/business-profile-signup-fields";
import { OperationTypeField } from "@/components/operation-type-field";
import { RequiredLegend, RequiredMarks } from "@/components/required-marks";

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
    <AuthShell>
      <AuthCard className="max-w-3xl p-6 sm:p-10">
        <p className="inline-flex rounded-full border border-mint-line bg-mint px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-brand-deep">
          One last step
        </p>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Set up your company</h1>
        <p className="mt-3 max-w-2xl text-base text-muted">
          You&apos;re signed in, but not attached to an organization yet. Most of this Business Profile is required --
          a few fields are optional.
        </p>

        <RequiredMarks>
        <form ref={formRef} onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6">
          <RequiredLegend />
          <BusinessProfileSignupFields />

          <Section title="How Your Company Operates" description="This sets up your Purchasing department with the right documents. You can change it later in Settings.">
            <OperationTypeField />
          </Section>

          {state?.error && <AuthError>{state.error}</AuthError>}

          <button type="submit" disabled={pending} className={authBtnPrimary}>
            {pending ? "Creating organization..." : "Create organization"}
            {!pending && <Icon name="arrow" className="h-5 w-5" />}
          </button>
        </form>
        </RequiredMarks>
      </AuthCard>
    </AuthShell>
  );
}
