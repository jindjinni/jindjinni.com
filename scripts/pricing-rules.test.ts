import { DEFAULT_BOOK, affiliateCut, affiliateExampleNumbers, affiliateWorstCase, bestOffer, referredDiscount, affiliateMonthsDone, affiliateQualifiesOn, describePromo, discountFor, lockedBook, monthlyPrice, normalizeCode, operationsFor, parseDollars, planAmount, promoProblem, referralStatus, sameBook, validateBook, validatePromo, validPercent, yearlyPrice, yearlyRegular, yearlySavings, type Promo } from "../src/lib/pricing-rules";
import { usd } from "../src/lib/billing-config";
import { addMonths, chargeSchedule } from "../src/lib/billing-schedule";
import { cancellationOutcome } from "../src/lib/cancellation";
let f = 0; const t = (n: string, c: boolean) => { if (!c) { f++; console.log("FAIL", n); } };
const B = DEFAULT_BOOK;
t("defaults are the original prices", B.monthlyCents === 97700 && B.yearlyCents === 1049900 && B.bothPercent === 40);
t("one operation: $977 / $10,499, regular $11,724, saves $1,225", monthlyPrice(B, 1) === 97700 && yearlyPrice(B, 1) === 1049900 && yearlyRegular(B, 1) === 1172400 && yearlySavings(B, 1) === 122500);
t("both operations: $1,367.80 / $14,698.60", monthlyPrice(B, 2) === 136780 && yearlyPrice(B, 2) === 1469860);
t("both: regular $16,413.60, saves $1,715", yearlyRegular(B, 2) === 1641360 && yearlySavings(B, 2) === 171500);
t("money shows with cents only when needed", usd(monthlyPrice(B, 2)) === "$1,367.80" && usd(monthlyPrice(B, 1)) === "$977" && usd(yearlyPrice(B, 2)) === "$14,698.60");
t("planAmount", planAmount(B, "monthly", 2) === 136780 && planAmount(B, "yearly", 1) === 1049900);
t("a different percent and price", monthlyPrice({ monthlyCents: 100000, yearlyCents: 1000000, bothPercent: 25 }, 2) === 125000);
t("odd cents round to the nearest cent", monthlyPrice({ monthlyCents: 9999, yearlyCents: 90000, bothPercent: 33 }, 2) === 13299);
t("0 percent means both cost the same", monthlyPrice({ ...B, bothPercent: 0 }, 2) === 97700);
t("operationsFor", operationsFor("BOTH") === 2 && operationsFor("WHOLESALER") === 1 && operationsFor("DISTRIBUTOR") === 1 && operationsFor(null) === 1 && operationsFor("junk") === 1);
t("parseDollars", parseDollars("977") === 97700 && parseDollars("$1,367.80") === 136780 && parseDollars("49.5") === 4950 && parseDollars("12.345") === null && parseDollars("abc") === null && parseDollars("") === null && parseDollars("-5") === null);
const ok = validateBook({ monthly: "977", yearly: "10499", bothPercent: "40" });
t("validateBook accepts today's prices", ok.ok && sameBook(ok.book, B));
t("validateBook refuses a yearly price above twelve months", !validateBook({ monthly: "100", yearly: "1300", bothPercent: "40" }).ok);
t("validateBook refuses junk", !validateBook({ monthly: "x", yearly: "10", bothPercent: "40" }).ok && !validateBook({ monthly: "977", yearly: "10499", bothPercent: "-1" }).ok && !validateBook({ monthly: "977", yearly: "10499", bothPercent: "4.5" }).ok && !validateBook({ monthly: "977", yearly: "10499", bothPercent: "301" }).ok && !validateBook({ monthly: "0.5", yearly: "1", bothPercent: "1" }).ok);
t("lockedBook falls back to the original prices", sameBook(lockedBook(null), B) && sameBook(lockedBook({}), B) && sameBook(lockedBook({ lockedMonthlyCents: 1, lockedYearlyCents: 2, lockedBothPercent: null }), B));
t("lockedBook uses the locked values", sameBook(lockedBook({ lockedMonthlyCents: 90000, lockedYearlyCents: 900000, lockedBothPercent: 30 }), { monthlyCents: 90000, yearlyCents: 900000, bothPercent: 30 }));
// promo codes
t("normalizeCode", normalizeCode(" black friday! 25 ") === "BLACKFRIDAY25" && normalizeCode("a-b") === "A-B" && normalizeCode(null) === "" && normalizeCode("x".repeat(50)).length === 24);
const P: Promo = { code: "BF25", kind: "percent", value: 25, plan: "any", maxUses: 2, usedCount: 0, startsOn: "2026-11-20", endsOn: "2026-11-30", active: true };
t("promo ok inside its dates", promoProblem(P, { plan: "monthly", today: "2026-11-27" }) === null);
t("promo before start / after end", /not started/.test(promoProblem(P, { plan: null, today: "2026-11-19" }) ?? "") && /expired/.test(promoProblem(P, { plan: null, today: "2026-12-01" }) ?? ""));
t("promo first and last day work", promoProblem(P, { plan: null, today: "2026-11-20" }) === null && promoProblem(P, { plan: null, today: "2026-11-30" }) === null);
t("promo used up / inactive / wrong plan", /most times/.test(promoProblem({ ...P, usedCount: 2 }, { plan: null, today: "2026-11-25" }) ?? "") && /not active/.test(promoProblem({ ...P, active: false }, { plan: null, today: "2026-11-25" }) ?? "") && /Yearly plan/.test(promoProblem({ ...P, plan: "yearly" }, { plan: "monthly", today: "2026-11-25" }) ?? ""));
t("promo with no plan chosen yet is not refused for its plan", promoProblem({ ...P, plan: "yearly" }, { plan: null, today: "2026-11-25" }) === null);
t("discountFor percent and amount", discountFor({ kind: "percent", value: 25 }, 1049900) === 262475 && discountFor({ kind: "amount", value: 10000 }, 97700) === 10000);
t("discount never exceeds the payment", discountFor({ kind: "amount", value: 500000 }, 97700) === 97700 && discountFor({ kind: "percent", value: 100 }, 12345) === 12345 && discountFor({ kind: "percent", value: 10 }, 0) === 0);
t("describePromo", describePromo({ kind: "percent", value: 25, plan: "any" }, usd) === "25% off your first payment" && describePromo({ kind: "amount", value: 10000, plan: "yearly" }, usd) === "$100 off your first payment (Yearly plan only)");
const v = validatePromo({ code: "black-friday", kind: "percent", value: "25", plan: "any", maxUses: "", startsOn: "2026-11-20", endsOn: "2026-11-30" });
t("validatePromo accepts a good code", v.ok && v.promo.code === "BLACK-FRIDAY" && v.promo.value === 25 && v.promo.maxUses === null);
const va = validatePromo({ code: "Save100", kind: "amount", value: "$100", plan: "yearly", maxUses: "50", startsOn: "", endsOn: "" });
t("validatePromo amount in cents", va.ok && va.promo.value === 10000 && va.promo.maxUses === 50 && va.promo.plan === "yearly");
t("validatePromo refuses bad input", !validatePromo({ code: "a", kind: "percent", value: "5", plan: "any", maxUses: "", startsOn: "", endsOn: "" }).ok && !validatePromo({ code: "GOOD", kind: "percent", value: "0", plan: "any", maxUses: "", startsOn: "", endsOn: "" }).ok && !validatePromo({ code: "GOOD", kind: "percent", value: "101", plan: "any", maxUses: "", startsOn: "", endsOn: "" }).ok && !validatePromo({ code: "GOOD", kind: "x", value: "5", plan: "any", maxUses: "", startsOn: "", endsOn: "" }).ok && !validatePromo({ code: "GOOD", kind: "percent", value: "5", plan: "any", maxUses: "0", startsOn: "", endsOn: "" }).ok && !validatePromo({ code: "GOOD", kind: "percent", value: "5", plan: "any", maxUses: "", startsOn: "2026-12-01", endsOn: "2026-11-01" }).ok && !validatePromo({ code: "GOOD", kind: "amount", value: "0.50", plan: "any", maxUses: "", startsOn: "", endsOn: "" }).ok);
// affiliates
t("affiliateCut: 40% of one month on a monthly plan", affiliateCut("monthly", 97700) === 39080 && affiliateCut("monthly", 0) === 0 && affiliateCut("monthly", 136780) === 54712);
t("affiliateCut: 15% of the year on a yearly plan", affiliateCut("yearly", 1049900) === 157485 && affiliateCut("yearly", 0) === 0 && affiliateCut("yearly", yearlyPrice(B, 2)) === Math.round(yearlyPrice(B, 2) * 0.15));
t("the cut is worked on the regular price, not the discounted one", affiliateCut("monthly", monthlyPrice(B, 1)) === 39080 && affiliateCut("yearly", yearlyPrice(B, 1)) === 157485);
const dm = referredDiscount("monthly", 97700), dy = referredDiscount("yearly", 1049900);
t("referred company: 10% off each of the first 3 monthly payments", dm.perPaymentCents === 9770 && dm.payments === 3 && dm.totalCents === 29310);
t("referred company: 10% off the yearly payment", dy.perPaymentCents === 104990 && dy.payments === 1 && dy.totalCents === 104990);
t("a promo and an affiliate never stack: the bigger one wins", bestOffer("monthly", 97700, null, true).source === "affiliate" && bestOffer("monthly", 97700, 50000, true).source === "promo" && bestOffer("monthly", 97700, 50000, true).totalCents === 50000 && bestOffer("yearly", 1049900, 5000, true).totalCents === 104990 && bestOffer("monthly", 97700, 5000, false).source === "promo" && bestOffer("monthly", 97700, null, false).source === "none");
// we must not lose money: the worst case is the company cancelling the moment its affiliate qualifies
for (const ops of [1, 2] as const) {
  const m = affiliateWorstCase("monthly", monthlyPrice(B, ops)), y = affiliateWorstCase("yearly", yearlyPrice(B, ops));
  t(`worst case stays above zero (${ops} operation${ops === 2 ? "s" : ""})`, m.netCents > 0 && y.netCents > 0);
}
const wy = affiliateWorstCase("yearly", 1049900), wm = affiliateWorstCase("monthly", 97700);
t("worst case, yearly: keep 3/12 of the discounted year, pay 15%, card fees", wy.keptCents === 236228 && wy.cutCents === 157485 && wy.netCents === 236228 - 157485 - wy.feesCents && wy.netCents > 50000);
t("worst case, monthly: three discounted payments kept, pay 40% of a month", wm.keptCents === 263790 && wm.cutCents === 39080 && wm.netCents > 200000);
t("a 20% yearly payout would NOT be safe at 3 months (why it is 15%)", (() => { const k = wy.keptCents, fees = wy.feesCents; return k - Math.round(1049900 * 0.20) - fees < 0; })());
const ex = affiliateExampleNumbers(B, 1);
t("example numbers come from the book", ex.monthlyCents === 97700 && ex.yearlyCents === 1049900 && ex.monthlyCutCents === 39080 && ex.yearlyCutCents === 157485 && ex.monthlyOffCents === 9770 && ex.yearlyOffCents === 104990);
t("validPercent", validPercent("10") === 10 && validPercent("0") === null && validPercent("101") === null && validPercent("2.5") === null && validPercent("") === null);
t("referralStatus", referralStatus({ paidAt: null, endedBeforeQualifying: false, qualified: false }) === "waiting" && referralStatus({ paidAt: null, endedBeforeQualifying: false, qualified: true }) === "owed" && referralStatus({ paidAt: null, endedBeforeQualifying: true, qualified: false }) === "void" && referralStatus({ paidAt: "2026-12-01", endedBeforeQualifying: true, qualified: true }) === "paid");
// 3 months billed: monthly = the third FULL monthly payment; yearly = 3 months on the platform from the first billing day
t("monthly qualifies on the 3rd full payment (starting on the 1st)", affiliateQualifiesOn("monthly", "2026-11-01") === "2027-01-01");
t("a prorated first part-month does not count as a month", affiliateQualifiesOn("monthly", "2026-11-16") === "2027-02-01");
t("yearly qualifies after 3 months on the platform", affiliateQualifiesOn("yearly", "2026-11-16") === "2027-02-16" && affiliateQualifiesOn("yearly", "2026-11-30") === "2027-02-28");
t("months done, monthly", affiliateMonthsDone("monthly", "2026-11-01", "2026-10-31") === 0 && affiliateMonthsDone("monthly", "2026-11-01", "2026-11-01") === 1 && affiliateMonthsDone("monthly", "2026-11-01", "2027-01-01") === 3 && affiliateMonthsDone("monthly", "2026-11-01", "2030-01-01") === 3);
t("months done, yearly", affiliateMonthsDone("yearly", "2026-11-16", "2026-12-15") === 0 && affiliateMonthsDone("yearly", "2026-11-16", "2026-12-16") === 1 && affiliateMonthsDone("yearly", "2026-11-16", "2027-02-16") === 3);
t("addMonths clamps to the month's last day", addMonths("2026-11-30", 3) === "2027-02-28" && addMonths("2027-01-31", 1) === "2027-02-28" && addMonths("2026-12-15", 1) === "2027-01-15" && addMonths("2026-01-31", 13) === "2027-02-28");
// the billing calendar and refunds follow a company's own price
const both = { monthlyCents: monthlyPrice(B, 2), yearlyCents: yearlyPrice(B, 2) };
t("monthly charges use the company's price", chargeSchedule("monthly", "2026-11-01", 2, both).every((c) => c.amountCents === 136780));
t("the prorated first charge uses it too (15 of 30 days)", chargeSchedule("monthly", "2026-11-16", 1, both)[0].amountCents === 68390);
t("yearly charge uses it", chargeSchedule("yearly", "2026-11-16", 2, both).every((c) => c.amountCents === 1469860));
t("no price given = the original prices", chargeSchedule("monthly", "2026-11-01", 1)[0].amountCents === 97700 && chargeSchedule("yearly", "2026-11-01", 1)[0].amountCents === 1049900);
const one = cancellationOutcome({ plan: "yearly", today: "2027-03-10", firstBillableOn: "2026-11-16", paid: true });
const bothOut = cancellationOutcome({ plan: "yearly", today: "2027-03-10", firstBillableOn: "2026-11-16", paid: true, yearlyCents: both.yearlyCents });
t("a yearly refund follows the company's price", bothOut.refundCents > one.refundCents && Math.abs(bothOut.refundCents / one.refundCents - 1.4) < 0.001);
console.log(f ? `${f} failed` : "Pricing rules: all passed"); process.exit(f ? 1 : 0);
