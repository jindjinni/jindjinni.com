import assert from "node:assert/strict";
import { AUDIENCES, BANNED_WORDS, BOTH, BOTH_POINTS, DIRECT_SOURCING, DISTRIBUTION, OPERATIONS, SAFETY_CHECKS, SAFETY_LIMITS, WHOLESALE } from "../src/lib/landing-content";
import { DEPARTMENT_MENUS } from "../src/lib/sidebar-menu";
import { AFFILIATE_MONTHLY_PERCENT, AFFILIATE_MONTHS, AFFILIATE_PROGRAM, AFFILIATE_YEARLY_PERCENT, REFERRED_DISCOUNT_PERCENT, affiliateExample } from "../src/lib/affiliate-program";
import { OPERATION_OPTIONS, readSignupChoice, signupHref } from "../src/lib/operation-type";

const all = (): string[] => {
  const out: string[] = [];
  for (const c of Object.values(OPERATIONS)) {
    out.push(c.name, c.tagline, c.intro, c.forWhom, ...c.day, ...c.cardPoints);
    for (const d of c.depts) out.push(d.dept, d.line, ...d.points);
  }
  for (const b of BOTH_POINTS) out.push(b.title, b.body);
  for (const a of AUDIENCES) out.push(a.title, a.body);
  for (const k of SAFETY_CHECKS) out.push(k.title, k.body);
  out.push(DIRECT_SOURCING.title, DIRECT_SOURCING.body, ...DIRECT_SOURCING.steps.flatMap((x) => [x.title, x.body]));
  out.push(SAFETY_LIMITS);
  return out;
};

// shape
assert.deepEqual(Object.keys(OPERATIONS).sort(), ["both", "distribution", "wholesale"]);
for (const [slug, c] of Object.entries(OPERATIONS)) assert.equal(c.slug, slug);
assert.ok(WHOLESALE.day.length === 4 && DISTRIBUTION.day.length === 4);
assert.equal(BOTH.depts.length, 0, "Both is built from the other two");

// both sides cover the same departments, in the same order, so the Both page can set them side by side
assert.deepEqual(WHOLESALE.depts.map((d) => d.dept), DISTRIBUTION.depts.map((d) => d.dept));
for (const d of [...WHOLESALE.depts, ...DISTRIBUTION.depts]) {
  assert.ok(d.line.length > 20 && d.points.length >= 2, d.dept);
}

// every real department with a menu is explained (Marketing, HR and Chat are grouped in one block)
const titles = new Set(WHOLESALE.depts.map((d) => d.dept));
for (const dept of ["Purchasing", "Receiving", "Accounts", "Customer Service", "Inventory", "Sales", "Shipping"]) assert.ok(titles.has(dept), dept);
assert.ok(titles.has("Marketing, HR and Chat"));
assert.equal(Object.keys(DEPARTMENT_MENUS).length, 9, "a new department needs its words added to landing-content.ts, then update this number");

// the Wholesale side is "direct sourcing from sellers"; the word "individual" is not used for it anywhere
assert.equal(DIRECT_SOURCING.steps.length, 4);
// the payment-details link and the care taken with sellers' bank details are described, without promises
assert.ok(WHOLESALE.depts.find((d) => d.dept === "Purchasing")!.points.join(" ").toLowerCase().includes("one-time link"));
assert.ok(WHOLESALE.depts.find((d) => d.dept === "Accounts")!.points.join(" ").toLowerCase().includes("erased once you pay"));
assert.ok(!/individual/i.test(all().join(" ") + OPERATION_OPTIONS.map((o) => o.description + o.details.join(" ")).join(" ")), "no 'individual' on the public pages");
assert.ok(/direct/i.test(WHOLESALE.intro) && /direct/i.test(OPERATION_OPTIONS[0].description));

// no prices, no promises
const text = all().join(" \n ").toLowerCase();
assert.ok(!/\$\s?\d/.test(text), "no price in the words");
for (const w of BANNED_WORDS) assert.ok(!text.includes(w), `banned word: ${w}`);

// the safety copy keeps its limits
assert.ok(/never means a product is genuine, safe, unexpired or recall-free/.test(SAFETY_LIMITS));
assert.ok(!/(is|are) (genuine|authentic|recall-free)/.test(text.replace(SAFETY_LIMITS.toLowerCase(), "")));
assert.ok(SAFETY_CHECKS.length >= 4);

// wording matches the tab rules: wholesale hides purchase orders and suppliers, distribution hides quotations
const wp = WHOLESALE.depts[0].points.join(" ").toLowerCase();
const dp = DISTRIBUTION.depts[0].points.join(" ").toLowerCase();
assert.ok(wp.includes("quotation") && !wp.includes("purchase order"));
assert.ok(dp.includes("purchase order") && !dp.includes("quotations priced"));
assert.ok(DISTRIBUTION.depts.find((d) => d.dept === "Accounts")!.points.join(" ").includes("Audit Center"));
assert.ok(!WHOLESALE.depts.find((d) => d.dept === "Accounts")!.points.join(" ").includes("Audit Center"), "Audit Center is Distribution only");

// the sign-up choices: each points at its explainer page, has real detail, and follows the same word rules
assert.deepEqual(OPERATION_OPTIONS.map((o) => o.learnHref), ["/wholesale", "/distribution", "/both"]);
for (const o of OPERATION_OPTIONS) {
  assert.ok(o.description.length > 60 && o.details.length === 3 && o.learnLabel.length > 10, o.value);
  const t = [o.description, ...o.details].join(" ").toLowerCase();
  assert.ok(!/\$\s?\d/.test(t), "no price on the sign-up choices");
  for (const w of BANNED_WORDS) assert.ok(!t.includes(w), `${o.value}: ${w}`);
}
assert.ok(!OPERATION_OPTIONS[0].details.join(" ").includes("Audit Center"), "Audit Center is Distribution only");
assert.ok(OPERATION_OPTIONS[1].details.join(" ").includes("Audit Center"));

// pricing buttons open sign-up with the operation (and plan) already chosen
assert.equal(signupHref("wholesale", "monthly"), "/signup?operation=wholesale&plan=monthly");
assert.equal(signupHref("both"), "/signup?operation=both");
assert.deepEqual(readSignupChoice("wholesale", "yearly"), { operationType: "WHOLESALER", plan: "yearly" });
assert.deepEqual(readSignupChoice("Distribution", "MONTHLY"), { operationType: "DISTRIBUTOR", plan: "monthly" });
assert.deepEqual(readSignupChoice("both", undefined), { operationType: "BOTH", plan: null });
assert.deepEqual(readSignupChoice("BOTH", null), { operationType: "BOTH", plan: null });
assert.deepEqual(readSignupChoice("nonsense", "weekly"), { operationType: null, plan: null });
assert.deepEqual(readSignupChoice(["x"], 5), { operationType: null, plan: null });

// the affiliate program: one kind; the company saves 10%; the affiliate earns 40% of a month (monthly) or 15% of the year (yearly), one time, after 3 months billed; no price typed into the words
assert.equal(REFERRED_DISCOUNT_PERCENT, 10);
assert.equal(AFFILIATE_MONTHLY_PERCENT, 40);
assert.equal(AFFILIATE_YEARLY_PERCENT, 15);
assert.equal(AFFILIATE_MONTHS, 3);
const aff = [AFFILIATE_PROGRAM.title, AFFILIATE_PROGRAM.summary, ...AFFILIATE_PROGRAM.facts.flatMap((f) => [f.value, f.label]), ...AFFILIATE_PROGRAM.steps.flatMap((s) => [s.title, s.body]), ...AFFILIATE_PROGRAM.rules].join(" ");
assert.ok(/10%/.test(aff) && /40%/.test(aff) && /15%/.test(aff) && /one-time|one time/i.test(aff) && /3 months/.test(aff), "10%, 40%, 15%, one time, 3 months");
assert.ok(!/50%|no discount/i.test(aff), "the old 50% / no-discount wording is gone");
assert.ok(/do not stack/i.test(aff) && /own company/i.test(aff) && /reversed/i.test(aff), "no stacking, no self-referral, reversals");
assert.ok(/one kind of affiliate/i.test(aff) && /not (a )?(ongoing|continuing)/i.test(aff));
assert.ok(!/\$\s?\d/.test(aff), "no price in the affiliate words");
for (const w of BANNED_WORDS) assert.ok(!aff.toLowerCase().includes(w), `affiliate banned word: ${w}`);
assert.equal(AFFILIATE_PROGRAM.steps.length, 4);
assert.ok(/direct deposit/i.test(aff), "paid by direct deposit");
assert.ok(/portal/i.test(aff), "the portal is mentioned");
const exText = affiliateExample({ monthlyCents: 97700, yearlyCents: 1049900, monthlyCutCents: 39080, yearlyCutCents: 157485, monthlyOffCents: 9770, yearlyOffCents: 104990 }, (c) => `$${(c / 100).toFixed(2)}`);
assert.ok(/\$390\.80/.test(exText) && /\$1574\.85/.test(exText) && /\$97\.70/.test(exText) && /\$1049\.90/.test(exText), "the example is worked out from the numbers it is given");

console.log("landing-content: ok");
