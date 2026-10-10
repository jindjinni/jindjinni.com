// The billing calendar: free trial, first (prorated) charge, and every charge after it. Pure functions, no database, no clock
// unless you pass one in, so every rule can be tested over every day of the calendar.
//
// The rules (decided by the platform owner):
//  - Every new company gets a 7-day free trial. It starts the day the company is APPROVED (not at sign-up, because a company
//    can't use the software while it waits for approval).
//  - Monthly plan: auto-pay on the 1st of every month, prepaid for that month. When the trial ends part-way through a month,
//    the days from the end of the trial to the last day of that month are charged right then (a "prorated" charge: the monthly
//    price x days left / days in that month), and the full price is charged on the 1st after that. If the trial ends exactly on
//    the 1st, the first charge is simply the full month.
//  - Yearly plan: no proration. The full year is charged once when the trial ends and again on the same date every year after
//    (29 February falls back to 28 February in non-leap years).
//  - Money is whole cents (integers), never floating point. A prorated amount is rounded to the nearest cent, halves up.
//  - Everything is counted in whole calendar days ("YYYY-MM-DD") in ONE billing time zone, so a company signing in late on a
//    Friday evening isn't charged a day early or late because of where its server or browser happens to be.

import { MONTHLY_CENTS, YEARLY_CENTS, type BillingPlan } from "@/lib/billing-config";

/** What one full month and one full year cost a company (its own locked price, with both operations counted). Defaults to the original single-operation prices. */
export type PlanPrices = { monthlyCents: number; yearlyCents: number };
export const ORIGINAL_PRICES: PlanPrices = { monthlyCents: MONTHLY_CENTS, yearlyCents: YEARLY_CENTS };

export const TRIAL_DAYS = 7;
/** The time zone that decides what "today" and "the 1st" mean for billing. */
export const BILLING_TZ = "America/New_York";

export type ChargeKind = "prorated" | "monthly" | "yearly";

export type Charge = {
  /** The day the money is taken ("YYYY-MM-DD"). */
  date: string;
  kind: ChargeKind;
  amountCents: number;
  /** The first and last day (inclusive) of service this charge pays for. */
  coversFrom: string;
  coversTo: string;
  /** For a prorated charge: days charged and days in that month. */
  days?: number;
  daysInMonth?: number;
};

// ---- calendar helpers (UTC arithmetic on whole days, so daylight-saving never matters) ------------------------------

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parts(date: string): { y: number; m: number; d: number } {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Not a date: ${date}`);
  return { y: +m[1], m: +m[2], d: +m[3] };
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const fmt = (y: number, m: number, d: number) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

export function addDays(date: string, n: number): string {
  const { y, m, d } = parts(date);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  const pa = parts(a), pb = parts(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

export function lastDayOfMonth(date: string): string {
  const { y, m } = parts(date);
  return fmt(y, m, daysInMonth(y, m));
}

export function firstOfNextMonth(date: string): string {
  const { y, m } = parts(date);
  return m === 12 ? fmt(y + 1, 1, 1) : fmt(y, m + 1, 1);
}

/** Same day next year; 29 February becomes 28 February when the next year has no 29th. */
export function addYear(date: string): string {
  const { y, m, d } = parts(date);
  return fmt(y + 1, m, Math.min(d, daysInMonth(y + 1, m)));
}

/** The billing-time-zone calendar day of an instant. */
export function billingDateOf(instant: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: BILLING_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const get = (t: string) => p.find((x) => x.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// ---- money ---------------------------------------------------------------------------------------------------------

/** price x days / daysInMonth, in whole cents, halves rounded up. Integer arithmetic only. */
export function prorate(priceCents: number, days: number, monthDays: number): number {
  if (!Number.isInteger(priceCents) || !Number.isInteger(days) || !Number.isInteger(monthDays) || monthDays <= 0 || days < 0 || days > monthDays) {
    throw new Error("Bad proration input");
  }
  return Math.floor((2 * priceCents * days + monthDays) / (2 * monthDays));
}

// ---- the trial -----------------------------------------------------------------------------------------------------

export type Trial = {
  /** First day of the free trial (the approval day). */
  startsOn: string;
  /** Last free day (inclusive). */
  lastFreeDay: string;
  /** First day that is paid for; the first charge happens on this day. */
  firstBillableOn: string;
};

export function trialFrom(startsOn: string, trialDays: number = TRIAL_DAYS): Trial {
  return { startsOn, lastFreeDay: addDays(startsOn, trialDays - 1), firstBillableOn: addDays(startsOn, trialDays) };
}

export type TrialState =
  | { state: "none" }
  | { state: "in_trial"; daysLeft: number; lastFreeDay: string; firstBillableOn: string }
  | { state: "ended"; firstBillableOn: string };

/** Where a company is in its trial on a given day. `daysLeft` counts today, so the last free day says 1. */
export function trialState(trial: { startsOn: string | null; firstBillableOn: string | null }, today: string): TrialState {
  if (!trial.startsOn || !trial.firstBillableOn) return { state: "none" };
  if (today < trial.firstBillableOn) {
    return { state: "in_trial", daysLeft: daysBetween(today, trial.firstBillableOn), lastFreeDay: addDays(trial.firstBillableOn, -1), firstBillableOn: trial.firstBillableOn };
  }
  return { state: "ended", firstBillableOn: trial.firstBillableOn };
}

// ---- the charges ---------------------------------------------------------------------------------------------------

/**
 * The first `count` charges for a plan whose first paid day is `firstBillableOn`.
 * Monthly: [prorated rest-of-month unless that day is the 1st] then a full month on every 1st.
 * Yearly: the full year on `firstBillableOn`, then again on each anniversary.
 */
export function chargeSchedule(plan: BillingPlan, firstBillableOn: string, count = 4, prices: PlanPrices = ORIGINAL_PRICES): Charge[] {
  const out: Charge[] = [];
  if (count <= 0) return out;
  if (plan === "yearly") {
    let from = firstBillableOn;
    while (out.length < count) {
      const next = addYear(from);
      out.push({ date: from, kind: "yearly", amountCents: prices.yearlyCents, coversFrom: from, coversTo: addDays(next, -1) });
      from = next;
    }
    return out;
  }
  const { y, m, d } = parts(firstBillableOn);
  let next: string;
  if (d === 1) {
    next = firstBillableOn;
  } else {
    const dim = daysInMonth(y, m);
    const days = dim - d + 1;
    out.push({
      date: firstBillableOn, kind: "prorated", amountCents: prorate(prices.monthlyCents, days, dim),
      coversFrom: firstBillableOn, coversTo: fmt(y, m, dim), days, daysInMonth: dim,
    });
    next = firstOfNextMonth(firstBillableOn);
  }
  while (out.length < count) {
    out.push({ date: next, kind: "monthly", amountCents: prices.monthlyCents, coversFrom: next, coversTo: lastDayOfMonth(next) });
    next = firstOfNextMonth(next);
  }
  return out;
}

/** Everything about a company's billing calendar if its trial starts on `startsOn`. */
export function scheduleIfTrialStarts(plan: BillingPlan, startsOn: string, count = 4, prices: PlanPrices = ORIGINAL_PRICES): { trial: Trial; charges: Charge[] } {
  const trial = trialFrom(startsOn);
  return { trial, charges: chargeSchedule(plan, trial.firstBillableOn, count, prices) };
}

/** The next charge on or after `today`, or null if the plan has no charges listed (never, in practice). */
export function nextCharge(plan: BillingPlan, firstBillableOn: string, today: string, prices: PlanPrices = ORIGINAL_PRICES): Charge | null {
  const list = chargeSchedule(plan, firstBillableOn, 3, prices);
  return list.find((c) => c.date >= today) ?? null;
}

// ---- words ---------------------------------------------------------------------------------------------------------

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "October 14, 2026" (or without the year). */
export function longDay(date: string, withYear = true): string {
  const { y, m, d } = parts(date);
  return `${MONTHS[m - 1]} ${d}${withYear ? `, ${y}` : ""}`;
}

/** "October 15 to October 31" */
export function rangeText(a: string, b: string): string {
  const pa = parts(a), pb = parts(b);
  return pa.m === pb.m ? `${MONTHS[pa.m - 1]} ${pa.d} to ${pb.d}` : `${longDay(a, false)} to ${longDay(b, false)}`;
}
