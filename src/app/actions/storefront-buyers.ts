"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { guardPublicForm } from "@/lib/human-check";
import { findPublicStorefront } from "@/lib/storefront-public";
import { cleanApplication, BUYER_COOKIE } from "@/lib/storefront-buyer-rules";
import { signBuyerSession } from "@/lib/storefront-buyer-session";
import { completeBuyerSignin, currentBuyer, requestBuyerSignin, submitApplication } from "@/lib/storefront-buyers";
import { placeOrder } from "@/lib/storefront-orders";
import { cleanOrderRequest, linesFromForm } from "@/lib/storefront-order-rules";
import { emailCheck, normalizeResetEmail } from "@/lib/password-reset-rules";

export type ApplyState = { error?: string; received?: boolean } | undefined;
export type LinkState = { error?: string; sent?: boolean } | undefined;
export type SigninState = { error?: string } | undefined;

/**
 * The pharmacy application form. The company comes ONLY from the page address (bound from the page, looked up again here). Public form:
 * trap field, human check when switched on, a limit per network address, the same checks the page promised, then a daily cap.
 * The answer is the same whether or not this email applied before.
 */
export async function applyAction(handle: string, _prev: ApplyState, formData: FormData): Promise<ApplyState> {
  const blocked = await guardPublicForm(formData, { scope: "storefront-apply", max: 5, windowSec: 3600 });
  if (blocked) return { error: blocked };
  const sf = await findPublicStorefront(handle);
  if (!sf || !sf.buyOpen) return { error: "This page is not taking applications right now." };
  const keys = ["businessName", "contactName", "email", "phone", "street1", "street2", "city", "state", "zip", "npi", "deaNumber", "licenseNumber", "licenseState", "notes"] as const;
  const cleaned = cleanApplication(Object.fromEntries(keys.map((k) => [k, formData.get(k)])) as Record<(typeof keys)[number], FormDataEntryValue | null>);
  if (!cleaned.ok) return { error: cleaned.error };
  try {
    const saved = await submitApplication(sf, cleaned.value);
    if (!saved.ok) return { error: saved.error };
    return { received: true };
  } catch (err) {
    console.error("[storefront] application failed:", err);
    return { error: "Something went wrong. Please try again in a minute." };
  }
}

/** The account page's email box. Same answer for everyone, so it can't be used to find out which pharmacies have accounts. */
export async function requestBuyerLinkAction(handle: string, _prev: LinkState, formData: FormData): Promise<LinkState> {
  const blocked = await guardPublicForm(formData, { scope: "storefront-buyer-link", max: 6, windowSec: 3600 });
  if (blocked) return { error: blocked };
  const email = normalizeResetEmail(formData.get("email"));
  if (!emailCheck(email).ok) return { error: "Enter the email address you applied with." };
  const sf = await findPublicStorefront(handle);
  if (!sf) return { error: "This page is not available." };
  try {
    await requestBuyerSignin(sf, email);
  } catch (err) {
    console.error("[storefront] sign-in link failed:", err);
    return { error: "Something went wrong. Please try again in a minute." };
  }
  return { sent: true };
}

/** The "Sign in" button on the emailed link's page. The link is checked and spent here, then the signed cookie is set for this storefront's path only. */
export async function buyerSignInAction(handle: string, _prev: SigninState, formData: FormData): Promise<SigninState> {
  const blocked = await guardPublicForm(formData, { scope: "storefront-buyer-signin", max: 20, windowSec: 3600, skipHuman: true });
  if (blocked) return { error: blocked };
  const sf = await findPublicStorefront(handle);
  if (!sf) return { error: "This page is not available." };
  const result = await completeBuyerSignin(sf, String(formData.get("token") ?? "")).catch((err) => {
    console.error("[storefront] sign-in failed:", err);
    return null;
  });
  if (!result) return { error: "Something went wrong. Please try again." };
  if (!result.ok) return { error: result.status === "used" ? "This link was already used. Ask for a new one." : "This link has expired or isn't valid. Ask for a new one." };
  const { value, maxAgeSec } = signBuyerSession(result.buyerId, sf.storefrontId);
  (await cookies()).set(BUYER_COOKIE, value, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: `/s/${sf.handle}`, maxAge: maxAgeSec });
  redirect(`/s/${sf.handle}/account`);
}

export async function buyerSignOutAction(handle: string): Promise<void> {
  const sf = await findPublicStorefront(handle);
  if (sf) (await cookies()).set(BUYER_COOKIE, "", { httpOnly: true, sameSite: "lax", path: `/s/${sf.handle}`, maxAge: 0 });
  redirect(`/s/${handle}`);
}

export type OrderState = { error?: string; unavailable?: string[] } | undefined;

/**
 * The hosted order form. The pharmacy comes ONLY from the signed cookie (re-checked: still approved, this storefront), the company only from
 * the page address. The form sends quantities per price-sheet line and a key for this form; no price, stock or status is read from it.
 */
export async function placeOrderAction(handle: string, _prev: OrderState, formData: FormData): Promise<OrderState> {
  const sf = await findPublicStorefront(handle);
  if (!sf) return { error: "This page is not available." };
  const me = await currentBuyer(sf);
  if (!me) redirect(`/s/${sf.handle}/account`);
  const blocked = await guardPublicForm(formData, { scope: "storefront-order", max: 30, windowSec: 3600, skipHuman: true });
  if (blocked) return { error: blocked };
  const cleaned = cleanOrderRequest({ key: formData.get("key"), lines: linesFromForm(formData.entries()), poNumber: formData.get("poNumber"), notes: formData.get("notes") });
  if (!cleaned.ok) return { error: cleaned.error };
  let result;
  try {
    result = await placeOrder(sf, me.id, cleaned.value, { source: "STOREFRONT" });
  } catch (err) {
    console.error("[storefront] order failed:", err);
    return { error: "Something went wrong. Please try again in a minute." };
  }
  if (!result.ok) return { error: result.error, unavailable: result.unavailable?.map((u) => u.itemId) };
  redirect(`/s/${sf.handle}/orders/${result.order.reference}?placed=1`);
}
