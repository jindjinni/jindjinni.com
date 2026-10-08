// Plain-language account and payment standing for a company, shared by the company's own Company profile page and the platform
// owner's Companies panel, so both always say the same thing.

import { BILLING_LIVE, usd, type BillingPlan, parseBillingPlan } from "@/lib/billing-config";
import { billingDateOf, chargeSchedule, longDay, rangeText, trialState, type Charge } from "@/lib/billing-schedule";

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

export type PaymentInput = {
  paymentStatus: string | null;
  paymentGraceEndsAt: string | null;
  lastPaymentAt: string | null;
  billingPlan?: string | null;
  trialStartsOn?: string | null;
  firstBillableOn?: string | null;
};

/** One charge in words: "October 15: $535.77 (17 days, October 15 to 31)". */
export function chargeLine(c: Charge): string {
  const what = c.kind === "prorated" ? `${c.days} of ${c.daysInMonth} days, ${rangeText(c.coversFrom, c.coversTo)}` : c.kind === "yearly" ? "1 year" : "full month";
  return `${longDay(c.date)}: ${usd(c.amountCents)} (${what})`;
}

/** The free trial and the next charges for a company, in words, or null if its trial hasn't started (not approved yet). */
export function billingCalendar(o: { billingPlan?: string | null; trialStartsOn?: string | null; firstBillableOn?: string | null }, today: string = billingDateOf()):
  { trial: ReturnType<typeof trialState>; plan: BillingPlan | null; charges: Charge[] } | null {
  if (!o.trialStartsOn || !o.firstBillableOn) return null;
  const plan = parseBillingPlan(o.billingPlan);
  return { trial: trialState({ startsOn: o.trialStartsOn, firstBillableOn: o.firstBillableOn }, today), plan, charges: plan ? chargeSchedule(plan, o.firstBillableOn, 3) : [] };
}

/** Payment standing. Billing is not live yet, so a company is either in its free trial or "Not started" until it is. */
export function paymentStatusText(o: PaymentInput, today: string = billingDateOf()): { label: string; tone: Tone; text: string } {
  if (!o.paymentStatus) {
    const cal = billingCalendar(o, today);
    if (!cal) {
      return BILLING_LIVE
        ? { label: "No payment yet", tone: "warn", text: "No payment on file yet." }
        : { label: "Not started", tone: "neutral", text: "The 7-day free trial starts the day the company is approved. Billing isn't switched on yet, so nothing is due." };
    }
    if (cal.trial.state === "in_trial") {
      const left = cal.trial.daysLeft;
      const first = cal.charges[0];
      return {
        label: "Free trial",
        tone: "good",
        text: `${left} day${left === 1 ? "" : "s"} left (free through ${longDay(cal.trial.lastFreeDay)}). ${BILLING_LIVE ? (first ? `First charge: ${chargeLine(first)}.` : "") : "Billing isn't switched on yet, so nothing will be charged."}`.trim(),
      };
    }
    return BILLING_LIVE
      ? { label: "No payment yet", tone: "warn", text: `The free trial ended ${longDay(cal.trial.state === "ended" ? cal.trial.firstBillableOn : today)}. No payment on file yet.` }
      : { label: "Not started", tone: "neutral", text: "The free trial is over. Billing isn't switched on yet, so nothing is due." };
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
