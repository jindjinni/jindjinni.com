// The affiliate program, in one place: the rule (one kind of affiliate, one rate) and the public words, so the Affiliates page, the
// home page, the Terms and the Lamp all say the same thing. Decided by the platform owner:
//  - There is ONE kind of affiliate. No tiers, no negotiated rates.
//  - An affiliate earns a ONE-TIME payout of 50% of one month's subscription price for each company they refer, whichever plan the
//    company picked (a yearly company earns the affiliate the same: 50% of its monthly price).
//  - It is earned only once the company has been billed on the platform for 3 months. Monthly plan: its third full monthly payment
//    has gone through. Yearly plan: it paid the year up front and has been on the platform for 3 months.
//  - If the company cancels or is suspended before that, nothing is owed. It is not ongoing.
//  - Affiliates are paid by DIRECT DEPOSIT only.
//  - An approved affiliate has a private portal (/affiliate) showing only the companies still working toward their 3 months. Once a
//    company's payout has been paid it disappears from the portal for good (see affiliate-portal-rules.ts).
// No prices are written here: the example on the Affiliates page is worked out from the price book.

export const AFFILIATE_PERCENT = 50;
export const AFFILIATE_MONTHS = 3;

export const AFFILIATE_PROGRAM = {
  eyebrow: "Affiliate program",
  title: "Know a company that should be on jindjinni? Get paid for the introduction.",
  summary: `Refer a wholesaler or distributor. When they have been billed on our platform for ${AFFILIATE_MONTHS} months, you earn a one-time payout of ${AFFILIATE_PERCENT}% of one month's subscription.`,
  /** The headline numbers. */
  facts: [
    { value: `${AFFILIATE_PERCENT}%`, label: "of one month's subscription" },
    { value: "One time", label: "for each company you refer" },
    { value: `${AFFILIATE_MONTHS} months`, label: "billed on the platform to qualify" },
  ],
  steps: [
    { title: "Apply", body: "Tell us a little about yourself. We review every request and email you our answer." },
    { title: "Share your link", body: "Once approved, you get your own code, your link and a private portal. A company signs up through the link or types your code at sign-up." },
    { title: "They stay", body: `The company is billed on jindjinni for ${AFFILIATE_MONTHS} months. That is what qualifies you.` },
    { title: "You get paid", body: `You receive your one-time ${AFFILIATE_PERCENT}% payout by direct deposit. It is not ongoing.` },
  ],
  rules: [
    `There is one kind of affiliate and one rate: ${AFFILIATE_PERCENT}%.`,
    `The payout is ${AFFILIATE_PERCENT}% of one month's subscription for the plan the company picked. A company on a yearly plan earns you the same: ${AFFILIATE_PERCENT}% of one month.`,
    `To qualify, the company you refer must be billed on our platform for ${AFFILIATE_MONTHS} months. On a monthly plan, that means its third full monthly payment has gone through. On a yearly plan, it has paid for the year and stayed ${AFFILIATE_MONTHS} months.`,
    "If the company cancels or is suspended before then, no payout is earned.",
    "It is a one-time payout for each company. It is not a continuing commission.",
    "The company you refer gets no discount from an affiliate code, and pays the normal price.",
    "We pay you after the qualifying payment has been received, by direct deposit only.",
    `Once you are approved you get a private affiliate portal to follow the companies you referred. A company drops off your list for good once your payout for it has been paid.`,
  ],
};

/** The worked example on the public pages, from the price book (never typed): what an affiliate earns for a one-operation company. */
export function affiliateExample(monthlyCents: number, cutCents: number, usd: (cents: number) => string): string {
  return `At today's price, a company on the one-operation plan pays ${usd(monthlyCents)} a month, so its affiliate earns ${usd(cutCents)}, one time, once that company has been billed for ${AFFILIATE_MONTHS} months. Running both operations costs more, so the payout is ${AFFILIATE_PERCENT}% of that higher month.`;
}
