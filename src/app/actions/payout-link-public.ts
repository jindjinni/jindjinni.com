"use server";

import { guardPublicForm } from "@/lib/human-check";
import { cleanPayoutDetails } from "@/lib/payout-link-rules";
import { submitLinkDetails } from "@/lib/payout-link-service";

export type PayoutFormState = { error?: string; done?: true } | undefined;

/**
 * The customer's payment-details form. The company and the order come ONLY from the link's token (bound from the page, then looked up
 * again here by its hash); nothing in the form can name a company or an order. Public form: trap field, human check when switched on, a
 * limit per network address, then the same checks and cleaning the page promised. The numbers are stored encrypted and never logged,
 * emailed or sent back.
 */
export async function submitPayoutDetailsAction(token: string, _prev: PayoutFormState, formData: FormData): Promise<PayoutFormState> {
  const blocked = await guardPublicForm(formData, { scope: "payout-link", max: 10, windowSec: 3600 });
  if (blocked) return { error: blocked };
  if (formData.get("confirmDetails") !== "on") return { error: "Please tick the box to confirm you double checked every detail and understand this can only be sent once." };
  const f = (k: string) => formData.get(k);
  const cleaned = cleanPayoutDetails({
    method: f("method"), holderName: f("holderName"), street1: f("street1"), street2: f("street2"), city: f("city"), state: f("state"), zip: f("zip"),
    phone: f("phone"), email: f("email"), bankName: f("bankName"), accountNumber: f("accountNumber"), routingNumber: f("routingNumber"), accountType: f("accountType"),
  });
  if (!cleaned.ok) return { error: cleaned.error };
  try {
    const r = await submitLinkDetails(token, cleaned.value);
    if (!r.ok) return { error: r.error };
    return { done: true };
  } catch (err) {
    console.error("[payout-links] submit failed:", err instanceof Error ? err.message : "error");
    return { error: "Something went wrong. Please try again in a minute." };
  }
}
