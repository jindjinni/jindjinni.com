"use client";

import { useActionState, useState } from "react";
import { submitPayoutDetailsAction } from "@/app/actions/payout-link-public";
import { AuthError, AuthField, authBtnPrimary } from "@/components/auth/auth-ui";
import { HumanCheck } from "@/components/human-check";
import { CAUTION_TEXT, FINTECH_NOTE, METHOD_HELP, ONE_TIME_TEXT, PAYOUT_METHODS, type PayoutMethod } from "@/lib/payout-link-rules";

const empty = { method: "", holderName: "", street1: "", street2: "", city: "", state: "", zip: "", phone: "", email: "", bankName: "", routingNumber: "", accountNumber: "", accountType: "", confirmDetails: false };

export function PaymentDetailsForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(submitPayoutDetailsAction.bind(null, token), undefined);
  // Controlled, so everything typed is still there after an error (React clears uncontrolled fields after every submit).
  const [v, setV] = useState(empty);
  const on = (k: Exclude<keyof typeof empty, "confirmDetails">) => ({ name: k, value: v[k], onChange: (e: { target: { value: string } }) => setV((o) => ({ ...o, [k]: e.target.value })) });
  if (state?.done) {
    return (
      <div className="mt-8 rounded-2xl border border-line p-6" data-testid="pl-sent">
        <h2 className="text-2xl font-extrabold text-ink">Thank you, we got your details</h2>
        <p className="mt-2 text-base text-muted">We will use them to pay you. You can close this page. This link can only be used once, so it can&apos;t be opened again. If you made a mistake, please contact us and we will send you a new link.</p>
      </div>
    );
  }
  const routingDigits = v.routingNumber.replace(/\D/g, "").length;
  const routingBad = v.routingNumber.trim() !== "" && routingDigits !== 9;
  const radio = "flex items-center gap-2 rounded-xl border border-line px-4 py-3 text-sm font-semibold has-[:checked]:border-ink has-[:checked]:bg-mint";
  return (
    <form action={action} className="mt-8 flex flex-col gap-6" noValidate={false} data-testid="pl-form" autoComplete="off">
      <div className="rounded-xl border-2 border-ink p-4 text-sm text-ink" data-testid="pl-caution">
        <p className="font-extrabold uppercase tracking-wide">{CAUTION_TEXT}</p>
        <p className="mt-2 font-semibold" data-testid="pl-onetime">{ONE_TIME_TEXT}</p>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">How do you want to be paid? Choose one.</legend>
        <p className="mb-3 rounded-xl bg-mint p-3 text-sm text-ink" data-testid="pl-fintech-note">{FINTECH_NOTE}</p>
        <div className="grid gap-3 sm:grid-cols-4">
          {PAYOUT_METHODS.map((m) => (
            <label key={m.key} className={radio}>
              <input type="radio" name="method" value={m.key} checked={v.method === m.key} required onChange={() => setV((o) => ({ ...o, method: m.key }))} data-testid={`pl-method-${m.key}`} />
              {m.label}
            </label>
          ))}
        </div>
        {v.method && <p className="mt-3 text-sm text-muted" data-testid="pl-method-help">{METHOD_HELP[v.method as PayoutMethod]}</p>}
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2"><AuthField label="Full name of the account holder" hint="The real name of the person who owns the account"><input {...on("holderName")} required maxLength={100} autoComplete="off" data-testid="pl-holder" /></AuthField></div>
        <AuthField label="Phone number"><input {...on("phone")} type="tel" required maxLength={40} autoComplete="off" data-testid="pl-phone" /></AuthField>
        <AuthField label="Email address"><input {...on("email")} type="email" required maxLength={200} autoComplete="off" data-testid="pl-email" /></AuthField>
      </div>
      <fieldset className="grid gap-5 sm:grid-cols-6">
        <legend className="mb-2 text-sm font-medium">Address of the account holder (required)</legend>
        <div className="sm:col-span-6"><AuthField label="Street address"><input {...on("street1")} required maxLength={120} autoComplete="off" data-testid="pl-street1" /></AuthField></div>
        <div className="sm:col-span-6"><AuthField label="Apartment or suite" hint="Only if the address has one"><input {...on("street2")} maxLength={120} autoComplete="off" /></AuthField></div>
        <div className="sm:col-span-3"><AuthField label="City"><input {...on("city")} required maxLength={80} autoComplete="off" data-testid="pl-city" /></AuthField></div>
        <div className="sm:col-span-1"><AuthField label="State"><input {...on("state")} required maxLength={2} autoComplete="off" placeholder="TX" data-testid="pl-state" /></AuthField></div>
        <div className="sm:col-span-2"><AuthField label="ZIP"><input {...on("zip")} required maxLength={10} inputMode="numeric" autoComplete="off" data-testid="pl-zip" /></AuthField></div>
      </fieldset>
      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">Bank details</legend>
        <div className="sm:col-span-2"><AuthField label="Bank name" hint={v.method && v.method !== "bank" ? "The bank name your app shows next to the routing number" : undefined}><input {...on("bankName")} required maxLength={100} autoComplete="off" data-testid="pl-bank" /></AuthField></div>
        <AuthField label="Routing number" hint={routingBad ? undefined : "Exactly 9 digits"}><input {...on("routingNumber")} required inputMode="numeric" maxLength={14} autoComplete="off" data-testid="pl-routing" aria-invalid={routingBad} />{routingBad && <span className="text-xs font-semibold text-red-700" role="alert" data-testid="pl-routing-warn">A routing number has exactly 9 digits (you typed {routingDigits}). It will not go through otherwise.</span>}</AuthField>
        <AuthField label="Account number" hint="4 to 17 digits"><input {...on("accountNumber")} required inputMode="numeric" maxLength={22} autoComplete="off" data-testid="pl-account" /></AuthField>
        <div className="sm:col-span-2">
          <p className="mb-2 text-sm font-medium">Account type</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["checking", "savings"] as const).map((t) => (
              <label key={t} className={radio}>
                <input type="radio" name="accountType" value={t} checked={v.accountType === t} required onChange={() => setV((o) => ({ ...o, accountType: t }))} data-testid={`pl-type-${t}`} />
                {t === "checking" ? "Checking" : "Savings"}
              </label>
            ))}
          </div>
        </div>
      </fieldset>
      <label className="flex items-start gap-3 text-sm font-semibold">
        <input type="checkbox" name="confirmDetails" checked={v.confirmDetails} onChange={(e) => setV((o) => ({ ...o, confirmDetails: e.target.checked }))} className="mt-1 h-4 w-4" data-testid="pl-confirm" />
        <span>I double checked every detail above. I understand this is a one-time submission and I cannot change anything after I submit. We will pay by direct deposit to this account.</span>
      </label>
      <HumanCheck />
      {state?.error && <AuthError>{state.error}</AuthError>}
      <button type="submit" disabled={pending} className={authBtnPrimary} data-testid="pl-submit">{pending ? "Sending..." : "Submit my details (one time only)"}</button>
    </form>
  );
}
