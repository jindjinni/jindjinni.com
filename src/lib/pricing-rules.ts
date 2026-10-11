// What the software costs, as pure rules (no database, no clock unless passed in), so every screen, the sign-up page, the billing
// calendar and the admin all do the same sums. Decided by the platform owner:
//  - One operation (Wholesale or Distribution) has a monthly price and a yearly price. Running BOTH costs a set percent more
//    (40% to begin with) on both the monthly and the yearly price; the yearly discount is built in the same way.
//  - The owner can change the prices at any time. A company keeps the price book it signed up at (it is "locked" on the company);
//    a new price only applies to new sign-ups.
//  - A promo code takes money off the FIRST payment after the free trial, and nothing after that.
//  - There is ONE kind of affiliate. A company that comes through their link or code gets 10% off (monthly plan: off each of its first 3
//    payments; yearly plan: off the year). The affiliate earns a one-time 40% of one month (monthly plan) or 15% of the year (yearly
//    plan) once that company has been billed for 3 months (see affiliate-program.ts). A promo and an affiliate code never stack.
// Money is whole cents (integers), never floating point.

/** The cookie an affiliate link (/r/CODE) leaves, so the sign-up page remembers who sent the visitor. */
export const REF_COOKIE = "jj_ref";

import { parseOperationType, type OperationType } from "@/lib/operation-type";
import { AFFILIATE_MONTHLY_PERCENT, AFFILIATE_MONTHS, AFFILIATE_YEARLY_PERCENT, REFERRED_DISCOUNT_PERCENT } from "@/lib/affiliate-program";
import { addMonths, chargeSchedule } from "@/lib/billing-schedule";

export type PlanKind = "monthly" | "yearly";
export type OperationCount = 1 | 2;

export type PriceBook = {
  /** One operation, per month. */
  monthlyCents: number;
  /** One operation, per year (already discounted against twelve months). */
  yearlyCents: number;
  /** Running both operations costs this many percent more than one. */
  bothPercent: number;
};

/** The prices from before the owner could change them: $977 a month, $10,499 a year, both operations 40% more. */
export const DEFAULT_BOOK: PriceBook = { monthlyCents: 97_700, yearlyCents: 1_049_900, bothPercent: 40 };

export const MAX_PRICE_CENTS = 10_000_000; // $100,000
export const MAX_BOTH_PERCENT = 300;

/** How many operations an answer to the sign-up question means: Both = 2, everything else (or no answer) = 1. */
export function operationsFor(type: OperationType | string | null | undefined): OperationCount {
  return parseOperationType(type) === "BOTH" ? 2 : 1;
}

const withUplift = (cents: number, percent: number) => Math.round((cents * (100 + percent)) / 100);

/** Per month, for one or both operations. */
export function monthlyPrice(book: PriceBook, ops: OperationCount): number {
  return ops === 2 ? withUplift(book.monthlyCents, book.bothPercent) : book.monthlyCents;
}

/** Per year, for one or both operations. */
export function yearlyPrice(book: PriceBook, ops: OperationCount): number {
  return ops === 2 ? withUplift(book.yearlyCents, book.bothPercent) : book.yearlyCents;
}

/** Twelve months at the monthly price: the "regular" price shown crossed out beside the yearly price. */
export function yearlyRegular(book: PriceBook, ops: OperationCount): number {
  return monthlyPrice(book, ops) * 12;
}

export function yearlySavings(book: PriceBook, ops: OperationCount): number {
  return Math.max(0, yearlyRegular(book, ops) - yearlyPrice(book, ops));
}

/** What one full period of a plan costs. */
export function planAmount(book: PriceBook, plan: PlanKind, ops: OperationCount): number {
  return plan === "yearly" ? yearlyPrice(book, ops) : monthlyPrice(book, ops);
}

export type BookInput = { monthly: unknown; yearly: unknown; bothPercent: unknown };

/** Turns a dollars-and-cents amount typed by a person ("977", "$1,367.80") into whole cents; null when it is not a sum of money. */
export function parseDollars(raw: unknown): number | null {
  const s = String(raw ?? "").replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [w, c = ""] = s.split(".");
  return Number(w) * 100 + Number(c.padEnd(2, "0"));
}

/** The price book as typed in the admin, or the plain reason it cannot be saved. */
export function validateBook(i: BookInput): { ok: true; book: PriceBook } | { ok: false; error: string } {
  const monthly = parseDollars(i.monthly);
  const yearly = parseDollars(i.yearly);
  const pct = Number(String(i.bothPercent ?? "").trim());
  if (monthly === null || monthly < 100 || monthly > MAX_PRICE_CENTS) return { ok: false, error: "Type the monthly price as dollars, for example 977 or 977.00." };
  if (yearly === null || yearly < 100 || yearly > MAX_PRICE_CENTS) return { ok: false, error: "Type the yearly price as dollars, for example 10499." };
  if (!Number.isInteger(pct) || pct < 0 || pct > MAX_BOTH_PERCENT) return { ok: false, error: `Type the extra percent for running both operations as a whole number from 0 to ${MAX_BOTH_PERCENT}, for example 40.` };
  if (yearly > monthly * 12) return { ok: false, error: "The yearly price cannot be more than twelve months at the monthly price. Lower the yearly price or raise the monthly one." };
  return { ok: true, book: { monthlyCents: monthly, yearlyCents: yearly, bothPercent: pct } };
}

export function sameBook(a: PriceBook, b: PriceBook): boolean {
  return a.monthlyCents === b.monthlyCents && a.yearlyCents === b.yearlyCents && a.bothPercent === b.bothPercent;
}

/** A company's own price book: the one locked when it signed up, or the original prices for a company from before that. */
export function lockedBook(row: { lockedMonthlyCents?: number | null; lockedYearlyCents?: number | null; lockedBothPercent?: number | null } | null | undefined): PriceBook {
  if (!row || row.lockedMonthlyCents == null || row.lockedYearlyCents == null || row.lockedBothPercent == null) return { ...DEFAULT_BOOK };
  return { monthlyCents: row.lockedMonthlyCents, yearlyCents: row.lockedYearlyCents, bothPercent: row.lockedBothPercent };
}

// ---- promo codes ---------------------------------------------------------------------------------------------------

export type PromoKind = "percent" | "amount";
export type PromoPlan = "any" | PlanKind;

export type Promo = {
  code: string;
  kind: PromoKind;
  /** Percent (1 to 100) or whole cents, by kind. */
  value: number;
  plan: PromoPlan;
  maxUses: number | null;
  usedCount: number;
  startsOn: string | null;
  endsOn: string | null;
  active: boolean;
};

/** A code as people type it: capitals, no spaces, only letters, numbers and hyphens. Empty when nothing usable was typed. */
export function normalizeCode(raw: unknown): string {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24);
}

export const isCodeShape = (c: string) => /^[A-Z0-9][A-Z0-9-]{2,23}$/.test(c);

/** The plain reason a promo code cannot be used right now, or null when it can. `today` is "YYYY-MM-DD". */
export function promoProblem(p: Promo, ctx: { plan: PlanKind | null; today: string }): string | null {
  if (!p.active) return "That promo code is not active.";
  if (p.startsOn && ctx.today < p.startsOn) return "That promo code has not started yet.";
  if (p.endsOn && ctx.today > p.endsOn) return "That promo code has expired.";
  if (p.maxUses != null && p.usedCount >= p.maxUses) return "That promo code has been used the most times it allows.";
  if (p.plan !== "any" && ctx.plan && p.plan !== ctx.plan) return `That promo code is only for the ${p.plan === "monthly" ? "Monthly" : "Yearly"} plan.`;
  return null;
}

/** Money off the first payment; never more than the payment itself. */
export function discountFor(p: Pick<Promo, "kind" | "value">, firstPaymentCents: number): number {
  if (firstPaymentCents <= 0) return 0;
  const off = p.kind === "percent" ? Math.round((firstPaymentCents * p.value) / 100) : p.value;
  return Math.min(Math.max(0, off), firstPaymentCents);
}

export function describePromo(p: Pick<Promo, "kind" | "value" | "plan">, usd: (cents: number) => string): string {
  const what = p.kind === "percent" ? `${p.value}% off` : `${usd(p.value)} off`;
  const only = p.plan === "any" ? "" : ` (${p.plan === "monthly" ? "Monthly" : "Yearly"} plan only)`;
  return `${what} your first payment${only}`;
}

export type PromoInput = { code: unknown; kind: unknown; value: unknown; plan: unknown; maxUses: unknown; startsOn: unknown; endsOn: unknown };
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A new promo code as typed in the admin, or the plain reason it cannot be saved. */
export function validatePromo(i: PromoInput): { ok: true; promo: Omit<Promo, "usedCount" | "active"> } | { ok: false; error: string } {
  const code = normalizeCode(i.code);
  if (!isCodeShape(code)) return { ok: false, error: "The code must be 3 to 24 letters, numbers or hyphens, for example BLACKFRIDAY." };
  const kind: PromoKind | null = i.kind === "percent" || i.kind === "amount" ? i.kind : null;
  if (!kind) return { ok: false, error: "Choose percent off or dollars off." };
  let value: number;
  if (kind === "percent") {
    value = Number(String(i.value ?? "").trim());
    if (!Number.isInteger(value) || value < 1 || value > 100) return { ok: false, error: "Percent off must be a whole number from 1 to 100." };
  } else {
    const c = parseDollars(i.value);
    if (c === null || c < 100) return { ok: false, error: "Dollars off must be an amount such as 100 or 49.50." };
    value = c;
  }
  const plan: PromoPlan = i.plan === "monthly" || i.plan === "yearly" ? i.plan : "any";
  const maxRaw = String(i.maxUses ?? "").trim();
  let maxUses: number | null = null;
  if (maxRaw) {
    maxUses = Number(maxRaw);
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1_000_000) return { ok: false, error: "How many times it can be used must be a whole number, or left empty for no limit." };
  }
  const startsOn = String(i.startsOn ?? "").trim() || null;
  const endsOn = String(i.endsOn ?? "").trim() || null;
  if ((startsOn && !DAY.test(startsOn)) || (endsOn && !DAY.test(endsOn))) return { ok: false, error: "Dates must be day, month and year as chosen in the date box." };
  if (startsOn && endsOn && endsOn < startsOn) return { ok: false, error: "The last day cannot be before the first day." };
  return { ok: true, promo: { code, kind, value, plan, maxUses, startsOn, endsOn } };
}

// ---- affiliates ----------------------------------------------------------------------------------------------------

/**
 * The affiliate's one-time cut, from the company's own plan and locked price: 40% of ONE month's price on a monthly plan, 15% of the
 * YEAR's price on a yearly plan. `priceCents` is that plan's regular price (before the company's 10% off).
 */
export function affiliateCut(plan: PlanKind, priceCents: number): number {
  if (priceCents <= 0) return 0;
  const percent = plan === "yearly" ? AFFILIATE_YEARLY_PERCENT : AFFILIATE_MONTHLY_PERCENT;
  return Math.round((priceCents * percent) / 100);
}

/**
 * What a company referred by an affiliate saves: 10% off the plan's regular price. `payments` is how many payments carry it: the
 * first 3 monthly payments, or the one yearly payment. `totalCents` is the whole saving.
 */
export function referredDiscount(plan: PlanKind, priceCents: number): { perPaymentCents: number; payments: number; totalCents: number } {
  const perPaymentCents = priceCents > 0 ? Math.round((priceCents * REFERRED_DISCOUNT_PERCENT) / 100) : 0;
  const payments = plan === "yearly" ? 1 : AFFILIATE_MONTHS;
  return { perPaymentCents, payments, totalCents: perPaymentCents * payments };
}

/**
 * A promo code and an affiliate code never stack: the company gets whichever saves it more. `promoFirstPaymentOffCents` is what the
 * promo takes off the first payment. Returns which one applies and how much it saves in total.
 */
export function bestOffer(plan: PlanKind, priceCents: number, promoFirstPaymentOffCents: number | null, hasAffiliate: boolean): { source: "none" | "promo" | "affiliate"; totalCents: number } {
  const promo = promoFirstPaymentOffCents && promoFirstPaymentOffCents > 0 ? promoFirstPaymentOffCents : 0;
  const aff = hasAffiliate ? referredDiscount(plan, priceCents).totalCents : 0;
  if (aff > 0 && aff >= promo) return { source: "affiliate", totalCents: aff };
  if (promo > 0) return { source: "promo", totalCents: promo };
  return { source: "none", totalCents: 0 };
}

/** The numbers for the public worked example, from a price book (never typed on a page). */
export function affiliateExampleNumbers(book: PriceBook, ops: OperationCount = 1) {
  const monthlyCents = monthlyPrice(book, ops);
  const yearlyCents = yearlyPrice(book, ops);
  return {
    monthlyCents,
    yearlyCents,
    monthlyCutCents: affiliateCut("monthly", monthlyCents),
    yearlyCutCents: affiliateCut("yearly", yearlyCents),
    monthlyOffCents: referredDiscount("monthly", monthlyCents).perPaymentCents,
    yearlyOffCents: referredDiscount("yearly", yearlyCents).perPaymentCents,
  };
}

/** The card fee we assume when checking that a payout is safe: 2.9% plus 30 cents per payment (not returned when a payment is refunded). */
export const CARD_FEE_PERCENT = 2.9;
export const CARD_FEE_FIXED_CENTS = 30;

/**
 * The worst case for us on one referral, in cents: the company cancels the moment its affiliate qualifies. Monthly plan: we have
 * received 3 payments (each 10% off), no refund; yearly plan: the company paid the year at 10% off and gets the unused 9 of 12 months
 * refunded, so we keep only 3/12. Result = what we keep, minus the affiliate's cut, minus card fees. It should stay above zero.
 */
export function affiliateWorstCase(plan: PlanKind, priceCents: number): { keptCents: number; cutCents: number; feesCents: number; netCents: number } {
  const off = referredDiscount(plan, priceCents);
  const paid = priceCents - off.perPaymentCents;
  const fee = (amount: number) => Math.round((amount * CARD_FEE_PERCENT) / 100) + CARD_FEE_FIXED_CENTS;
  const keptCents = plan === "yearly" ? Math.round((paid * AFFILIATE_MONTHS) / 12) : paid * AFFILIATE_MONTHS;
  const feesCents = plan === "yearly" ? fee(paid) : fee(paid) * AFFILIATE_MONTHS;
  const cutCents = affiliateCut(plan, priceCents);
  return { keptCents, cutCents, feesCents, netCents: keptCents - cutCents - feesCents };
}

export const validPercent = (v: unknown): number | null => {
  const n = Number(String(v ?? "").trim());
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null;
};

/**
 * The first day a referral can count as earned. Monthly plan: the day of the company's THIRD full monthly payment (a prorated first
 * part-month is not a month). Yearly plan: the company pays the whole year up front, so it is earned once the company has been on the
 * platform for 3 months from its first billing day.
 */
export function affiliateQualifiesOn(plan: PlanKind, firstBillableOn: string): string {
  if (plan === "yearly") return addMonths(firstBillableOn, AFFILIATE_MONTHS);
  const full = chargeSchedule("monthly", firstBillableOn, AFFILIATE_MONTHS + 1).filter((c) => c.kind === "monthly");
  return full[AFFILIATE_MONTHS - 1].date;
}

/** How many of the 3 months the company has completed by `today` (0 to 3), for "1 of 3 months". */
export function affiliateMonthsDone(plan: PlanKind, firstBillableOn: string, today: string): number {
  if (today < firstBillableOn) return 0;
  if (plan === "yearly") {
    let n = 0;
    while (n < AFFILIATE_MONTHS && addMonths(firstBillableOn, n + 1) <= today) n++;
    return n;
  }
  const done = chargeSchedule("monthly", firstBillableOn, AFFILIATE_MONTHS + 1).filter((c) => c.kind === "monthly" && c.date <= today).length;
  return Math.min(done, AFFILIATE_MONTHS);
}

export type ReferralStatus = "waiting" | "owed" | "paid" | "void";

export const REFERRAL_LABEL: Record<ReferralStatus, string> = {
  waiting: "Waiting for 3 months of billing",
  owed: "Owed to the affiliate",
  paid: "Paid",
  void: "Not earned",
};

/**
 * Where one referral stands. Paid once the owner marked it paid; not earned if the company stopped (cancelled, closed or suspended)
 * before its third month; owed once the company has been billed for 3 months and its payments are current (only possible while billing
 * is live); otherwise still waiting.
 */
export function referralStatus(i: { paidAt: string | null; endedBeforeQualifying: boolean; qualified: boolean }): ReferralStatus {
  if (i.paidAt) return "paid";
  if (i.endedBeforeQualifying) return "void";
  return i.qualified ? "owed" : "waiting";
}
