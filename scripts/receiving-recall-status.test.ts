import assert from "node:assert/strict";
import { CLEARED_NOTE } from "../src/lib/receiving-recall";
import { rowCheckStatus } from "../src/lib/receiving-recall-status";

const listed = { id: "r1", numberCount: 11, prefixCount: 0 };
const unlisted = { id: "r2", numberCount: 0, prefixCount: 0 };
const k = (r: ReturnType<typeof rowCheckStatus>) => r.key;

assert.equal(k(rowCheckStatus([], [])), "none", "no recall for this product");
assert.equal(k(rowCheckStatus([listed], [])), "needs", "list loaded, nothing checked");
assert.equal(k(rowCheckStatus([listed], [{ result: "NOT_ON_LIST", recallId: null }])), "checked");
assert.equal(k(rowCheckStatus([listed], [{ result: "ON_LIST", recallId: "r1", enteredNumber: "ABCD1234" }])), "recalled");
assert.equal(k(rowCheckStatus([unlisted], [{ result: "NOT_ON_LIST" }])), "needs", "no list: 'not on list' proves nothing");
assert.equal(k(rowCheckStatus([unlisted], [{ result: "CONFIRMED_OK", recallId: "r2" }])), "checked");
assert.equal(k(rowCheckStatus([unlisted], [{ result: "CONFIRMED_AFFECTED", recallId: "r2", enteredNumber: "X1234" }])), "recalled");
assert.equal(k(rowCheckStatus([listed], [{ result: "NOT_ON_LIST", note: "NEAR: PH1U0103 (x)" }])), "look");
assert.equal(k(rowCheckStatus([listed], [{ result: "NOT_ON_LIST", note: "NEAR: PH1U0103 (x)" }, { result: "CONFIRMED_OK", recallId: "r1" }])), "checked", "manufacturer answer ends the review");
const hit = { result: "ON_LIST", recallId: "r1", enteredNumber: "ABCD1234" };
const clr = { result: "CONFIRMED_OK", recallId: "r1", enteredNumber: "ABCD1234", note: `${CLEARED_NOTE}: x` };
assert.equal(k(rowCheckStatus([listed], [hit, clr])), "cleared");
console.log("receiving-recall-status: ok");
