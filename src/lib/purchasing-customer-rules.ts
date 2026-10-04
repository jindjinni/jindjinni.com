// What a Purchasing customer must have on file.
//
//  * ALWAYS required: a name (a single name is fine -- last name is optional)
//    and a full street address.
//    That is all a free shipping label needs -- the customer is the sender and
//    their address is also the return address.
//  * Email and phone are expected, but often aren't known when the quotation
//    and label are created, so they may be left blank and added later. A
//    customer missing them is flagged ("needs email/phone") until they are.
//
// Shared by the add/edit customer forms, the new-quotation form, the CSV
// import and the quotation check, so the rule lives in one place. Pure
// functions -- no DB.

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

/** Human labels of the ALWAYS-required things that are missing (name + address) -- empty array means OK. */
export function missingCustomerFields(c: CustomerContact): string[] {
  const missing: string[] = [];
  if (blank(c.firstName)) missing.push("name");
  if (blank(c.street1)) missing.push("street address");
  if (blank(c.city)) missing.push("city");
  if (blank(c.state)) missing.push("state");
  if (blank(c.zip)) missing.push("ZIP code");
  return missing;
}

/** Contact details still to collect (email / phone) -- not a reason to block anything. */
export function missingContactDetails(c: CustomerContact): string[] {
  const missing: string[] = [];
  if (blank(c.email)) missing.push("email");
  if (blank(c.phone)) missing.push("phone");
  return missing;
}

/** Null when the customer is fine to save; otherwise one plain-language error. */
export function customerValidationError(c: CustomerContact): string | null {
  const missing = missingCustomerFields(c);
  if (missing.length > 0) {
    return `A customer needs a name and a full address. Missing: ${missing.join(", ")}.`;
  }
  if (!blank(c.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email!.trim())) {
    return "That email address doesn't look right. Fix it, or leave it blank and add it later.";
  }
  if (!blank(c.phone) && c.phone!.replace(/\D/g, "").length < 10) {
    return "That phone number looks too short (needs at least 10 digits). Fix it, or leave it blank and add it later.";
  }
  return null;
}
