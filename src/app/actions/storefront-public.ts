"use server";

import { guardPublicForm } from "@/lib/human-check";
import { findPublicStorefront, submitSellRequest } from "@/lib/storefront-public";
import { cleanSellRequest } from "@/lib/storefront-rules";
import { cleanPayout } from "@/lib/bank-rules";
import { ORDER_KEY_RE, cartFromJsonText, cleanCart, cleanCheckoutCustomer } from "@/lib/checkout-rules";
import { placeCheckoutOrder } from "@/lib/website-checkout";

export type SellState = { error?: string; reference?: string } | undefined;

/**
 * The public "sell to us" form. The company comes ONLY from the storefront's address (bound from the page, then looked up again here);
 * nothing in the form can name a company. Public form: trap field, human check when switched on, a limit per network address, then the
 * same checks and cleaning the page promised, then a daily cap per storefront.
 */
export async function submitSellRequestAction(handle: string, _prev: SellState, formData: FormData): Promise<SellState> {
  const blocked = await guardPublicForm(formData, { scope: "storefront-sell", max: 5, windowSec: 3600 });
  if (blocked) return { error: blocked };
  const sf = await findPublicStorefront(handle);
  if (!sf || !sf.sellOpen) return { error: "This page is not taking offers right now." };
  const cleaned = cleanSellRequest({
    businessName: formData.get("businessName"), contactName: formData.get("contactName"), email: formData.get("email"), phone: formData.get("phone"),
    street1: formData.get("street1"), street2: formData.get("street2"), city: formData.get("city"), state: formData.get("state"), zip: formData.get("zip"),
    itemsText: formData.get("itemsText"), notes: formData.get("notes"),
  });
  if (!cleaned.ok) return { error: cleaned.error };
  try {
    const saved = await submitSellRequest(sf, cleaned.value);
    if (!saved.ok) return { error: saved.error };
    return { reference: saved.reference };
  } catch (err) {
    console.error("[storefront] sell request failed:", err);
    return { error: "Something went wrong. Please try again in a minute." };
  }
}

// ---- Automatic checkout: "Sell us your supplies" ----------------------------------------------------------------------------------------

export type CheckoutState = {
  error?: string;
  newTotal?: number;
  /** Set once the order is placed: what the final screen shows. Never contains bank numbers. */
  placed?: { reference: string; viewUrl: string; emailed: boolean; created: boolean; order: import("@/lib/website-checkout").OrderView };
} | undefined;

/**
 * The hosted checkout form. The company comes ONLY from the storefront's address; the cart carries product ids and quantities, never prices.
 * The bank details are checked, stored encrypted by the order service, and never logged, emailed or sent back.
 */
export async function placeCheckoutOrderAction(handle: string, _prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const blocked = await guardPublicForm(formData, { scope: "storefront-checkout", max: 8, windowSec: 3600 });
  if (blocked) return { error: blocked };
  const sf = await findPublicStorefront(handle);
  if (!sf || !sf.checkoutOpen) return { error: "This company is not taking orders through its website right now." };
  const customer = cleanCheckoutCustomer({
    businessName: formData.get("businessName"), contactName: formData.get("contactName"), email: formData.get("email"), phone: formData.get("phone"),
    street1: formData.get("street1"), street2: formData.get("street2"), city: formData.get("city"), state: formData.get("state"), zip: formData.get("zip"),
    residential: formData.get("residential"), notes: formData.get("notes"),
  });
  if (!customer.ok) return { error: customer.error };
  const cart = cleanCart(cartFromJsonText(formData.get("cart")));
  if (!cart.ok) return { error: cart.error };
  const payout = cleanPayout({ ownerName: formData.get("ownerName"), routingNumber: formData.get("routingNumber"), accountNumber: formData.get("accountNumber"), accountType: formData.get("accountType") });
  if (!payout.ok) return { error: payout.error };
  if (formData.get("confirmBank") !== "on") return { error: "Please confirm the bank details are correct. We pay by direct deposit to this account." };
  const key = String(formData.get("orderKey") ?? "");
  if (!ORDER_KEY_RE.test(key)) return { error: "This page is out of date. Reload it and try again." };
  const expectedRaw = String(formData.get("expectedTotal") ?? "").trim();
  const expected = expectedRaw !== "" && Number.isFinite(Number(expectedRaw)) ? Number(expectedRaw) : null;
  try {
    const r = await placeCheckoutOrder(sf, { customer: customer.value, cart: cart.lines, payout: payout.value, orderKey: key, expectedTotal: expected, source: "PAGE" });
    if (!r.ok) return { error: r.error, ...(r.newTotal !== undefined ? { newTotal: r.newTotal } : {}) };
    return { placed: { reference: r.reference, viewUrl: r.viewUrl, emailed: r.emailed, created: r.created, order: r.order } };
  } catch (err) {
    console.error("[storefront] checkout failed:", err);
    return { error: "Something went wrong. Nothing was charged and no order was placed. Please try again in a minute." };
  }
}
