// Company storefronts: the public pages a company can switch on (first: the Wholesale "sell to us" page). Pure rules only: no database,
// no clock, so everything here is easy to test. The storefront is a public door into the company's OWN records: what a visitor sends
// becomes a "Website request" in Purchasing; nothing a visitor types is ever trusted for money, stock or which company it belongs to.

import { emailCheck } from "@/lib/password-reset-rules";

/** The public address handle is chosen by the company (not the internal workspace name), so the internal name is never exposed. */
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 40;

/** Words a company can't take as its handle: they are (or may become) the platform's own addresses. */
const RESERVED = new Set([
  "admin", "api", "app", "affiliate", "affiliates", "both", "choose", "closed", "dashboard", "distribution", "forgot-password", "help", "invite",
  "lamp", "login", "no-access", "onboarding", "overview", "pricing", "privacy", "r", "reset-password", "robots", "s", "security", "signup", "status",
  "support", "terms", "under-review", "unsubscribe", "wholesale", "www", "jindjinni", "ledger", "mail", "store", "shop", "sell", "buy",
]);

/** Turns what a person typed into a clean handle: lower case, spaces and dots become hyphens, anything else odd is dropped. */
export function normalizeHandle(raw: unknown): string {
  return String(raw ?? "")
    .toLowerCase()
    .trim()
    .replace(/[\s._]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, HANDLE_MAX);
}

/** A plain-words reason a handle can't be used, or null when it is fine. */
export function handleError(handle: string): string | null {
  if (handle.length < HANDLE_MIN) return `The web address needs at least ${HANDLE_MIN} letters or numbers.`;
  if (handle.length > HANDLE_MAX) return `The web address can be at most ${HANDLE_MAX} characters.`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(handle)) return "Use only letters, numbers and single hyphens in the web address.";
  if (RESERVED.has(handle)) return "That web address is reserved. Please choose another.";
  return null;
}

export const NAME_MAX = 80;
export const WELCOME_MAX = 600;

/** The storefront's own settings, cleaned. */
export function cleanStorefrontSettings(input: { handle: unknown; displayName: unknown; welcomeText: unknown }):
  | { ok: true; value: { handle: string; displayName: string; welcomeText: string | null } }
  | { ok: false; error: string } {
  const handle = normalizeHandle(input.handle);
  const bad = handleError(handle);
  if (bad) return { ok: false, error: bad };
  const displayName = oneLine(input.displayName, NAME_MAX);
  if (!displayName) return { ok: false, error: "Enter the name visitors should see at the top of the page." };
  const welcome = multiLine(input.welcomeText, WELCOME_MAX);
  return { ok: true, value: { handle, displayName, welcomeText: welcome || null } };
}

// ---------------------------------------------------------------------------
// "Sell to us" requests
// ---------------------------------------------------------------------------

export type SellRequestInput = {
  businessName: unknown; contactName: unknown; email: unknown; phone: unknown;
  street1: unknown; street2: unknown; city: unknown; state: unknown; zip: unknown;
  itemsText: unknown; notes: unknown;
};

export type SellRequest = {
  businessName: string; contactName: string; email: string; phone: string | null;
  street1: string; street2: string | null; city: string; state: string; zip: string;
  itemsText: string; notes: string | null;
};

export const ITEMS_MIN = 10;
export const ITEMS_MAX = 4000;
export const NOTES_MAX = 1000;
/** A storefront takes at most this many new requests a day; more than that is a bot or a flood and is turned away politely. */
export const MAX_REQUESTS_PER_DAY = 40;

const oneLine = (v: unknown, max: number) => String(v ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);
const multiLine = (v: unknown, max: number) => String(v ?? "").replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);

/** How many web links a text carries (a few are normal, a pile is advertising). */
export function linkCount(text: string): number {
  return (text.match(/https?:\/\/|www\./gi) ?? []).length;
}

/** Checks and cleans a seller's request. The words are for the visitor, so they say how to fix it. */
export function cleanSellRequest(input: SellRequestInput): { ok: true; value: SellRequest } | { ok: false; error: string } {
  const businessName = oneLine(input.businessName, 120);
  const contactName = oneLine(input.contactName, 100);
  if (!businessName) return { ok: false, error: "Enter your business name." };
  if (!contactName) return { ok: false, error: "Enter the name of the person we should contact." };
  const email = String(input.email ?? "").trim().toLowerCase().slice(0, 200);
  const emailOk = emailCheck(email);
  if (!emailOk.ok) return { ok: false, error: "Enter a valid email address so we can reply to you." };
  const phoneRaw = oneLine(input.phone, 40);
  if (phoneRaw) {
    const digits = phoneRaw.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) return { ok: false, error: "Check the phone number, or leave it empty." };
  }
  const street1 = oneLine(input.street1, 120);
  const city = oneLine(input.city, 80);
  const state = oneLine(input.state, 20).toUpperCase();
  const zip = oneLine(input.zip, 10);
  if (!street1 || !city) return { ok: false, error: "Enter the street address and city we should send the quotation to." };
  if (!/^[A-Z]{2}$/.test(state)) return { ok: false, error: "Enter the two-letter state, for example TX." };
  if (!/^\d{5}(-\d{4})?$/.test(zip)) return { ok: false, error: "Enter the ZIP code as 5 digits, for example 77002." };
  const itemsText = multiLine(input.itemsText, ITEMS_MAX);
  if (itemsText.length < ITEMS_MIN) return { ok: false, error: "Tell us what you have: product names, how many, and the expiry dates if you know them." };
  const notes = multiLine(input.notes, NOTES_MAX);
  if (linkCount(itemsText) + linkCount(notes) > 2) return { ok: false, error: "Please remove the web links from your message; list the products in words." };
  return {
    ok: true,
    value: { businessName, contactName, email, phone: phoneRaw || null, street1, street2: oneLine(input.street2, 120) || null, city, state, zip, itemsText, notes: notes || null },
  };
}

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I, so a code read over the phone is not mixed up
/** A short code the visitor is shown after sending and the staff can search by, like WEB-7KQ2MX. `rand` gives numbers in [0,1) (so it can be tested). */
export function makeReference(rand: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += REF_ALPHABET[Math.floor(rand() * REF_ALPHABET.length)];
  return `WEB-${out}`;
}

export const REQUEST_STATUSES = ["NEW", "QUOTED", "DECLINED"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const REQUEST_LABEL: Record<RequestStatus, string> = { NEW: "New", QUOTED: "Quotation made", DECLINED: "Declined" };

/** Only a New request can become a quotation or be declined; a declined one can be reopened (nothing is ever deleted, only hidden). */
export function canMoveTo(from: RequestStatus, to: RequestStatus): boolean {
  if (from === "NEW") return to === "QUOTED" || to === "DECLINED";
  if (from === "DECLINED") return to === "NEW";
  return false;
}

/** The note put on the quotation made from a request: where it came from and exactly what the seller wrote. */
export function quotationNoteFor(r: { reference: string; businessName: string; itemsText: string; notes: string | null }): string {
  const lines = [`From the website: ${r.reference} (${r.businessName}).`, "", "What the seller listed:", r.itemsText];
  if (r.notes) lines.push("", "Their note:", r.notes);
  return lines.join("\n");
}

/** A person's name split for the customer record (first word / the rest); a single word is the first name. */
export function splitName(full: string): { firstName: string; lastName: string | null } {
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") || null };
}
