// What the platform costs, and whether billing is switched on. The sign-up page's Plan & Payment section reads this file.
// BILLING_LIVE is false for now: people can pick a plan and read how billing will work, but no card or bank details are asked
// for or stored. When billing goes live, the card form must use the payment provider's own hosted fields so card numbers never
// reach our servers. We only do auto-pay: a card or debit card on file, charged automatically.

export const BILLING_LIVE = false;

/** Prices in cents. The yearly "regular" price is just twelve months, shown crossed out beside the discounted yearly price. */
export const MONTHLY_CENTS = 97_700; // $977 / month
export const YEARLY_CENTS = 1_049_900; // $10,499 / year

export const YEARLY_REGULAR_CENTS = MONTHLY_CENTS * 12; // $11,724
export const YEARLY_SAVINGS_CENTS = YEARLY_REGULAR_CENTS - YEARLY_CENTS; // $1,225

export type BillingPlan = "monthly" | "yearly";
export const BILLING_PLANS: readonly BillingPlan[] = ["monthly", "yearly"];

/** "$977", "$10,499", or "$874.92" when there are cents. */
export function usd(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export function parseBillingPlan(raw: unknown): BillingPlan | null {
  return raw === "monthly" || raw === "yearly" ? raw : null;
}
