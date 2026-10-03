// Shared FormData -> Business Profile field extraction, used by both the
// Settings -> Business Profile edit action and the signup flow (where most
// of this became mandatory -- see src/app/actions/auth.ts). Document
// Display Settings are deliberately NOT part of this -- that's a separate,
// smaller extraction only the profile-edit action does, since signup never
// shows those checkboxes and leaving them out lets the schema's own
// defaults apply.

export const trimmed = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim() || null;
export const checked = (formData: FormData, key: string) => formData.get(key) === "on";

export type BusinessProfileIdentityFields = {
  dbaName: string | null;
  nameDisplayPreference: "legal" | "dba" | "both";
  businessAddressStreet1: string | null;
  businessAddressStreet2: string | null;
  businessAddressCity: string | null;
  businessAddressState: string | null;
  businessAddressZip: string | null;
  businessAddressCountry: string;
  shippingSameAsBusiness: boolean;
  shippingAddressStreet1: string | null;
  shippingAddressStreet2: string | null;
  shippingAddressCity: string | null;
  shippingAddressState: string | null;
  shippingAddressZip: string | null;
  shippingAddressCountry: string;
  businessPhone: string | null;
  businessEmail: string | null;
  website: string | null;
  primaryContactFirstName: string | null;
  primaryContactLastName: string | null;
  primaryContactTitle: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  taxId: string | null;
  businessRegistrationNumber: string | null;
};

export function extractBusinessProfileIdentityFields(formData: FormData): BusinessProfileIdentityFields {
  const nameDisplayPreferenceRaw = (formData.get("nameDisplayPreference") as string) || "legal";
  const nameDisplayPreference = (
    ["legal", "dba", "both"].includes(nameDisplayPreferenceRaw) ? nameDisplayPreferenceRaw : "legal"
  ) as "legal" | "dba" | "both";
  const shippingSameAsBusiness = checked(formData, "shippingSameAsBusiness");

  return {
    dbaName: trimmed(formData, "dbaName"),
    nameDisplayPreference,

    businessAddressStreet1: trimmed(formData, "businessAddressStreet1"),
    businessAddressStreet2: trimmed(formData, "businessAddressStreet2"),
    businessAddressCity: trimmed(formData, "businessAddressCity"),
    businessAddressState: trimmed(formData, "businessAddressState"),
    businessAddressZip: trimmed(formData, "businessAddressZip"),
    businessAddressCountry: trimmed(formData, "businessAddressCountry") ?? "US",

    shippingSameAsBusiness,
    shippingAddressStreet1: shippingSameAsBusiness ? null : trimmed(formData, "shippingAddressStreet1"),
    shippingAddressStreet2: shippingSameAsBusiness ? null : trimmed(formData, "shippingAddressStreet2"),
    shippingAddressCity: shippingSameAsBusiness ? null : trimmed(formData, "shippingAddressCity"),
    shippingAddressState: shippingSameAsBusiness ? null : trimmed(formData, "shippingAddressState"),
    shippingAddressZip: shippingSameAsBusiness ? null : trimmed(formData, "shippingAddressZip"),
    shippingAddressCountry: shippingSameAsBusiness ? "US" : trimmed(formData, "shippingAddressCountry") ?? "US",

    businessPhone: trimmed(formData, "businessPhone"),
    businessEmail: trimmed(formData, "businessEmail"),
    website: trimmed(formData, "website"),

    primaryContactFirstName: trimmed(formData, "primaryContactFirstName"),
    primaryContactLastName: trimmed(formData, "primaryContactLastName"),
    primaryContactTitle: trimmed(formData, "primaryContactTitle"),
    primaryContactEmail: trimmed(formData, "primaryContactEmail"),
    primaryContactPhone: trimmed(formData, "primaryContactPhone"),

    taxId: trimmed(formData, "taxId"),
    businessRegistrationNumber: trimmed(formData, "businessRegistrationNumber"),
  };
}

function formatAddressPart(
  row: Pick<
    BusinessProfileIdentityFields,
    | "businessAddressStreet1"
    | "businessAddressStreet2"
    | "businessAddressCity"
    | "businessAddressState"
    | "businessAddressZip"
    | "shippingAddressStreet1"
    | "shippingAddressStreet2"
    | "shippingAddressCity"
    | "shippingAddressState"
    | "shippingAddressZip"
  >,
  which: "business" | "shipping",
) {
  const street1 = which === "business" ? row.businessAddressStreet1 : row.shippingAddressStreet1;
  const street2 = which === "business" ? row.businessAddressStreet2 : row.shippingAddressStreet2;
  const city = which === "business" ? row.businessAddressCity : row.shippingAddressCity;
  const state = which === "business" ? row.businessAddressState : row.shippingAddressState;
  const zip = which === "business" ? row.businessAddressZip : row.shippingAddressZip;
  const parts = [street1, street2, [city, state, zip].filter(Boolean).join(", ")].filter(Boolean);
  return parts.length ? parts.join(" / ") : null;
}

export { formatAddressPart as formatBusinessAddress };
