// The affiliate program, in one place: the rule (one kind of affiliate) and the public words, so the Affiliates page, the home page,
// the Terms, the emails and the Lamp all say the same thing. Decided by the platform owner:
//  - There is ONE kind of affiliate. No tiers, no negotiated rates.
//  - The company an affiliate refers gets 10% off: on a MONTHLY plan, off each of its first 3 monthly payments; on a YEARLY plan, off
//    the year's payment. (A promo code and an affiliate code do not stack: the company gets whichever is bigger.)
//  - The affiliate earns a ONE-TIME payout, once, for each company: MONTHLY plan = 40% of one month's price; YEARLY plan = 15% of the
//    year's price. Both are percentages of the company's own list price (before its 10% off), so "Both operations" scales on its own.
//  - It is earned only once the company has been billed on the platform for 3 months. Monthly plan: its third full monthly payment
//    has gone through. Yearly plan: it paid the year up front and has been on the platform for 3 months.
//  - Why yearly is 15% and not more: a yearly company that cancels gets the unused part of the year refunded, so right at month 3 we have
//    kept only 3/12 of what it paid. 15% leaves us ahead even then, after card fees (affiliateWorstCase in pricing-rules.ts is tested).
//  - If the company cancels, is suspended, or its payment is reversed before the payout is paid, nothing is owed. It is not ongoing.
//  - Affiliates are paid by DIRECT DEPOSIT only.
//  - An approved affiliate has a private portal (/affiliate) showing only the companies still working toward their 3 months. Once a
//    company's payout has been paid it disappears from the portal for good (see affiliate-portal-rules.ts).
// No prices are written here: the examples on the public pages are worked out from the price book.

export const REFERRED_DISCOUNT_PERCENT = 10;
export const AFFILIATE_MONTHLY_PERCENT = 40;
export const AFFILIATE_YEARLY_PERCENT = 15;
export const AFFILIATE_MONTHS = 3;

export const AFFILIATE_PROGRAM = {
  eyebrow: "Affiliate program",
  title: "Know a company that should be on jindjinni? Get paid for the introduction.",
  summary: `Refer a wholesaler or distributor. They save ${REFERRED_DISCOUNT_PERCENT}%. When they have been billed on our platform for ${AFFILIATE_MONTHS} months, you earn a one-time payout: ${AFFILIATE_MONTHLY_PERCENT}% of a month if they pay monthly, or ${AFFILIATE_YEARLY_PERCENT}% of the year if they pay yearly.`,
  /** The headline numbers. */
  facts: [
    { value: `${REFERRED_DISCOUNT_PERCENT}% off`, label: "for the company you refer" },
    { value: `${AFFILIATE_MONTHLY_PERCENT}% or ${AFFILIATE_YEARLY_PERCENT}%`, label: "one time for you, by monthly or yearly plan" },
    { value: `${AFFILIATE_MONTHS} months`, label: "billed on the platform to qualify" },
  ],
  steps: [
    { title: "Apply", body: "Tell us a little about yourself. We review every request and email you our answer." },
    { title: "Share your link", body: `Once approved, you get your own code, your link and a private portal. A company signs up through the link or types your code at sign-up, and saves ${REFERRED_DISCOUNT_PERCENT}%.` },
    { title: "They stay", body: `The company is billed on jindjinni for ${AFFILIATE_MONTHS} months. That is what qualifies you.` },
    { title: "You get paid", body: "You receive your one-time payout by direct deposit. It is not ongoing." },
  ],
  rules: [
    "There is one kind of affiliate and one rate for each plan.",
    `The company you refer gets ${REFERRED_DISCOUNT_PERCENT}% off. On a monthly plan, that is off each of its first ${AFFILIATE_MONTHS} monthly payments. On a yearly plan, it is off the year's payment. A promo code and an affiliate code do not stack: the company gets whichever is bigger.`,
    `Your payout is ${AFFILIATE_MONTHLY_PERCENT}% of one month's subscription if the company pays monthly, or ${AFFILIATE_YEARLY_PERCENT}% of the yearly subscription if it pays yearly. Both are worked out on the plan's regular price, before the company's ${REFERRED_DISCOUNT_PERCENT}% off.`,
    `To qualify, the company you refer must be billed on our platform for ${AFFILIATE_MONTHS} months. On a monthly plan, that means its third full monthly payment has gone through. On a yearly plan, it has paid for the year and stayed ${AFFILIATE_MONTHS} months.`,
    "If the company cancels or is suspended before then, or its payment is reversed or charged back, no payout is earned.",
    "It is a one-time payout for each company. It is not a continuing commission.",
    "You cannot refer your own company.",
    "We pay you after the qualifying payment has been received, by direct deposit only.",
    "Once you are approved you get a private affiliate portal to follow the companies you referred. A company drops off your list for good once your payout for it has been paid.",
  ],
};

/** The worked examples on the public pages, from the price book (never typed): what the new company pays and what its affiliate earns. */
export function affiliateExample(
  e: { monthlyCents: number; yearlyCents: number; monthlyCutCents: number; yearlyCutCents: number; monthlyOffCents: number; yearlyOffCents: number },
  usd: (cents: number) => string,
): string {
  return `At today's price, a company on the one-operation plan pays ${usd(e.monthlyCents)} a month, or ${usd(e.yearlyCents)} a year. Through your link it saves ${usd(e.monthlyOffCents)} a month for its first ${AFFILIATE_MONTHS} months, or ${usd(e.yearlyOffCents)} on the year. You earn ${usd(e.monthlyCutCents)} if it pays monthly or ${usd(e.yearlyCutCents)} if it pays yearly, one time, once it has been billed for ${AFFILIATE_MONTHS} months. Running both operations costs more, so everything is worked out on that higher price.`;
}
