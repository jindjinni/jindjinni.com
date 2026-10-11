// Pharmacy accounts on a company's storefront (phase 2): the application form's checks, the account states and the sign-in cookie's
// name. Pure rules (no database, no email), so they can be tested alone. The service is storefront-buyers.ts.
//
// In plain words: a pharmacy applies on the company's page with its identifiers (NPI, DEA registration, state license). We never ask a
// pharmacy for an NCPDP number here: that number is only needed for a PBM audit and is asked for there (Accounts -> Audit Center). Staff
// look at the application and approve or decline it. Only an approved pharmacy can sign in, with a one-time emailed link (no passwords).
// An identifier that looks right proves nothing by itself: the checks here only catch typing mistakes. Staff verify the license.

import { emailCheck } from "@/lib/password-reset-rules";
import { linkCount } from "@/lib/storefront-rules";

export const BUYER_COOKIE = "jj_buyer";
export const BUYER_SESSION_DAYS = 7;
/** A storefront takes at most this many applications a day. */
export const MAX_APPLICATIONS_PER_DAY = 30;

export const BUYER_STATUSES = ["PENDING", "APPROVED", "DECLINED", "SUSPENDED"] as const;
export type BuyerStatus = (typeof BUYER_STATUSES)[number];
export const BUYER_LABEL: Record<BuyerStatus, string> = { PENDING: "Waiting for review", APPROVED: "Approved", DECLINED: "Declined", SUSPENDED: "Suspended" };

export type BuyerDecision = "approve" | "decline" | "suspend" | "reactivate";

/** The state a decision moves an account to, or null when that move is not allowed from where it is. */
export function nextBuyerStatus(from: BuyerStatus, decision: BuyerDecision): BuyerStatus | null {
  if (decision === "approve") return from === "PENDING" || from === "DECLINED" ? "APPROVED" : null;
  if (decision === "decline") return from === "PENDING" ? "DECLINED" : null;
  if (decision === "suspend") return from === "APPROVED" ? "SUSPENDED" : null;
  if (decision === "reactivate") return from === "SUSPENDED" ? "APPROVED" : null;
  return null;
}

/** Only an approved account can sign in or see anything behind the sign-in. */
export const mayUseAccount = (status: string) => status === "APPROVED";

/** Luhn check, as used by NPIs (with the card prefix 80840 in front) and many other numbers. */
export function luhnOk(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** An NPI is 10 digits and passes the Luhn check once 80840 is put in front of it. */
export const npiOk = (npi: string) => /^\d{10}$/.test(npi) && luhnOk("80840" + npi);

/** A DEA registration: two letters, six digits and a check digit ((1st+3rd+5th) + 2 x (2nd+4th+6th), last digit of the total). */
export function deaOk(dea: string): boolean {
  if (!/^[A-Z]{2}\d{7}$/.test(dea)) return false;
  const d = dea.slice(2).split("").map(Number);
  return ((d[0] + d[2] + d[4] + 2 * (d[1] + d[3] + d[5])) % 10) === d[6];
}

export type ApplicationInput = {
  businessName: unknown; contactName: unknown; email: unknown; phone: unknown;
  street1: unknown; street2: unknown; city: unknown; state: unknown; zip: unknown;
  npi: unknown; deaNumber: unknown; licenseNumber: unknown; licenseState: unknown; notes: unknown;
};

export type Application = {
  businessName: string; contactName: string; email: string; phone: string | null;
  street1: string; street2: string | null; city: string; state: string; zip: string;
  npi: string; deaNumber: string; licenseNumber: string; licenseState: string; notes: string | null;
};

const oneLine = (v: unknown, max: number) => String(v ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);
const multiLine = (v: unknown, max: number) => String(v ?? "").replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);

/** Checks and cleans a pharmacy's application. The words are for the applicant, so they say how to fix it. */
export function cleanApplication(input: ApplicationInput): { ok: true; value: Application } | { ok: false; error: string } {
  const businessName = oneLine(input.businessName, 120);
  const contactName = oneLine(input.contactName, 100);
  if (!businessName) return { ok: false, error: "Enter your pharmacy's name." };
  if (!contactName) return { ok: false, error: "Enter the name of the person we should contact." };
  const email = String(input.email ?? "").trim().toLowerCase().slice(0, 200);
  if (!emailCheck(email).ok) return { ok: false, error: "Enter a valid email address. We send your sign-in link there." };
  const phoneRaw = oneLine(input.phone, 40);
  if (phoneRaw) {
    const digits = phoneRaw.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) return { ok: false, error: "Check the phone number, or leave it empty." };
  }
  const street1 = oneLine(input.street1, 120);
  const city = oneLine(input.city, 80);
  const state = oneLine(input.state, 20).toUpperCase();
  const zip = oneLine(input.zip, 10);
  if (!street1 || !city) return { ok: false, error: "Enter the pharmacy's street address and city." };
  if (!/^[A-Z]{2}$/.test(state)) return { ok: false, error: "Enter the two-letter state, for example TX." };
  if (!/^\d{5}(-\d{4})?$/.test(zip)) return { ok: false, error: "Enter the ZIP code as 5 digits, for example 77002." };

  const npi = String(input.npi ?? "").replace(/\D/g, "");
  if (!npiOk(npi)) return { ok: false, error: "That NPI doesn't look right. An NPI has 10 digits; please check it." };
  const licenseNumber = oneLine(input.licenseNumber, 40).toUpperCase();
  if (licenseNumber.length < 3 || !/^[A-Z0-9][A-Z0-9 ./-]*$/.test(licenseNumber)) return { ok: false, error: "Enter your state pharmacy license number." };
  const licenseState = oneLine(input.licenseState, 20).toUpperCase();
  if (!/^[A-Z]{2}$/.test(licenseState)) return { ok: false, error: "Enter the two-letter state that issued the license, for example TX." };
  const deaNumber = oneLine(input.deaNumber, 20).toUpperCase().replace(/\s/g, "");
  if (!deaNumber) return { ok: false, error: "Enter your pharmacy's DEA registration number." };
  if (!deaOk(deaNumber)) return { ok: false, error: "That DEA number doesn't look right. It is two letters and seven digits; please check it." };

  const notes = multiLine(input.notes, 1000);
  if (linkCount(notes) > 2) return { ok: false, error: "Please remove the web links from your message." };
  return {
    ok: true,
    value: { businessName, contactName, email, phone: phoneRaw || null, street1, street2: oneLine(input.street2, 120) || null, city, state, zip, npi, deaNumber, licenseNumber, licenseState, notes: notes || null },
  };
}
