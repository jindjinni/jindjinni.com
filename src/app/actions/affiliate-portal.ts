"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { guardPublicForm } from "@/lib/human-check";
import { completeAffiliateSignin, requestAffiliateSignin } from "@/lib/affiliate-portal";
import { AFFILIATE_COOKIE, normalizeAffiliateEmail } from "@/lib/affiliate-portal-rules";
import { signAffiliateSession } from "@/lib/affiliate-session";
import { emailCheck } from "@/lib/password-reset-rules";

export type AffiliateSigninState = { error?: string; sent?: boolean } | undefined;
export type AffiliateLinkState = { error?: string } | undefined;

/**
 * The portal's email box. The answer is the same whether or not the address belongs to an approved affiliate, so this page can't be
 * used to find out who is one. Public form: trap field, human check when switched on, and a limit per network address.
 */
export async function requestAffiliateLink(_prev: AffiliateSigninState, formData: FormData): Promise<AffiliateSigninState> {
  const blocked = await guardPublicForm(formData, { scope: "affiliate-signin", max: 6, windowSec: 3600 });
  if (blocked) return { error: blocked };
  const email = normalizeAffiliateEmail(formData.get("email"));
  const check = emailCheck(email);
  if (!check.ok) return { error: check.error };
  try {
    await requestAffiliateSignin(email);
  } catch (err) {
    console.error("[affiliate-portal] request failed:", err);
    return { error: "Something went wrong. Please try again in a minute." };
  }
  return { sent: true };
}

/** The "Sign in" button on the emailed link's page. The token is checked and spent here, then the signed cookie is set. */
export async function signInWithLink(_prev: AffiliateLinkState, formData: FormData): Promise<AffiliateLinkState> {
  const blocked = await guardPublicForm(formData, { scope: "affiliate-signin-do", max: 20, windowSec: 3600, skipHuman: true });
  if (blocked) return { error: blocked };
  const token = String(formData.get("token") ?? "");
  let result;
  try {
    result = await completeAffiliateSignin(token);
  } catch (err) {
    console.error("[affiliate-portal] sign-in failed:", err);
    return { error: "Something went wrong. Please try again." };
  }
  if (!result.ok) {
    return { error: result.status === "used" ? "This link was already used. Ask for a new one." : "This link has expired or isn't valid. Ask for a new one." };
  }
  const { value, maxAgeSec } = signAffiliateSession(result.affiliateId);
  (await cookies()).set(AFFILIATE_COOKIE, value, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: maxAgeSec });
  redirect("/affiliate");
}

export async function affiliateSignOut(): Promise<void> {
  (await cookies()).delete(AFFILIATE_COOKIE);
  redirect("/affiliate");
}
