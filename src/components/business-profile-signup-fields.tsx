"use client";

import { useRef, useState } from "react";
import { Field, Section } from "@/components/form-section";
import { AddressAutocompleteFields } from "@/components/address-autocomplete-fields";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

/**
 * The Business Profile, collected up front when a new company signs up
 * (per how this was asked: most of it mandatory -- logo, addresses,
 * contact details -- with a few fields, like Tax ID/EIN, left optional).
 * Shared between the signup page and the rare safety-net onboarding page
 * (a signed-in user with no organization yet) so both create a complete
 * profile, not a half-empty one.
 *
 * `accountName` / `accountEmail` are the live values of the account-holder
 * fields on the page using this component (if any) -- Business Email and
 * the Primary Contact's name/email start out mirroring them, since at
 * signup the account holder usually *is* the primary contact, but each
 * field stops mirroring the moment someone edits it directly.
 */
export function BusinessProfileSignupFields({
  accountName = "",
  accountEmail = "",
}: {
  accountName?: string;
  accountEmail?: string;
}) {
  const [shippingSame, setShippingSame] = useState(true);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [businessEmailOverride, setBusinessEmailOverride] = useState("");
  const [businessEmailTouched, setBusinessEmailTouched] = useState(false);
  const businessEmail = businessEmailTouched ? businessEmailOverride : accountEmail;

  const [accountFirst, ...accountLastParts] = accountName.trim().split(/\s+/).filter(Boolean);
  const accountLast = accountLastParts.join(" ");

  const [contactFirstOverride, setContactFirstOverride] = useState("");
  const [contactFirstTouched, setContactFirstTouched] = useState(false);
  const contactFirst = contactFirstTouched ? contactFirstOverride : accountFirst ?? "";

  const [contactLastOverride, setContactLastOverride] = useState("");
  const [contactLastTouched, setContactLastTouched] = useState(false);
  const contactLast = contactLastTouched ? contactLastOverride : accountLast ?? "";

  const [contactEmailOverride, setContactEmailOverride] = useState("");
  const [contactEmailTouched, setContactEmailTouched] = useState(false);
  const contactEmail = contactEmailTouched ? contactEmailOverride : accountEmail;

  return (
    <>
      <Section title="Business Identity">
        <Field label="Official Legal Business Name">
          <input name="companyName" required className={inputClass} />
        </Field>
        <Field label="DBA / Trade Name" hint="Optional -- the name customers know you by, if different.">
          <input name="dbaName" className={inputClass} />
        </Field>
        <div className="flex items-center gap-4 sm:col-span-2">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoPreview} alt="Logo preview" className="h-full w-full object-contain" />
            ) : (
              <span className="px-1 text-center text-[9px] text-slate-400">No logo yet</span>
            )}
          </div>
          <Field label="Company Logo" hint="Required -- PNG or JPG, up to 2MB. Used on quotation receipts and throughout the system.">
            <input
              ref={logoInputRef}
              type="file"
              name="logo"
              accept="image/png,image/jpeg"
              required
              onChange={() => {
                const file = logoInputRef.current?.files?.[0];
                setLogoPreview(file ? URL.createObjectURL(file) : null);
              }}
              className="text-sm text-slate-600 dark:text-slate-400"
            />
          </Field>
        </div>
      </Section>

      <Section title="Business Address" description="Your company's official mailing address.">
        <AddressAutocompleteFields prefix="businessAddress" required />
        <Field label="Country">
          <input name="businessAddressCountry" defaultValue="US" className={inputClass} />
        </Field>
      </Section>

      <Section
        title="Shipping / Operating Address"
        description="Where packages are physically sent and received, if different from the business address."
      >
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            name="shippingSameAsBusiness"
            checked={shippingSame}
            onChange={(e) => setShippingSame(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          <span className="text-slate-700 dark:text-slate-300">Same as Business Address</span>
        </label>
        {!shippingSame && (
          <>
            <AddressAutocompleteFields prefix="shippingAddress" required />
            <Field label="Country">
              <input name="shippingAddressCountry" defaultValue="US" className={inputClass} />
            </Field>
          </>
        )}
      </Section>

      <Section title="Business Contact Information">
        <Field label="Main Business Phone Number">
          <input name="businessPhone" type="tel" required className={inputClass} />
        </Field>
        <Field label="Main Business Email">
          <input
            name="businessEmail"
            type="email"
            required
            value={businessEmail}
            onChange={(e) => {
              setBusinessEmailTouched(true);
              setBusinessEmailOverride(e.target.value);
            }}
            className={inputClass}
          />
        </Field>
        <Field label="Website" hint="Optional.">
          <input name="website" className={inputClass} />
        </Field>
      </Section>

      <Section
        title="Primary Contact Person"
        description="The main person responsible for this account -- not every employee who'll use the system. Defaults to you; edit if someone else should be listed."
      >
        <Field label="First Name">
          <input
            name="primaryContactFirstName"
            required
            value={contactFirst}
            onChange={(e) => {
              setContactFirstTouched(true);
              setContactFirstOverride(e.target.value);
            }}
            className={inputClass}
          />
        </Field>
        <Field label="Last Name">
          <input
            name="primaryContactLastName"
            required
            value={contactLast}
            onChange={(e) => {
              setContactLastTouched(true);
              setContactLastOverride(e.target.value);
            }}
            className={inputClass}
          />
        </Field>
        <Field label="Job Title / Position" hint="Optional.">
          <input name="primaryContactTitle" className={inputClass} />
        </Field>
        <Field label="Email">
          <input
            name="primaryContactEmail"
            type="email"
            required
            value={contactEmail}
            onChange={(e) => {
              setContactEmailTouched(true);
              setContactEmailOverride(e.target.value);
            }}
            className={inputClass}
          />
        </Field>
        <Field label="Phone Number">
          <input name="primaryContactPhone" type="tel" required className={inputClass} />
        </Field>
      </Section>

      <Section title="Optional Business Information" description="Not required -- add only if applicable.">
        <Field label="Tax ID / EIN">
          <input name="taxId" className={inputClass} />
        </Field>
        <Field label="Business Registration Number">
          <input name="businessRegistrationNumber" className={inputClass} />
        </Field>
      </Section>
    </>
  );
}
