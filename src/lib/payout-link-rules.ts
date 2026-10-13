// "Where should we pay you?" links: the pure rules (no database, no encryption), so they can be tested alone.
// A customer opens a private link tied to ONE quotation/order and types the direct-deposit details we pay them with. Every method the
// company pays through (a regular bank account, PayPal, Cash App, Venmo, Chime) is paid as a direct deposit, so EVERY method needs the same details: holder name, address,
// phone, email, bank name, routing number, account number and account type. Messages are for the customer and never repeat a number back.

import { createHash, randomBytes } from "node:crypto";
import { routingOk } from "@/lib/bank-rules";

export const PAYOUT_METHODS = [
  { key: "bank", label: "Bank account" },
  { key: "paypal", label: "PayPal" },
  { key: "cashapp", label: "Cash App" },
  { key: "venmo", label: "Venmo" },
  { key: "chime", label: "Chime" },
] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number]["key"];
/** What the customer reads about each way to be paid. The four apps are explained because many people don't know they have a routing and account number. */
export const FINTECH_NOTE =
  "PayPal, Cash App, Venmo and Chime are payment and online-banking apps that also give you their own routing number and account number, so you can be paid by direct deposit without sharing your regular bank account. If you don't know where to find those numbers, ask that app's customer service and they will show you.";
export const METHOD_HELP: Record<PayoutMethod, string> = {
  bank: "Your regular checking or savings account at a bank or credit union. Use the name of that bank, and the routing and account numbers printed on your checks or shown in your online banking.",
  paypal: "Use the routing number and account number that PayPal gives you for direct deposit. The bank name is the one PayPal shows next to those numbers.",
  cashapp: "Use the routing number and account number that Cash App gives you for direct deposit. The bank name is the one Cash App shows next to those numbers.",
  venmo: "Use the routing number and account number that Venmo gives you for direct deposit. The bank name is the one Venmo shows next to those numbers.",
  chime: "Use the routing number and account number shown in your Chime app (Move Money, then Account Info). The bank name is the one Chime shows next to those numbers.",
};
export const methodLabel = (key: string | null | undefined) => PAYOUT_METHODS.find((m) => m.key === key)?.label ?? "Direct deposit";

/** How long a link works. */
export const LINK_VALID_DAYS = 14;

/** Why a Purchasing agent sends the link. The agent's wording is on the left; the sentence the customer reads is on the right. */
export const LINK_REASONS = [
  { key: "new_customer", label: "We haven't worked with this customer before", customer: "This is our first order together, so we need to know where to send your payment." },
  { key: "never_paid", label: "We haven't paid this customer before", customer: "We haven't sent you a payment before, so we need to know where to send it." },
  { key: "new_banking", label: "Their banking details changed", customer: "We want to make sure we have your current payment details, in case anything has changed." },
  { key: "other", label: "Another reason", customer: "We need your payment details for this order." },
] as const;
export type LinkReason = (typeof LINK_REASONS)[number]["key"];
export const reasonLabel = (key: string | null | undefined) => LINK_REASONS.find((r) => r.key === key)?.label ?? null;
export const reasonCustomerLine = (key: string | null | undefined) => LINK_REASONS.find((r) => r.key === key)?.customer ?? LINK_REASONS[3].customer;
export function cleanReason(reason: unknown, note: unknown): { ok: true; reason: LinkReason; note: string | null } | { ok: false; error: string } {
  const key = String(reason ?? "");
  if (!LINK_REASONS.some((r) => r.key === key)) return { ok: false, error: "Choose why you are asking for the payment details." };
  const text = String(note ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 200);
  if (key === "other" && text.length < 3) return { ok: false, error: "Type a short reason for asking." };
  return { ok: true, reason: key as LinkReason, note: key === "other" && text ? text : null };
}

export const CAUTION_TEXT = "PLEASE DOUBLE CHECK ALL DETAILS BEFORE SUBMITTING IT TO US. THANKS!";
/** The link works ONE time: once the details are sent they cannot be changed from the link. A correction needs a new link from us. */
export const ONE_TIME_TEXT = "ONE-TIME SUBMISSION: after you press Submit you cannot go back, change anything or send again. Read every box twice. Use the real name of the person who owns the account, and the address of the account holder. Every box is required.";

export type PayoutDetailsInput = {
  method: unknown; holderName: unknown; street1: unknown; street2: unknown; city: unknown; state: unknown; zip: unknown;
  phone: unknown; email: unknown; bankName: unknown; accountNumber: unknown; routingNumber: unknown; accountType: unknown;
};
export type PayoutDetails = {
  method: PayoutMethod; holderName: string; street1: string; street2: string; city: string; state: string; zip: string;
  phone: string; email: string; bankName: string; accountNumber: string; routingNumber: string; accountType: "checking" | "savings";
};

const one = (v: unknown, max: number) => String(v ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);

/** Checks and cleans what the customer typed. */
export function cleanPayoutDetails(input: PayoutDetailsInput): { ok: true; value: PayoutDetails } | { ok: false; error: string } {
  const method = one(input.method, 20).toLowerCase();
  if (!PAYOUT_METHODS.some((m) => m.key === method)) return { ok: false, error: "Choose how you want to be paid: a bank account, PayPal, Cash App, Venmo or Chime." };
  const holderName = one(input.holderName, 100);
  if (holderName.length < 2) return { ok: false, error: "Enter the full name of the account holder." };
  if (/\d/.test(holderName)) return { ok: false, error: "The account holder's name should not contain numbers." };
  const street1 = one(input.street1, 120);
  const city = one(input.city, 80);
  const state = one(input.state, 20).toUpperCase();
  const zip = one(input.zip, 10);
  if (street1.length < 3 || city.length < 2) return { ok: false, error: "Enter the street address and city of the account holder." };
  if (!/^[A-Z]{2}$/.test(state)) return { ok: false, error: "Enter the 2-letter state, for example TX." };
  if (!/^\d{5}(-\d{4})?$/.test(zip)) return { ok: false, error: "Enter the 5-digit ZIP code." };
  const phone = one(input.phone, 40);
  if (phone.replace(/\D/g, "").length < 10) return { ok: false, error: "Enter a phone number with the area code." };
  const email = one(input.email, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: "Enter a valid email address." };
  const bankName = one(input.bankName, 100);
  if (bankName.length < 2) return { ok: false, error: "Enter the name of the bank." };
  const routingNumber = String(input.routingNumber ?? "").replace(/[\s-]/g, "");
  if (!/^\d+$/.test(routingNumber)) return { ok: false, error: "Enter the routing number using digits only. It has exactly 9 digits." };
  if (routingNumber.length !== 9) return { ok: false, error: "A routing number has exactly 9 digits. Yours doesn't, so please check it against your bank statement or checks." };
  if (!routingOk(routingNumber)) return { ok: false, error: "That routing number doesn't look right. It has 9 digits, but they don't add up as a real bank routing number; please check it." };
  const accountNumber = String(input.accountNumber ?? "").replace(/[\s-]/g, "");
  if (!/^\d{4,17}$/.test(accountNumber)) return { ok: false, error: "That account number doesn't look right. It has 4 to 17 digits; please check it." };
  const accountType = one(input.accountType, 20).toLowerCase();
  if (accountType !== "checking" && accountType !== "savings") return { ok: false, error: "Choose whether the account is checking or savings." };
  return {
    ok: true,
    value: { method: method as PayoutMethod, holderName, street1, street2: one(input.street2, 120), city, state, zip, phone, email, bankName, accountNumber, routingNumber, accountType },
  };
}

/** What is stored encrypted. */
export const detailsToJson = (d: PayoutDetails) => JSON.stringify(d);
export function detailsFromJson(text: string): PayoutDetails | null {
  try {
    const v = JSON.parse(text) as Record<string, unknown>;
    const s = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : null);
    const need = ["method", "holderName", "street1", "city", "state", "zip", "phone", "email", "bankName", "accountNumber", "routingNumber"];
    if (need.some((k) => s(k) === null)) return null;
    if (v.accountType !== "checking" && v.accountType !== "savings") return null;
    if (!PAYOUT_METHODS.some((m) => m.key === v.method)) return null;
    return {
      method: v.method as PayoutMethod, holderName: s("holderName")!, street1: s("street1")!, street2: s("street2") ?? "", city: s("city")!, state: s("state")!, zip: s("zip")!,
      phone: s("phone")!, email: s("email")!, bankName: s("bankName")!, accountNumber: s("accountNumber")!, routingNumber: s("routingNumber")!, accountType: v.accountType,
    };
  } catch {
    return null;
  }
}

export const addressLine = (d: Pick<PayoutDetails, "street1" | "street2" | "city" | "state" | "zip">) =>
  [d.street1, d.street2, `${d.city}, ${d.state} ${d.zip}`].filter(Boolean).join(", ");

/** The only thing most people ever see: "PayPal - Checking account ending 1234". */
export const maskedPayoutLine = (method: string | null, type: string | null, last4: string | null) =>
  `${methodLabel(method)} - ${type === "savings" ? "Savings" : "Checking"} account ending ${last4 ?? "----"}`;

// ---- the link itself ------------------------------------------------------------------------------------------------------------------

export function hashLinkToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
export function newLinkToken(nowMs: number): { token: string; tokenHash: string; expiresAt: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashLinkToken(token), expiresAt: new Date(nowMs + LINK_VALID_DAYS * 86400000).toISOString() };
}
/** 43 characters of letters, digits, "-" and "_". Anything else is refused before it touches the database. */
export const looksLikeLinkToken = (t: string) => /^[A-Za-z0-9_-]{43}$/.test(t);
/** The company's name as a web-address word: "USA Test Strips Center" -> "usa-test-strips-center". Only for looks; the token decides everything. */
export function companySlug(name: string | null | undefined): string {
  const s = String(name ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/g, "");
  return s || "company";
}
/** The address the customer opens. With a company name it reads .../payment-details/usa-test-strips-center/<token>, so the link names the company they deal with. */
export const linkUrl = (base: string, token: string, companyName?: string | null) =>
  `${base.replace(/\/+$/, "")}/payment-details/${companyName ? companySlug(companyName) + "/" : ""}${token}`;

export type LinkRow = { status: string; expiresAt: string; erasedAt: string | null };
/** What the CUSTOMER's page does with a link. */
export type CustomerLinkState = "open" | "received" | "closed" | "expired" | "invalid";
export function customerLinkState(row: LinkRow | null | undefined, orderPaid: boolean, nowMs: number): CustomerLinkState {
  if (!row) return "invalid";
  if (row.status === "CANCELLED") return "closed";
  if (row.erasedAt || orderPaid) return "closed";
  if (Date.parse(row.expiresAt) <= nowMs) return "expired";
  return row.status === "SUBMITTED" ? "received" : "open";
}

/** What STAFF see on the quotation. */
export type StaffLinkState = "none" | "waiting" | "received" | "expired" | "cancelled" | "erased";
export function staffLinkState(row: LinkRow | null | undefined, nowMs: number): StaffLinkState {
  if (!row) return "none";
  if (row.status === "CANCELLED") return "cancelled";
  if (row.erasedAt) return "erased";
  if (row.status === "SUBMITTED") return "received";
  return Date.parse(row.expiresAt) <= nowMs ? "expired" : "waiting";
}
export const STAFF_STATE_TEXT: Record<StaffLinkState, string> = {
  none: "No payment-details link has been made for this order yet.",
  waiting: "Link made. Waiting for the customer to fill it in.",
  received: "The customer sent their payment details.",
  expired: "The link ran out. Make a new one.",
  cancelled: "The link was cancelled.",
  erased: "The details were erased (the order was paid or someone erased them).",
};

// ---- the email a person reviews and sends ---------------------------------------------------------------------------------------------

export function linkEmailContent(p: { companyName: string; quotationNumber: string; customerName: string; url: string; days?: number; reason?: string | null }): { subject: string; text: string; html: string } {
  const days = p.days ?? LINK_VALID_DAYS;
  const subject = `${p.companyName}: where should we send your payment? (${p.quotationNumber})`;
  const text = [
    `Hello ${p.customerName},`,
    "",
    `We are ready to pay you for order ${p.quotationNumber}. ${reasonCustomerLine(p.reason)} Please use the private link below to tell us where to send your payment by direct deposit (your bank account, PayPal, Cash App or Venmo):`,
    "",
    p.url,
    "",
    `The link works for ${days} days and only for this order. The link can be used only ONE time: once you press Submit you cannot change anything, so please double check every detail before you send it.`,
    "Please do not reply to this email with your bank details. Only type them on the page above.",
    "",
    `Thank you,`,
    p.companyName,
  ].join("\n");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<p>Hello ${esc(p.customerName)},</p><p>We are ready to pay you for order <strong>${esc(p.quotationNumber)}</strong>. ${esc(reasonCustomerLine(p.reason))} Please use the private link below to tell us where to send your payment by direct deposit (your bank account, PayPal, Cash App or Venmo):</p><p><a href="${esc(p.url)}">${esc(p.url)}</a></p><p>The link works for ${days} days and only for this order. The link can be used only <strong>one time</strong>: once you press Submit you cannot change anything, so please double check every detail before you send it.</p><p><strong>Please do not reply to this email with your bank details.</strong> Only type them on the page above.</p><p>Thank you,<br>${esc(p.companyName)}</p>`;
  return { subject, text, html };
}
