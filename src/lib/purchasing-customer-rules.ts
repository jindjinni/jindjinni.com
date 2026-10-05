// What a Purchasing customer must have on file.
//
//  * ALWAYS required: a name (a single name is fine -- last name is optional). That is all it takes
//    to start a quotation: a brand-new customer is often quoted before they have shared anything else.
//  * Address, email and phone are collected later, once the customer agrees to go ahead. They can be
//    left blank, and the customer is flagged ("needs address / email / phone") until they are filled in.
//    A free shipping label is the one thing that needs the full street address, so label generation
//    checks for it (see hasCustomerAddress).
//
// Shared by the add/edit customer forms, the new-quotation form, the CSV import and the customer
// lists, so the rule lives in one place. Pure functions -- no DB.

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

/** Human labels of the ALWAYS-required things that are missing (just the name) -- empty array means OK. */
export function missingCustomerFields(c: CustomerContact): string[] {
  return blank(c.firstName) ? ["name"] : [];
}

/** True when the full street address (street, city, state, ZIP) is on file -- what a shipping label needs. */
export function hasFullAddress(c: CustomerContact): boolean {
  return !blank(c.street1) && !blank(c.city) && !blank(c.state) && !blank(c.zip);
}

/** Details still to collect (address / email / phone) -- not a reason to block anything but the shipping label. */
export function missingContactDetails(c: CustomerContact): string[] {
  const missing: string[] = [];
  if ("street1" in c && !hasFullAddress(c)) missing.push("address");
  if (blank(c.email)) missing.push("email");
  if (blank(c.phone)) missing.push("phone");
  return missing;
}

/** Null when the customer is fine to save; otherwise one plain-language error. */
export function customerValidationError(c: CustomerContact): string | null {
  if (missingCustomerFields(c).length > 0) {
    return "A customer needs at least a name.";
  }
  if (!blank(c.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email!.trim())) {
    return "That email address doesn't look right. Fix it, or leave it blank and add it later.";
  }
  if (!blank(c.phone) && c.phone!.replace(/\D/g, "").length < 10) {
    return "That phone number looks too short (needs at least 10 digits). Fix it, or leave it blank and add it later.";
  }
  return null;
}
