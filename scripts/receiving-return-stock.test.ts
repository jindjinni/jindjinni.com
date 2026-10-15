import assert from "node:assert/strict";
import { acceptedQuantity, returnMarkedInStep7 } from "../src/lib/receiving-rules";

// Step 7 "Return Required? Yes" counts as a return unless Step 6 already says Yes
assert.equal(returnMarkedInStep7("NO", "YES"), true);
assert.equal(returnMarkedInStep7(null, "YES"), true);
assert.equal(returnMarkedInStep7("PENDING_REVIEW", "YES"), true);
assert.equal(returnMarkedInStep7("YES", "YES"), false, "already a return, Step 6 decides how many");
assert.equal(returnMarkedInStep7("NO", "NO"), false);
assert.equal(returnMarkedInStep7("NO", null), false);
assert.equal(returnMarkedInStep7("NO", ""), false);
// and the Step 6 rule it feeds: every unit goes back unless a smaller number is given
assert.equal(acceptedQuantity(5, "YES", null), 0);
assert.equal(acceptedQuantity(5, "YES", 2), 3);
assert.equal(acceptedQuantity(5, "NO", null), 5);
console.log("receiving-return-stock: ok");
