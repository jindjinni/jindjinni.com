"use client";

import { AuthField as Field, AuthSection as Section } from "@/components/auth/auth-ui";
import { BUSINESS_TYPES, ENTITY_TYPES, MAX_PROOF_BYTES, MIN_DESCRIPTION, PROOF_TYPES, US_STATES } from "@/lib/business-verification-options";

// Field styling comes from the .auth-theme scope in globals.css.
const inputClass = "";

/**
 * The details that prove the company is real. Required: the platform owner reads them (and the proof document) before a new
 * company is approved. Shared by the sign-up page, the safety-net onboarding page and the "fix and resubmit" form.
 */
export function BusinessVerificationFields() {
  const thisYear = new Date().getFullYear();
  return (
    <Section
      title="Verify Your Business"
      description="We only work with real, registered businesses. Everything here is required, and a person reviews it before your account is switched on. Only the platform owner can see it."
    >
      <div className="rounded-xl border border-mint-line bg-mint p-4 text-sm text-ink" data-testid="match-notice">
        <p className="font-bold">Everything must match your official records.</p>
        <p className="mt-1">
          The business name, address, EIN, state file number and business structure (LLC, corporation and so on) must be exactly what is on your IRS letter and your state registration. We check them against your proof document and the state&rsquo;s records. The person signing up must be the owner or managing owner named on those records. Details that don&rsquo;t match will be turned down.
        </p>
        <p className="mt-2" data-testid="active-notice">
          <strong>We only work with active companies.</strong> Your business must be active and in good standing with your state&rsquo;s Secretary of State. We check it, and if we find your company is inactive we may suspend your account until it is active again.
        </p>
      </div>
      <Field label="EIN (Employer Identification Number)" hint="9 digits from your IRS letter, like 12-3456789.">
        <input name="ein" required inputMode="numeric" autoComplete="off" placeholder="12-3456789" pattern="\s*\d{2}-?\d{7}\s*" title="9 digits, like 12-3456789" className={inputClass} />
      </Field>
      <Field label="State your business is registered in">
        <select name="registeredState" required defaultValue="" className={inputClass}>
          <option value="" disabled>Choose a state</option>
          {US_STATES.map((s) => (
            <option key={s.code} value={s.code}>{s.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Business structure">
        <select name="entityType" required defaultValue="" className={inputClass}>
          <option value="" disabled>Choose one</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="State registration / file number" hint="The number on your state business filing (often called the file, entity or charter number).">
        <input name="stateFileNumber" required minLength={3} maxLength={40} autoComplete="off" className={inputClass} />
      </Field>
      <Field label="Year your business was formed">
        <input name="yearFormed" type="number" required min={1900} max={thisYear} inputMode="numeric" placeholder={String(thisYear - 3)} className={inputClass} />
      </Field>
      <Field label="What kind of business is it?">
        <select name="businessType" required defaultValue="" className={inputClass}>
          <option value="" disabled>Choose one</option>
          {BUSINESS_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="What does your business do?" hint={`A sentence or two, at least ${MIN_DESCRIPTION} characters.`}>
          <textarea name="businessDescription" required minLength={MIN_DESCRIPTION} maxLength={600} rows={3} className={inputClass} />
        </Field>
      </div>
      <Field label="Proof document type">
        <select name="proofType" required defaultValue="" className={inputClass}>
          <option value="" disabled>Choose one</option>
          {PROOF_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="Upload the document" hint={`PDF, PNG or JPG, up to ${Math.round(MAX_PROOF_BYTES / 1024 / 1024)}MB. The name and EIN must be readable and match what you entered.`}>
        <input name="proof" type="file" required accept="application/pdf,image/png,image/jpeg" />
      </Field>
    </Section>
  );
}
