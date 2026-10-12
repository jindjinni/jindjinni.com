// The automatic "sell us your supplies" checkout: pure rules (no database, no clock), so they can be tested.
//
// In plain words: a customer picks products (and how long until they expire and what shape they are in), sees what the company will pay,
// gives a shipping address and the bank account to be paid into, and presses submit. The company's own price list makes the quotation, a free
// shipping label is bought, and both are emailed. Nothing the customer (or a website acting for them) sends can set a price, a total, a status
// or the company: they send only which product, how many, which expiry band and which condition, and a key that makes a double click harmless.

import { emailCheck } from "@/lib/password-reset-rules";

/** The limits used when a company has not set its own. */
export const CHECKOUT_DEFAULTS = {
  /** Orders worth more than this are flagged so staff can look (and cancel) before the package arrives. */
  flagOver: 2000,
  /** Orders worth more than this get no automatic label: staff buy it after a look. */
  labelMax: 10000,
  /** Labels the checkout buys by itself in 24 hours, for the whole company. */
  labelsPerDay: 40,
  /** Orders one email address may place in 24 hours. */
  ordersPerCustomer: 3,
  /** Orders the whole checkout takes in 24 hours (a flood is turned away). */
  ordersPerDay: 80,
} as const;

export const CHECKOUT_LIMITS = { maxLines: 60, maxQuantity: 100_000, noteMax: 500 } as const;
export const ORDER_KEY_RE = /^[A-Za-z0-9_-]{8,80}$/;

const oneLine = (v: unknown, max: number) => String(v ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);
const multiLine = (v: unknown, max: number) => String(v ?? "").replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);

/** A company's limit as typed: blank = use the default. Whole numbers only, 1 or more. */
export function cleanWholeLimit(raw: unknown, label: string, max = 100000): { ok: true; value: number | null } | { ok: false; error: string } {
  const t = String(raw ?? "").replace(/[,\s]/g, "");
  if (t === "") return { ok: true, value: null };
  const n = Number(t);
  if (!Number.isInteger(n) || n < 1 || n > max) return { ok: false, error: `${label} must be a whole number from 1 to ${max.toLocaleString("en-US")}, or empty to use the standard setting.` };
  return { ok: true, value: n };
}

/** A dollar limit as typed: blank = use the default. */
export function cleanMoneyLimit(raw: unknown, label: string): { ok: true; value: number | null } | { ok: false; error: string } {
  const t = String(raw ?? "").replace(/[$,\s]/g, "");
  if (t === "") return { ok: true, value: null };
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n > 100_000_000) return { ok: false, error: `${label} must be an amount above $0, or empty to use the standard setting.` };
  return { ok: true, value: Math.round(n * 100) / 100 };
}

export type CheckoutLimits = { flagOver: number; labelMax: number; labelsPerDay: number; ordersPerCustomer: number; ordersPerDay: number };
export function limitsOf(s: { checkoutFlagOver?: number | null; checkoutLabelMax?: number | null; checkoutLabelsPerDay?: number | null; checkoutOrdersPerCustomer?: number | null } | null | undefined): CheckoutLimits {
  return {
    flagOver: s?.checkoutFlagOver ?? CHECKOUT_DEFAULTS.flagOver,
    labelMax: s?.checkoutLabelMax ?? CHECKOUT_DEFAULTS.labelMax,
    labelsPerDay: s?.checkoutLabelsPerDay ?? CHECKOUT_DEFAULTS.labelsPerDay,
    ordersPerCustomer: s?.checkoutOrdersPerCustomer ?? CHECKOUT_DEFAULTS.ordersPerCustomer,
    ordersPerDay: CHECKOUT_DEFAULTS.ordersPerDay,
  };
}

// ---- the customer ----------------------------------------------------------------------------------------------------------------

export type CheckoutCustomerInput = {
  businessName: unknown; contactName: unknown; email: unknown; phone: unknown;
  street1: unknown; street2: unknown; city: unknown; state: unknown; zip: unknown; residential?: unknown; notes?: unknown;
};
export type CheckoutCustomer = {
  businessName: string; contactName: string; email: string; phone: string;
  street1: string; street2: string | null; city: string; state: string; zip: string; isResidential: boolean; notes: string | null;
};

/** Checks the person and the address the package ships FROM. A phone number is required because the carrier insists on one for the label. */
export function cleanCheckoutCustomer(input: CheckoutCustomerInput): { ok: true; value: CheckoutCustomer } | { ok: false; error: string } {
  const businessName = oneLine(input.businessName, 120);
  const contactName = oneLine(input.contactName, 100);
  if (!contactName) return { ok: false, error: "Enter your name." };
  const email = String(input.email ?? "").trim().toLowerCase().slice(0, 200);
  if (!emailCheck(email).ok) return { ok: false, error: "Enter a valid email address. We send your quotation and shipping label there." };
  const phoneRaw = oneLine(input.phone, 40);
  const digits = phoneRaw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return { ok: false, error: "Enter a phone number with area code. The carrier needs it to make your shipping label." };
  const street1 = oneLine(input.street1, 120);
  const city = oneLine(input.city, 80);
  const state = oneLine(input.state, 20).toUpperCase();
  const zip = oneLine(input.zip, 10);
  if (!street1 || !city) return { ok: false, error: "Enter the street address and city you will ship from." };
  if (!/^[A-Z]{2}$/.test(state)) return { ok: false, error: "Enter the two-letter state, for example TX." };
  if (!/^\d{5}(-\d{4})?$/.test(zip)) return { ok: false, error: "Enter the ZIP code as 5 digits, for example 77002." };
  const residential = input.residential === true || input.residential === "on" || input.residential === "true" || input.residential === "yes";
  return {
    ok: true,
    value: { businessName, contactName, email, phone: phoneRaw, street1, street2: oneLine(input.street2, 120) || null, city, state, zip, isResidential: residential, notes: multiLine(input.notes, CHECKOUT_LIMITS.noteMax) || null },
  };
}

/** Two addresses are "the same place" when the street number/name and ZIP match, ignoring case, spacing and punctuation. */
export const addressKey = (street1: string, zip: string) => `${street1.toLowerCase().replace(/[^a-z0-9]/g, "")}|${zip.slice(0, 5)}`;

// ---- the cart --------------------------------------------------------------------------------------------------------------------

export type CartLineInput = { productId: unknown; quantity: unknown; expirationRangeId?: unknown; conditionId?: unknown };
export type CartLine = { productId: string; quantity: number; expirationRangeId: string | null; conditionId: string | null };

const ID_RE = /^[A-Za-z0-9_-]{3,80}$/;

/** The cart as sent, checked. The same product with the same expiry and condition twice is added together. */
export function cleanCart(raw: unknown): { ok: true; lines: CartLine[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "Choose at least one product." };
  if (raw.length > CHECKOUT_LIMITS.maxLines * 2) return { ok: false, error: `An order can have up to ${CHECKOUT_LIMITS.maxLines} different lines.` };
  const merged = new Map<string, CartLine>();
  for (let i = 0; i < raw.length; i++) {
    const l = raw[i] as Record<string, unknown> | null;
    if (!l || typeof l !== "object") return { ok: false, error: `Line ${i + 1} is not valid.` };
    const productId = String(l.productId ?? "");
    if (!ID_RE.test(productId)) return { ok: false, error: `Line ${i + 1} is not valid.` };
    const qRaw = typeof l.quantity === "string" && /^\d+$/.test(l.quantity.trim()) ? Number(l.quantity.trim()) : l.quantity;
    if (typeof qRaw !== "number" || !Number.isInteger(qRaw) || qRaw < 1 || qRaw > CHECKOUT_LIMITS.maxQuantity) return { ok: false, error: `Line ${i + 1} needs a whole-number quantity of 1 or more.` };
    const range = l.expirationRangeId ? String(l.expirationRangeId) : null;
    const cond = l.conditionId ? String(l.conditionId) : null;
    if ((range && !ID_RE.test(range)) || (cond && !ID_RE.test(cond))) return { ok: false, error: `Line ${i + 1} is not valid.` };
    const key = `${productId}|${range ?? ""}|${cond ?? ""}`;
    const prev = merged.get(key);
    if (prev) prev.quantity += qRaw;
    else merged.set(key, { productId, quantity: qRaw, expirationRangeId: range, conditionId: cond });
  }
  if (merged.size === 0) return { ok: false, error: "Choose at least one product." };
  if (merged.size > CHECKOUT_LIMITS.maxLines) return { ok: false, error: `An order can have up to ${CHECKOUT_LIMITS.maxLines} different lines.` };
  for (const l of merged.values()) if (l.quantity > CHECKOUT_LIMITS.maxQuantity) return { ok: false, error: "That quantity is too large." };
  return { ok: true, lines: [...merged.values()] };
}

/** The hosted checkout form: the cart travels as JSON text in one field. */
export function cartFromJsonText(text: unknown): unknown {
  try { return JSON.parse(String(text ?? "[]")); } catch { return null; }
}

// ---- what to look at -------------------------------------------------------------------------------------------------------------

/** Short plain reasons staff should look at an order before the package arrives. An empty list = nothing odd. */
export function flagReasons(i: { total: number; flagOver: number; maxQuantity: number; sameAddressOrdersToday: number; labelHeld: string | null; labelFailed: boolean }): string[] {
  const out: string[] = [];
  if (i.total > i.flagOver) out.push(`Large order ($${Math.round(i.total).toLocaleString("en-US")})`);
  if (i.maxQuantity >= 5000) out.push(`Very large quantity (${i.maxQuantity.toLocaleString("en-US")} on one line)`);
  if (i.sameAddressOrdersToday >= 1) out.push(`Another order from this address today (${i.sameAddressOrdersToday + 1} in 24 hours)`);
  if (i.labelHeld) out.push(i.labelHeld);
  if (i.labelFailed) out.push("The shipping label could not be made automatically");
  return out;
}

export type LabelDecision = { buy: true } | { buy: false; reason: string };
/** Should the checkout buy the label by itself? One label per order, and never past the company's value or daily limits. */
export function labelDecision(i: { total: number; labelMax: number; labelsToday: number; labelsPerDay: number }): LabelDecision {
  if (i.total > i.labelMax) return { buy: false, reason: `Label not bought automatically: order is over $${Math.round(i.labelMax).toLocaleString("en-US")}` };
  if (i.labelsToday >= i.labelsPerDay) return { buy: false, reason: `Label not bought automatically: ${i.labelsPerDay} labels already made in 24 hours` };
  return { buy: true };
}

/** Whether another order is allowed, by the company's limits. */
export function orderAllowed(i: { fromThisEmail: number; allToday: number; limits: CheckoutLimits }): { ok: true } | { ok: false; error: string } {
  if (i.fromThisEmail >= i.limits.ordersPerCustomer) return { ok: false, error: `You have already placed ${i.limits.ordersPerCustomer} orders in the last 24 hours. Please contact us if you need to send more.` };
  if (i.allToday >= i.limits.ordersPerDay) return { ok: false, error: "We have received a lot of orders today. Please try again tomorrow, or contact us directly." };
  return { ok: true };
}

/** Sentence for the "estimated payout" wording. */
export const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** The automatic bonus for an items total: the best tier whose threshold is reached. Same rule the quotation uses, so the page and the server agree. */
export function bonusFor(itemsTotal: number, tiers: { thresholdAmount: number; bonusAmount: number }[]): { bonus: number; label: string | null } {
  const eligible = tiers.filter((t) => itemsTotal >= t.thresholdAmount);
  if (eligible.length === 0) return { bonus: 0, label: null };
  const best = eligible.reduce((a, b) => (b.thresholdAmount > a.thresholdAmount ? b : a));
  return { bonus: best.bonusAmount, label: `$${best.thresholdAmount}+ -> $${best.bonusAmount} bonus` };
}
