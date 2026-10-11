"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { applyAction } from "@/app/actions/storefront-buyers";
import { AuthError, AuthField, authBtnPrimary } from "@/components/auth/auth-ui";
import { HumanCheck } from "@/components/human-check";

const EMPTY = { businessName: "", contactName: "", email: "", phone: "", street1: "", street2: "", city: "", state: "", zip: "", npi: "", deaNumber: "", licenseNumber: "", licenseState: "", notes: "" };

export function ApplyForm({ handle }: { handle: string }) {
  const [state, action, pending] = useActionState(applyAction.bind(null, handle), undefined);
  // Controlled, so everything typed is still there after an error (React clears uncontrolled fields after every submit).
  const [v, setV] = useState(EMPTY);
  const on = (k: keyof typeof EMPTY) => ({ name: k, value: v[k], onChange: (e: { target: { value: string } }) => setV((o) => ({ ...o, [k]: e.target.value })) });
  if (state?.received) {
    return (
      <div className="mt-8 rounded-2xl border border-line p-6" data-testid="ap-received">
        <h2 className="text-2xl font-extrabold text-ink">Thank you, we got your application</h2>
        <p className="mt-2 text-base text-muted">We will review it and check your license. If you are approved, we will email you a link to sign in. Nothing else is needed from you right now.</p>
        <Link href={`/s/${handle}`} className={`${authBtnPrimary} mt-6 !w-auto`}>Back to the page</Link>
      </div>
    );
  }
  return (
    <form action={action} className="mt-8 flex flex-col gap-5" data-testid="ap-form">
      <div className="grid gap-5 sm:grid-cols-2">
        <AuthField label="Pharmacy name"><input {...on("businessName")} required maxLength={120} autoComplete="organization" data-testid="ap-business" /></AuthField>
        <AuthField label="Contact person"><input {...on("contactName")} required maxLength={100} autoComplete="name" data-testid="ap-contact" /></AuthField>
        <AuthField label="Email" hint="Your sign-in link is sent here."><input {...on("email")} type="email" required maxLength={200} autoComplete="email" data-testid="ap-email" /></AuthField>
        <AuthField label="Phone" hint="Optional"><input {...on("phone")} type="tel" maxLength={40} autoComplete="tel" /></AuthField>
      </div>
      <fieldset className="grid gap-5 sm:grid-cols-6">
        <legend className="mb-2 text-sm font-medium">Pharmacy address</legend>
        <div className="sm:col-span-6"><AuthField label="Street address"><input {...on("street1")} required maxLength={120} autoComplete="address-line1" data-testid="ap-street1" /></AuthField></div>
        <div className="sm:col-span-6"><AuthField label="Suite, unit" hint="Optional"><input {...on("street2")} maxLength={120} autoComplete="address-line2" /></AuthField></div>
        <div className="sm:col-span-3"><AuthField label="City"><input {...on("city")} required maxLength={80} autoComplete="address-level2" data-testid="ap-city" /></AuthField></div>
        <div className="sm:col-span-1"><AuthField label="State"><input {...on("state")} required maxLength={2} autoComplete="address-level1" placeholder="TX" data-testid="ap-state" /></AuthField></div>
        <div className="sm:col-span-2"><AuthField label="ZIP"><input {...on("zip")} required maxLength={10} autoComplete="postal-code" inputMode="numeric" data-testid="ap-zip" /></AuthField></div>
      </fieldset>
      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">Pharmacy identification</legend>
        <AuthField label="NPI" hint="10 digits"><input {...on("npi")} required inputMode="numeric" maxLength={12} data-testid="ap-npi" /></AuthField>
        <AuthField label="DEA registration number" hint="Two letters and seven digits"><input {...on("deaNumber")} required maxLength={12} autoCapitalize="characters" data-testid="ap-dea" /></AuthField>
        <AuthField label="State pharmacy license number"><input {...on("licenseNumber")} required maxLength={40} data-testid="ap-license" /></AuthField>
        <AuthField label="State that issued the license"><input {...on("licenseState")} required maxLength={2} placeholder="TX" data-testid="ap-licstate" /></AuthField>
      </fieldset>
      <AuthField label="Anything else we should know?" hint="Optional"><textarea {...on("notes")} rows={3} maxLength={1000} /></AuthField>
      <HumanCheck />
      {state?.error && <AuthError>{state.error}</AuthError>}
      <button type="submit" disabled={pending} className={authBtnPrimary} data-testid="ap-submit">{pending ? "Sending..." : "Send my application"}</button>
    </form>
  );
}
