"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { submitSellRequestAction } from "@/app/actions/storefront-public";
import { AuthError, AuthField, authBtnPrimary } from "@/components/auth/auth-ui";
import { HumanCheck } from "@/components/human-check";

export function SellForm({ handle }: { handle: string }) {
  const [state, action, pending] = useActionState(submitSellRequestAction.bind(null, handle), undefined);
  // Controlled, so everything typed is still there after an error (React clears uncontrolled fields after every submit).
  const [v, setV] = useState({ businessName: "", contactName: "", email: "", phone: "", street1: "", street2: "", city: "", state: "", zip: "", itemsText: "", notes: "" });
  const on = (k: keyof typeof v) => ({ name: k, value: v[k], onChange: (e: { target: { value: string } }) => setV((o) => ({ ...o, [k]: e.target.value })) });
  if (state?.reference) {
    return (
      <div className="mt-8 rounded-2xl border border-line p-6" data-testid="sf-sent">
        <h2 className="text-2xl font-extrabold text-ink">Thank you, we got it</h2>
        <p className="mt-2 text-base text-muted">Your reference is <span className="font-mono font-extrabold text-ink" data-testid="sf-reference">{state.reference}</span>. Keep it if you need to ask about this request. We will reply by email.</p>
        <Link href={`/s/${handle}`} className={`${authBtnPrimary} mt-6 !w-auto`}>Back to the page</Link>
      </div>
    );
  }
  return (
    <form action={action} className="mt-8 flex flex-col gap-5" data-testid="sf-sell-form">
      <div className="grid gap-5 sm:grid-cols-2">
        <AuthField label="Business name"><input {...on("businessName")} required maxLength={120} autoComplete="organization" data-testid="sf-business" /></AuthField>
        <AuthField label="Contact person"><input {...on("contactName")} required maxLength={100} autoComplete="name" data-testid="sf-contact" /></AuthField>
        <AuthField label="Email"><input {...on("email")} type="email" required maxLength={200} autoComplete="email" data-testid="sf-email" /></AuthField>
        <AuthField label="Phone" hint="Optional"><input {...on("phone")} type="tel" maxLength={40} autoComplete="tel" data-testid="sf-phone" /></AuthField>
      </div>
      <fieldset className="grid gap-5 sm:grid-cols-6">
        <legend className="mb-2 text-sm font-medium">Where should we send the quotation and, if you accept, the shipping label?</legend>
        <div className="sm:col-span-6"><AuthField label="Street address"><input {...on("street1")} required maxLength={120} autoComplete="address-line1" data-testid="sf-street1" /></AuthField></div>
        <div className="sm:col-span-6"><AuthField label="Suite, unit" hint="Optional"><input {...on("street2")} maxLength={120} autoComplete="address-line2" /></AuthField></div>
        <div className="sm:col-span-3"><AuthField label="City"><input {...on("city")} required maxLength={80} autoComplete="address-level2" data-testid="sf-city" /></AuthField></div>
        <div className="sm:col-span-1"><AuthField label="State"><input {...on("state")} required maxLength={2} autoComplete="address-level1" placeholder="TX" data-testid="sf-state" /></AuthField></div>
        <div className="sm:col-span-2"><AuthField label="ZIP"><input {...on("zip")} required maxLength={10} autoComplete="postal-code" inputMode="numeric" data-testid="sf-zip" /></AuthField></div>
      </fieldset>
      <AuthField label="What do you have?" hint="Product names, how many, and expiry dates if you know them. One product per line works well.">
        <textarea {...on("itemsText")} required rows={7} maxLength={4000} data-testid="sf-items" />
      </AuthField>
      <AuthField label="Anything else we should know?" hint="Optional"><textarea {...on("notes")} rows={3} maxLength={1000} data-testid="sf-notes" /></AuthField>
      <HumanCheck />
      {state?.error && <AuthError>{state.error}</AuthError>}
      <button type="submit" disabled={pending} className={authBtnPrimary} data-testid="sf-submit">{pending ? "Sending..." : "Send my request"}</button>
    </form>
  );
}
