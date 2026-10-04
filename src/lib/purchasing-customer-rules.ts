// What a Purchasing customer must always have on file: full name (first AND
// last), email, phone, and a full street address. Shared by the add/edit
// customer forms, the new-quotation form, the CSV import and the quotation
// check, so the rule lives in exactly one place. Pure functions -- no DB.

export type CustomerContact = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  street1?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

const blank = (v: string | null | undefined) => !v || !v.trim();

/** Human labels of the required things that are missing -- empty array means complete. */
export function missingCustomerFields(c: CustomerContact): string[] {
  const missing: string[] = [];
  if (blank(c.firstName)) missing.push("first name");
  if (blank(c.lastName)) missing.push("last name");
  if (blank(c.email)) missing.push("email");
  if (blank(c.phone)) missing.push("phone");
  if (blank(c.street1)) missing.push("street address");
  if (blank(c.city)) missing.push("city");
  if (blank(c.state)) missing.push("state");
  if (blank(c.zip)) missing.push("ZIP code");
  return missing;
}

/** Null when the customer is fine to save; otherwise one plain-language error. */
export function customerValidationError(c: CustomerContact): string | null {
  const missing = missingCustomerFields(c);
  if (missing.length > 0) {
    return `A customer needs a full name, full address, email and phone number. Missing: ${missing.join(", ")}.`;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email!.trim())) return "Enter a valid email address.";
  if (c.phone!.replace(/\D/g, "").length < 10) return "Enter a full phone number (at least 10 digits).";
  return null;
}
