// The cancellation and refund policy, as pure functions (no database, no clock unless passed in), so it can be tested over every
// calendar day and the screens, the cancel action and the future billing job all say the same thing.
//
// The policy (decided by the platform owner):
//  - Cancelling during the free trial: no charge. Service runs to the end of the trial.
//  - Monthly plan: no refund. It is a cancellation, not a refund. Service continues to the end of the month you cancel in
//    (that month is already paid), then the workspace is switched off. Data is kept.
//  - Yearly plan: service continues to the end of the month you cancel in, then the workspace is switched off, and the unused
//    time of the year is refunded to the original payment method. The refund is the yearly price x unused days / days in that
//    year (counted by the day, so it is exact), rounded to the nearest cent. Cancelling in the last month of the year: no refund.
//  - If nothing was actually paid (billing isn't live, or a payment failed), nothing is refunded.
//  - After service ends, the company can come back and pick up where it left off; billing starts again from the day it returns.

import { YEARLY_CENTS, type BillingPlan } from "@/lib/billing-config";
import { addDays, addYear, daysBetween, lastDayOfMonth, prorate } from "@/lib/billing-schedule";

export type CancelKind = "trial" | "monthly" | "yearly";

export type CancelInput = {
  plan: BillingPlan | null;
  /** The day the person cancels, in billing-calendar days. */
  today: string;
  /** First paid day (end of the free trial); null for companies from before trials existed. */
  firstBillableOn: string | null;
  /** True only if the current period (month or year) has actually been paid. */
  paid: boolean;
  /** What a full year costs this company (its own locked price, both operations counted). Defaults to the original single-operation price. */
  yearlyCents?: number;
};

export type CancelOutcome = {
  kind: CancelKind;
  /** The last day the company can still use the service. The day after, the workspace is switched off. */
  serviceEndsOn: string;
  /** Money back, in whole cents. */
  refundCents: number;
  /** Yearly only: the unused part of the year that is refunded. */
  unusedDays: number;
  termDays: number;
  termEndsOn: string | null;
};

/** Which yearly term (start, end) contains `today`; terms run from the first paid day, one year each. */
export function yearlyTermContaining(firstBillableOn: string, today: string): { from: string; to: string } {
  let from = firstBillableOn;
  for (let i = 0; i < 200; i++) {
    const next = addYear(from);
    if (today < next) return { from, to: addDays(next, -1) };
    from = next;
  }
  return { from, to: addDays(addYear(from), -1) };
}

export function cancellationOutcome(i: CancelInput): CancelOutcome {
  // Still in the free trial: free until the trial ends, nothing to pay or refund.
  if (i.firstBillableOn && i.today < i.firstBillableOn) {
    return { kind: "trial", serviceEndsOn: addDays(i.firstBillableOn, -1), refundCents: 0, unusedDays: 0, termDays: 0, termEndsOn: null };
  }
  const monthEnd = lastDayOfMonth(i.today);
  if (i.plan === "yearly" && i.firstBillableOn) {
    const term = yearlyTermContaining(i.firstBillableOn, i.today);
    const serviceEndsOn = monthEnd < term.to ? monthEnd : term.to;
    const unusedDays = Math.max(0, daysBetween(serviceEndsOn, term.to));
    const termDays = daysBetween(term.from, term.to) + 1;
    const refundCents = i.paid && unusedDays > 0 ? prorate(i.yearlyCents ?? YEARLY_CENTS, unusedDays, termDays) : 0;
    return { kind: "yearly", serviceEndsOn, refundCents, unusedDays, termDays, termEndsOn: term.to };
  }
  return { kind: "monthly", serviceEndsOn: monthEnd, refundCents: 0, unusedDays: 0, termDays: 0, termEndsOn: null };
}

/** True once the last day of service has passed, so the workspace should be switched off. */
export function serviceHasEnded(serviceEndsOn: string | null, today: string): boolean {
  return !!serviceEndsOn && today > serviceEndsOn;
}
