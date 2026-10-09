import assert from "node:assert/strict";
import { SIDE_INFO, needsConfirmation, sidesFrom, sidesFromType, sidesLabel, turnOffBlocker, typeFromSides, validateSides } from "../src/lib/operations-rules";

// ---- nothing answered: both sides on (nothing hidden)
assert.deepEqual(sidesFrom(null), { wholesale: true, distribution: true });
assert.deepEqual(sidesFrom({}), { wholesale: true, distribution: true });
assert.deepEqual(sidesFrom({ operationType: "junk" }), { wholesale: true, distribution: true });
// ---- the old answer, mapped, until the company confirms its sides
assert.deepEqual(sidesFrom({ operationType: "WHOLESALER" }), { wholesale: true, distribution: false });
assert.deepEqual(sidesFrom({ operationType: "distributor" }), { wholesale: false, distribution: true });
assert.deepEqual(sidesFrom({ operationType: "BOTH" }), { wholesale: true, distribution: true });
// ---- once confirmed, only the saved days matter (the old answer is ignored)
assert.deepEqual(sidesFrom({ operationType: "WHOLESALER", operationsChosenAt: "2026-10-09T00:00:00Z", distributionActiveAt: "2026-10-09T00:00:00Z" }), { wholesale: false, distribution: true });
assert.deepEqual(sidesFrom({ operationsChosenAt: "x", wholesaleActiveAt: "x", distributionActiveAt: "x" }), { wholesale: true, distribution: true });
assert.deepEqual(sidesFrom({ operationsChosenAt: "x" }), { wholesale: true, distribution: true }, "a damaged record never leaves a company with nothing");
// ---- confirmation
assert.ok(needsConfirmation(null) && needsConfirmation({ operationType: "BOTH" }) && !needsConfirmation({ operationsChosenAt: "x" }));
// ---- type <-> sides
assert.equal(typeFromSides({ wholesale: true, distribution: true }), "BOTH");
assert.equal(typeFromSides({ wholesale: true, distribution: false }), "WHOLESALER");
assert.equal(typeFromSides({ wholesale: false, distribution: true }), "DISTRIBUTOR");
for (const t of ["WHOLESALER", "DISTRIBUTOR", "BOTH"] as const) assert.equal(typeFromSides(sidesFromType(t)), t);
assert.deepEqual(sidesFromType(null), { wholesale: true, distribution: true });
// ---- at least one side stays on
assert.equal(validateSides({ wholesale: false, distribution: false }).ok, false);
assert.ok(validateSides({ wholesale: true, distribution: false }).ok && validateSides({ wholesale: false, distribution: true }).ok);
// ---- switching off is blocked only by that side's own open work
assert.equal(turnOffBlocker("wholesale", { openQuotations: 0, openPurchaseOrders: 5 }), null);
assert.equal(turnOffBlocker("distribution", { openQuotations: 5, openPurchaseOrders: 0 }), null);
assert.match(turnOffBlocker("wholesale", { openQuotations: 1, openPurchaseOrders: 0 })!, /1 open quotation for individuals/);
assert.match(turnOffBlocker("wholesale", { openQuotations: 3, openPurchaseOrders: 0 })!, /3 open quotations/);
assert.match(turnOffBlocker("distribution", { openQuotations: 0, openPurchaseOrders: 2 })!, /2 purchase orders waiting on a supplier/);
// ---- labels and the guide text
assert.equal(sidesLabel({ wholesale: true, distribution: true }), "Wholesale and Distribution");
assert.equal(sidesLabel({ wholesale: true, distribution: false }), "Wholesale");
for (const s of ["wholesale", "distribution"] as const) {
  assert.ok(SIDE_INFO[s].turnsOn.length >= 3 && SIDE_INFO[s].firstSteps.length >= 3);
  for (const step of SIDE_INFO[s].firstSteps) assert.ok(step.href.startsWith("/dashboard/"), "links stay inside the app");
}
console.log("operations-rules: all passed");
