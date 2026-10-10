import assert from "node:assert/strict";
import { distinctFromFirst, isSeparateBusiness, operationHeld, parseSameBusiness, secondBusinessStatusText } from "../src/lib/second-business-rules";

const first = { ein: "16-3456789", registeredState: "TX", stateFileNumber: "802233999" };

assert.equal(parseSameBusiness("same"), "same");
assert.equal(parseSameBusiness(" different "), "different");
assert.equal(parseSameBusiness(""), null);
assert.equal(parseSameBusiness("maybe"), null);
assert.equal(parseSameBusiness(null), null);

// two different businesses
assert.equal(distinctFromFirst(first, { ein: "27-1234560", registeredState: "TX", stateFileNumber: "900100200" }), null);
assert.equal(distinctFromFirst(first, { ein: "27-1234560", registeredState: "FL", stateFileNumber: "802233999" }), null); // same number, different state
// same EIN (with or without the dash)
assert.match(distinctFromFirst(first, { ein: "163456789", registeredState: "FL", stateFileNumber: "x1y2z3" }) ?? "", /same EIN/);
// same state and same file number (case and spaces ignored)
assert.match(distinctFromFirst(first, { ein: "27-1234560", registeredState: "TX", stateFileNumber: " 802-233 999 " }) ?? "", /same state file number/);

// a row with its own approval is a separate business
assert.equal(isSeparateBusiness(null), false);
assert.equal(isSeparateBusiness("pending"), true);
assert.equal(isSeparateBusiness("approved"), true);

// only a child operation with its own held status is locked
assert.equal(operationHeld(null, "pending"), false);
assert.equal(operationHeld("main1", null), false);
assert.equal(operationHeld("main1", "approved"), false);
for (const s of ["pending", "rejected", "suspended", "banned"]) assert.equal(operationHeld("main1", s), true);

assert.equal(secondBusinessStatusText("pending").label, "Waiting for review");
assert.equal(secondBusinessStatusText(null).label, "Same business");
assert.equal(secondBusinessStatusText("approved").label, "Approved");

console.log("second-business-rules: all passed");
