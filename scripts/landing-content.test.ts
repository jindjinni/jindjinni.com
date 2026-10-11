import assert from "node:assert/strict";
import { AUDIENCES, BANNED_WORDS, BOTH, BOTH_POINTS, DISTRIBUTION, OPERATIONS, SAFETY_CHECKS, SAFETY_LIMITS, WHOLESALE } from "../src/lib/landing-content";
import { DEPARTMENT_MENUS } from "../src/lib/sidebar-menu";
import { OPERATION_OPTIONS } from "../src/lib/operation-type";

const all = (): string[] => {
  const out: string[] = [];
  for (const c of Object.values(OPERATIONS)) {
    out.push(c.name, c.tagline, c.intro, c.forWhom, ...c.day, ...c.cardPoints);
    for (const d of c.depts) out.push(d.dept, d.line, ...d.points);
  }
  for (const b of BOTH_POINTS) out.push(b.title, b.body);
  for (const a of AUDIENCES) out.push(a.title, a.body);
  for (const k of SAFETY_CHECKS) out.push(k.title, k.body);
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

// no prices, no promises
const text = all().join(" \n ").toLowerCase();
assert.ok(!/\$\s?\d/.test(text), "no price in the words");
for (const w of BANNED_WORDS) assert.ok(!text.includes(w), `banned word: ${w}`);

// the safety copy keeps its limits
assert.ok(/never means a product is genuine, safe, unexpired or recall-free/.test(SAFETY_LIMITS));
assert.ok(!/(is|are) (genuine|authentic|recall-free)/.test(text.replace(SAFETY_LIMITS.toLowerCase(), "")));
assert.ok(SAFETY_CHECKS.length >= 6);

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

console.log("landing-content: ok");
