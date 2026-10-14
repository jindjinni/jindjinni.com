import assert from "node:assert/strict";
import { activeRecallHits, CLEARED_NOTE, isClearingCheck, isHitCleared, releasedReturn, rowRecallState } from "../src/lib/receiving-recall";

const hit = { result: "ON_LIST", enteredNumber: "PH-1234", recallId: "r1", note: null };
const clear = { result: "CONFIRMED_OK", enteredNumber: "ph1234", recallId: "r1", note: `${CLEARED_NOTE}: the manufacturer's page says this number is not affected.` };
const plainOk = { result: "CONFIRMED_OK", enteredNumber: "PH-1234", recallId: "r1", note: null };

// a plain list hit holds the row
assert.equal(rowRecallState([hit]), "RECALLED");
assert.equal(activeRecallHits([hit]).length, 1);

// a receiver's "Not affected" (no note) does NOT cancel a list hit
assert.equal(isClearingCheck(plainOk), false);
assert.equal(isHitCleared(hit, [hit, plainOk]), false);
assert.equal(rowRecallState([hit, plainOk]), "RECALLED");

// an Owner/Admin clearing check cancels it, even if the number is typed differently
assert.equal(isClearingCheck(clear), true);
assert.equal(isHitCleared(hit, [hit, clear]), true);
assert.equal(rowRecallState([hit, clear]), "CHECKED");
assert.equal(activeRecallHits([hit, clear]).length, 0);

// only the same recall is cancelled
assert.equal(rowRecallState([hit, { ...clear, recallId: "r2" }]), "RECALLED");
// only the same number is cancelled
assert.equal(rowRecallState([hit, { ...clear, enteredNumber: "ZZ9999" }]), "RECALLED");
// another list hit on the same row still holds it
assert.equal(rowRecallState([hit, clear, { ...hit, enteredNumber: "PH-9999" }]), "RECALLED");
// a manufacturer "Affected" answer is never cancelled by a clearing check
const aff = { result: "CONFIRMED_AFFECTED", enteredNumber: "PH-1234", recallId: "r1", note: null };
assert.equal(rowRecallState([aff, clear]), "RECALLED");
assert.equal(isHitCleared(aff, [aff, clear]), false);
// nothing checked at all
assert.equal(rowRecallState([]), "NONE");
assert.equal(rowRecallState([{ result: "NOT_ON_LIST" }]), "CHECKED");

// the return mark is taken off only when the recall alone made it
const recallMark = { needsReturn: "YES", returnStatus: "RETURN_REQUESTED", returnNotes: "RECALL: Omnipod - PH-1234" };
assert.deepEqual(releasedReturn(recallMark), { needsReturn: "NO", returnStatus: "NOT_APPLICABLE", quantityToReturn: null, returnNotes: null });
assert.deepEqual(releasedReturn({ ...recallMark, returnNotes: "RECALL: A - 1\nRECALL: B - 2" })?.needsReturn, "NO");
assert.equal(releasedReturn({ ...recallMark, returnNotes: "RECALL: A - 1\nDamaged box" }), null, "another reason stays");
assert.equal(releasedReturn({ ...recallMark, returnNotes: null }), null, "no recall line: not ours");
assert.equal(releasedReturn({ ...recallMark, returnStatus: "RETURN_SHIPPED" }), null, "already shipped back");
assert.equal(releasedReturn({ ...recallMark, returnStatus: "RETURNED" }), null);
assert.equal(releasedReturn({ ...recallMark, needsReturn: "NO" }), null);
assert.equal(releasedReturn({ ...recallMark, returnNotes: "CHECK: close to recalled number" }), null, "a close-match review stays");

console.log("receiving-recall-clear: ok");
