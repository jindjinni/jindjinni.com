import assert from "node:assert/strict";
import { CUSTOM_CONDITION, lineChoiceError } from "../src/lib/quote-line-rules";

const base = { hasProduct: true, neverExpires: false, conditionId: "c1", expirationRangeId: "r1", conditionOffered: true, rangeOffered: true };
assert.equal(lineChoiceError(base), null);
assert.equal(lineChoiceError({ ...base, hasProduct: false, conditionId: null, expirationRangeId: null }), null, "free-text lines aren't checked");
assert.match(lineChoiceError({ ...base, conditionId: null })!, /Choose a condition/);
assert.match(lineChoiceError({ ...base, expirationRangeId: null })!, /Choose an expiry/);
assert.match(lineChoiceError({ ...base, conditionOffered: false })!, /condition isn't offered/);
assert.match(lineChoiceError({ ...base, rangeOffered: false })!, /expiry isn't offered/);
assert.equal(lineChoiceError({ ...base, conditionId: CUSTOM_CONDITION, conditionOffered: false }), null, "a custom condition is allowed");
assert.equal(lineChoiceError({ ...base, neverExpires: true, expirationRangeId: null, rangeOffered: false }), null, "a product that never expires needs no expiry");
// correcting an existing line keeps what it had
assert.equal(lineChoiceError({ ...base, conditionOffered: false, conditionUnchanged: true }), null);
assert.equal(lineChoiceError({ ...base, expirationRangeId: null, rangeUnchanged: true }), null);
assert.equal(lineChoiceError({ ...base, conditionId: null, conditionUnchanged: true }), null);
assert.match(lineChoiceError({ ...base, conditionOffered: false, conditionUnchanged: false })!, /isn't offered/);
console.log("quote-line-rules ok");
