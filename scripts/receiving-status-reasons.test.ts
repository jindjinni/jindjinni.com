import assert from "node:assert/strict";
import { STATUS_CHOICES, STATUS_LABELS, discrepancyReasons, finalStatusFor } from "../src/lib/receiving-rules";

const clean = { externalDamage: "NO", overallPackaging: "ACCEPTABLE", quantityMatches: "YES", adjustmentNeeded: "NO" };
const ok = { productName: "Omnipod 5", quotedItemId: "q1", quotedQuantity: 5, wasReceived: "YES", quantityReceived: 5, itemSource: "QUOTED" };

// reasons agree with the status rule: no reasons <=> complete, any reason <=> discrepancy
assert.deepEqual(discrepancyReasons(clean, [ok]), []);
assert.equal(finalStatusFor(clean, [ok]), "RECEIVING_COMPLETE");

const r1 = discrepancyReasons({ ...clean, externalDamage: "YES" }, [ok]);
assert.deepEqual(r1, ["The outside of the package was damaged"]);
assert.equal(finalStatusFor({ ...clean, externalDamage: "YES" }, [ok]), "RECEIVING_COMPLETE_WITH_DISCREPANCY");

assert.ok(discrepancyReasons({ ...clean, overallPackaging: "NOT_ACCEPTABLE" }, [ok])[0].includes("Not acceptable"));
assert.ok(discrepancyReasons({ ...clean, quantityMatches: "NO" }, [ok])[0].includes("quantity match"));
assert.ok(discrepancyReasons({ ...clean, adjustmentNeeded: "YES" }, [ok])[0].includes("adjustment"));

// a short count names the product and both numbers
assert.deepEqual(discrepancyReasons(clean, [{ ...ok, quantityReceived: 3 }]), ["Omnipod 5: received 3, quoted 5"]);
// two lots of one quoted line that add up are fine
assert.deepEqual(discrepancyReasons(clean, [{ ...ok, quantityReceived: 3 }, { ...ok, quantityReceived: 2 }]), []);
// extra, not received, partial, code, expiry
assert.ok(discrepancyReasons(clean, [{ productName: "Extra Pod", itemSource: "EXTRA", wasReceived: "YES", quantityReceived: 2 }])[0].includes("extra product"));
assert.ok(discrepancyReasons(clean, [{ ...ok, wasReceived: "NO", quantityReceived: 0 }])[0].includes("not received"));
assert.ok(discrepancyReasons(clean, [{ productName: "Free", wasReceived: "PARTIALLY", quantityReceived: 1 }])[0].includes("partly"));
assert.ok(discrepancyReasons(clean, [{ ...ok, codeMatches: "NO" }])[0].includes("code"));
assert.ok(discrepancyReasons(clean, [{ ...ok, expirationQualifies: "NO" }])[0].includes("expiration"));
// quoted but never entered
assert.deepEqual(discrepancyReasons(clean, [ok], ["Dexcom G7"]), ["Dexcom G7: quoted, but nothing was entered as received"]);
// no duplicates
assert.equal(discrepancyReasons({ ...clean, externalDamage: "YES" }, [], []).length, 1);

// the three choices a person can set, with labels
assert.deepEqual([...STATUS_CHOICES], ["RECEIVING_COMPLETE", "RECEIVING_COMPLETE_WITH_DISCREPANCY", "NEEDS_REVIEW"]);
assert.equal(STATUS_LABELS.NEEDS_REVIEW, "Needs To Be Reviewed");
console.log("receiving-status-reasons: ok");
