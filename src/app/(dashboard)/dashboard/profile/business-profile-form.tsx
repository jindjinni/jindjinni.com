"use client";

import { useActionState, useState } from "react";
import { updateBusinessProfile, type ActionState } from "@/app/actions/business-profile";
import type { BusinessProfile } from "@/lib/queries";
import { AddressAutocompleteFields } from "@/components/address-autocomplete-fields";
import { Field, Section } from "@/components/form-section";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

export function BusinessProfileForm({
  organizationName,
  profile,
}: {
  organizationName: string;
  profile: BusinessProfile | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateBusinessProfile, undefined);
  const [shippingSame, setShippingSame] = useState(profile?.shippingSameAsBusiness ?? true);

  return (
    <form action={formAction} className="mt-6 space-y-6">
      <Section title="Business Identity">
        <Field label="Official Legal Business Name">
          <input name="legalName" required defaultValue={organizationName} className={inputClass} />
        </Field>
        <Field label="DBA / Trade Name" hint="Optional -- the name customers know you by, if different.">
          <input name="dbaName" defaultValue={profile?.dbaName ?? ""} className={inputClass} />
        </Field>
        <Field label="Name shown on customer-facing documents" hint="Which name a quotation receipt displays.">
          <select name="nameDisplayPreference" defaultValue={profile?.nameDisplayPreference ?? "legal"} className={inputClass}>
            <option value="legal">Legal Business Name</option>
            <option value="dba">DBA / Trade Name</option>
            <option value="both">Both</option>
          </select>
        </Field>
      </Section>

      <Section title="Business Address" description="Your company's official mailing address.">
        <AddressAutocompleteFields
          prefix="businessAddress"
          defaultValues={{
            street1: profile?.businessAddressStreet1,
            street2: profile?.businessAddressStreet2,
            city: profile?.businessAddressCity,
            state: profile?.businessAddressState,
            zip: profile?.businessAddressZip,
          }}
        />
        <Field label="Country">
          <input name="businessAddressCountry" defaultValue={profile?.businessAddressCountry ?? "US"} className={inputClass} />
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
            <AddressAutocompleteFields
              prefix="shippingAddress"
              defaultValues={{
                street1: profile?.shippingAddressStreet1,
                street2: profile?.shippingAddressStreet2,
                city: profile?.shippingAddressCity,
                state: profile?.shippingAddressState,
                zip: profile?.shippingAddressZip,
              }}
            />
            <Field label="Country">
              <input name="shippingAddressCountry" defaultValue={profile?.shippingAddressCountry ?? "US"} className={inputClass} />
            </Field>
          </>
        )}
      </Section>

      <Section title="Business Contact Information">
        <Field label="Main Business Phone Number">
          <input name="businessPhone" type="tel" defaultValue={profile?.businessPhone ?? ""} className={inputClass} />
        </Field>
        <Field label="Main Business Email">
          <input name="businessEmail" type="email" defaultValue={profile?.businessEmail ?? ""} className={inputClass} />
        </Field>
        <Field label="Website" hint="Optional.">
          <input name="website" defaultValue={profile?.website ?? ""} className={inputClass} />
        </Field>
      </Section>

      <Section title="Primary Contact Person" description="The main person responsible for this account -- not every employee using the system.">
        <Field label="First Name">
          <input name="primaryContactFirstName" defaultValue={profile?.primaryContactFirstName ?? ""} className={inputClass} />
        </Field>
        <Field label="Last Name">
          <input name="primaryContactLastName" defaultValue={profile?.primaryContactLastName ?? ""} className={inputClass} />
        </Field>
        <Field label="Job Title / Position">
          <input name="primaryContactTitle" defaultValue={profile?.primaryContactTitle ?? ""} className={inputClass} />
        </Field>
        <Field label="Email">
          <input name="primaryContactEmail" type="email" defaultValue={profile?.primaryContactEmail ?? ""} className={inputClass} />
        </Field>
        <Field label="Phone Number">
          <input name="primaryContactPhone" type="tel" defaultValue={profile?.primaryContactPhone ?? ""} className={inputClass} />
        </Field>
      </Section>

      <Section title="Optional Business Information" description="Not required -- add only if applicable.">
        <Field label="Tax ID / EIN">
          <input name="taxId" defaultValue={profile?.taxId ?? ""} className={inputClass} />
        </Field>
        <Field label="Business Registration Number">
          <input name="businessRegistrationNumber" defaultValue={profile?.businessRegistrationNumber ?? ""} className={inputClass} />
        </Field>
      </Section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Document Display Settings</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          What a generated quotation receipt (and future documents) is allowed to show.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {[
            { name: "docShowLogo", label: "Show Logo", def: profile?.docShowLogo ?? true },
            { name: "docShowLegalName", label: "Show Legal Business Name", def: profile?.docShowLegalName ?? true },
            { name: "docShowDba", label: "Show DBA", def: profile?.docShowDba ?? true },
            { name: "docShowAddress", label: "Show Business Address", def: profile?.docShowAddress ?? true },
            { name: "docShowPhone", label: "Show Phone Number", def: profile?.docShowPhone ?? true },
            { name: "docShowEmail", label: "Show Email", def: profile?.docShowEmail ?? true },
            { name: "docShowWebsite", label: "Show Website", def: profile?.docShowWebsite ?? false },
          ].map((f) => (
            <label key={f.name} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={f.name} defaultChecked={f.def} className="h-4 w-4 rounded border-slate-300" />
              <span className="text-slate-700 dark:text-slate-300">{f.label}</span>
            </label>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save Changes"}
        </button>
        {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
        {state?.message && <p className="text-sm text-emerald-700 dark:text-emerald-400">{state.message}</p>}
      </div>
    </form>
  );
}
