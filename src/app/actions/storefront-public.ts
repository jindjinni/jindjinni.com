"use server";

import { guardPublicForm } from "@/lib/human-check";
import { findPublicStorefront, submitSellRequest } from "@/lib/storefront-public";
import { cleanSellRequest } from "@/lib/storefront-rules";

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
