"use server";

// The Lamp's Pricing tab: change the price, make promo codes, approve affiliates and mark their cuts paid. Owner, co-owner and admin only,
// re-checked on the server every time.

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/tenant";
import { staffLevelOf } from "@/lib/platform-admin";
import { isFullLevel } from "@/lib/mothership-rules";
import { usd } from "@/lib/billing-config";
import { approveAffiliate, createPromo, markReferralPaid, savePriceBook, setAffiliateStatus, setPromoActive } from "@/lib/pricing-service";

export type PricingState = { error?: string; message?: string } | undefined;

async function actor() {
  const org = await requireOrg({ real: true });
  if (org.viewAs) throw new Error("Not allowed.");
  const level = await staffLevelOf(org);
  if (!isFullLevel(level)) throw new Error("Not allowed.");
  return org;
}

const refresh = () => {
  revalidatePath("/dashboard/lamp/pricing");
  revalidatePath("/");
  revalidatePath("/signup");
};

export async function savePriceAction(_p: PricingState, fd: FormData): Promise<PricingState> {
  const org = await actor();
  const r = await savePriceBook({ userId: org.userId }, { monthly: fd.get("monthly"), yearly: fd.get("yearly"), bothPercent: fd.get("bothPercent") }, String(fd.get("note") ?? ""));
  if (!r.ok) return { error: r.error };
  refresh();
  return { message: r.changed ? `Saved. New sign-ups pay ${usd(r.book.monthlyCents)} a month or ${usd(r.book.yearlyCents)} a year for one operation. Companies already signed up keep the price they signed up at.` : "Those are already the current prices. Nothing changed." };
}

export async function createPromoAction(_p: PricingState, fd: FormData): Promise<PricingState> {
  const org = await actor();
  const r = await createPromo(
    { userId: org.userId },
    { code: fd.get("code"), kind: fd.get("kind"), value: fd.get("value"), plan: fd.get("plan"), maxUses: fd.get("maxUses"), startsOn: fd.get("startsOn"), endsOn: fd.get("endsOn") },
    String(fd.get("note") ?? ""),
  );
  if (!r.ok) return { error: r.error };
  refresh();
  return { message: `The code ${r.code} is ready. Anyone can type it in the Promo code box on the sign-up page.` };
}

export async function togglePromoAction(fd: FormData): Promise<void> {
  await actor();
  await setPromoActive(String(fd.get("id") ?? ""), String(fd.get("active") ?? "") === "1");
  refresh();
}

export async function approveAffiliateAction(_p: PricingState, fd: FormData): Promise<PricingState> {
  const org = await actor();
  const r = await approveAffiliate({ userId: org.userId }, String(fd.get("id") ?? ""), fd.get("percent"));
  if (!r.ok) return { error: r.error };
  refresh();
  return { message: `Approved. Their code is ${r.code}. ${r.emailed ? "We emailed them the code and their link." : "The email could not be sent, so send them the code and link yourself."}` };
}

export async function affiliateStatusAction(fd: FormData): Promise<void> {
  await actor();
  const status = String(fd.get("status") ?? "");
  if (status === "active" || status === "paused" || status === "declined") await setAffiliateStatus(String(fd.get("id") ?? ""), status);
  refresh();
}

export async function markPaidAction(_p: PricingState, fd: FormData): Promise<PricingState> {
  await actor();
  const r = await markReferralPaid(String(fd.get("id") ?? ""), String(fd.get("note") ?? ""));
  if (!r.ok) return { error: r.error };
  refresh();
  return { message: "Marked as paid." };
}
