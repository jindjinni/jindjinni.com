// Plain-language account and payment standing for a company, shared by the company's own Company profile page and the platform
// owner's Companies panel, so both always say the same thing.

import { BILLING_LIVE } from "@/lib/billing-config";

export type Tone = "good" | "warn" | "bad" | "neutral";

/** Where the company stands with us. (A company that is waiting, turned down, suspended or banned can't open its workspace at all.) */
export function accountStatusText(approvalStatus: string | null): { label: string; tone: Tone; text: string } {
  switch (approvalStatus) {
    case "pending": return { label: "Under review", tone: "warn", text: "We are checking your business details." };
    case "rejected": return { label: "Not approved", tone: "bad", text: "We couldn't confirm the business details yet." };
    case "suspended": return { label: "Suspended", tone: "bad", text: "The account is locked until the problem is fixed." };
    case "banned": return { label: "Closed", tone: "bad", text: "The account was permanently closed." };
    default: return { label: "Active", tone: "good", text: "Your account is active and in good standing with us." };
  }
}

const dayOf = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

/** Payment standing. Billing is not live yet, so every company reads "Not started" until it is. */
export function paymentStatusText(o: { paymentStatus: string | null; paymentGraceEndsAt: string | null; lastPaymentAt: string | null }): { label: string; tone: Tone; text: string } {
  if (!o.paymentStatus) {
    return BILLING_LIVE
      ? { label: "No payment yet", tone: "warn", text: "No payment on file yet." }
      : { label: "Not started", tone: "neutral", text: "Billing isn't switched on yet, so nothing is due." };
  }
  if (o.paymentStatus === "current") {
    return { label: "Paid up", tone: "good", text: o.lastPaymentAt ? `Last payment went through on ${dayOf(o.lastPaymentAt)}.` : "Payments are up to date." };
  }
  if (o.paymentStatus === "grace") {
    return { label: "Grace period", tone: "warn", text: `A payment didn't go through. Fix it${o.paymentGraceEndsAt ? ` by ${dayOf(o.paymentGraceEndsAt)}` : " within 3 days"} or the account is suspended until it does.` };
  }
  return { label: "Past due", tone: "bad", text: "A payment didn't go through and the 3-day grace period is over. The account is suspended until it does." };
}

export const TONE_CLASS: Record<Tone, string> = {
  good: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  warn: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  bad: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  neutral: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
};
