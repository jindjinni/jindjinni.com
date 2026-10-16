import assert from "node:assert/strict";
import { autoNeedToBePaid, paidBlocker, type PaidFacts } from "../src/lib/paid-gate-rules";

const ok: PaidFacts = { submitted: true, decision: "NEED_TO_BE_PAID", hasReceipt: true, recalledLines: 0, draftAdjustment: false, pendingReturnLines: 0 };

assert.equal(paidBlocker(ok), null);
assert.match(paidBlocker({ ...ok, submitted: false }) ?? "", /submitted/);
assert.match(paidBlocker({ ...ok, hasReceipt: false }) ?? "", /receipt/);
assert.match(paidBlocker({ ...ok, decision: null }) ?? "", /Need to Be Paid/);
assert.match(paidBlocker({ ...ok, decision: "NEED_TO_BE_REVIEWED" }) ?? "", /Need to Be Paid/);
assert.match(paidBlocker({ ...ok, recalledLines: 1 }) ?? "", /recall/);
assert.match(paidBlocker({ ...ok, recalledLines: 3 }) ?? "", /3 received products/);
assert.match(paidBlocker({ ...ok, draftAdjustment: true }) ?? "", /draft/);
assert.match(paidBlocker({ ...ok, pendingReturnLines: 2 }) ?? "", /return decision/);
// an adjustment marked but never entered: can't be paid at the old amount
assert.match(paidBlocker({ ...ok, adjustmentUnentered: true }) ?? "", /adjusted payout/);
assert.equal(paidBlocker({ ...ok, adjustmentUnentered: false }), null);
assert.equal(paidBlocker({ ...ok, adjustmentUnentered: true, decision: "PAID" }), null, "already Paid is never blocked again");
// a recall hold wins over everything else, so it is the first thing the person sees
assert.match(paidBlocker({ ...ok, recalledLines: 1, hasReceipt: false, decision: null }) ?? "", /recall/);
// already Paid is never blocked again
assert.equal(paidBlocker({ ...ok, decision: "PAID", hasReceipt: false }), null);

const clean = { status: "RECEIVING_COMPLETE", decision: null, recalledLines: 0, needsReturnLines: 0, pendingReturnLines: 0, draftAdjustment: false };
assert.equal(autoNeedToBePaid(clean), true);
assert.equal(autoNeedToBePaid({ ...clean, decision: "UNCATEGORIZED" }), true);
assert.equal(autoNeedToBePaid({ ...clean, status: "RECEIVING_COMPLETE_WITH_DISCREPANCY" }), false);
assert.equal(autoNeedToBePaid({ ...clean, status: "IN_PROGRESS" }), false);
assert.equal(autoNeedToBePaid({ ...clean, decision: "NEED_TO_BE_REVIEWED" }), false);
assert.equal(autoNeedToBePaid({ ...clean, decision: "NEED_TO_BE_PAID" }), false);
assert.equal(autoNeedToBePaid({ ...clean, decision: "PAID" }), false);
assert.equal(autoNeedToBePaid({ ...clean, recalledLines: 1 }), false);
assert.equal(autoNeedToBePaid({ ...clean, needsReturnLines: 1 }), false);
assert.equal(autoNeedToBePaid({ ...clean, pendingReturnLines: 1 }), false);
assert.equal(autoNeedToBePaid({ ...clean, draftAdjustment: true }), false);
console.log("paid-gate-rules ok");
