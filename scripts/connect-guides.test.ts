import assert from "node:assert/strict";
import { GUIDES, GUIDE_KEYS, guideFor, guideProblems, helpHref, supportPrefill } from "../src/lib/connect-guides";
import { CATEGORIES, SUBJECT_MAX, SUBJECT_MIN } from "../src/lib/support-rules";

for (const k of GUIDE_KEYS) {
  const g = GUIDES[k];
  assert.equal(g.key, k);
  assert.deepEqual(guideProblems(g), [], k);
  assert.ok(g.share("Plantarz").includes("Plantarz"), k);
  assert.ok(g.help.subject.length >= SUBJECT_MIN && g.help.subject.length <= SUBJECT_MAX, k);
}
assert.deepEqual(GUIDE_KEYS.sort(), ["ai-anthropic", "ai-openai", "cron-ping", "email", "shippo"]);

// provider words are filled in correctly
assert.ok(GUIDES["ai-anthropic"].steps[0].includes("console.anthropic.com"));
assert.ok(GUIDES["ai-openai"].steps[0].includes("platform.openai.com"));
assert.ok(GUIDES["ai-openai"].title.includes("ChatGPT"));
assert.ok(!GUIDES["ai-openai"].steps.join(" ").includes("Anthropic"));

// lookups
assert.equal(guideFor("shippo")?.key, "shippo");
assert.equal(guideFor("nope"), null);
assert.equal(guideFor(null), null);
assert.equal(guideFor("constructor"), null);
assert.equal(helpHref("email"), "/dashboard/support?about=email");

// support prefill only for real guides, with a real category
const p = supportPrefill("shippo");
assert.ok(p && p.subject.includes("Shippo") && (CATEGORIES as readonly string[]).includes(p.category));
assert.equal(supportPrefill("<script>"), null);
assert.equal(supportPrefill(undefined), null);

// the checker catches a half-written guide
const bad = { ...GUIDES.shippo, steps: ["one"], cost: "$5 per label" };
const probs = guideProblems(bad);
assert.ok(probs.includes("needs at least 3 steps") && probs.includes("states a price (providers change them)"));

console.log("connect-guides: ok");
