import assert from "node:assert/strict";
import { daysUsed, memoryKey, resumed, returnPlan, returningNote, stopped, trialDatesFor, undoStop, welcomeBackNote, type Memory } from "../src/lib/trial-memory-rules";

// the same business always gives the same key, whatever the formatting; a different business gives a different key
const k1 = memoryKey("16-3456789", "tx", "802-233 999");
assert.equal(k1, memoryKey("163456789", "TX", "802233999"));
assert.notEqual(k1, memoryKey("16-3456780", "TX", "802233999"));
assert.notEqual(k1, memoryKey("16-3456789", "FL", "802233999"));
assert.notEqual(k1, memoryKey("16-3456789", "TX", "802233998"));
assert.match(k1, /^[0-9a-f]{64}$/);
assert.ok(!k1.includes("3456789"));

// approved on the 1st (day 1), cancels on the 4th: 4 days used, 3 left
let m: Memory = { daysBeforeRun: 0, runStartedOn: "2026-10-01", stoppedOn: null };
assert.equal(daysUsed(m, "2026-10-01"), 1);
assert.equal(daysUsed(m, "2026-10-04"), 4);
assert.equal(daysUsed(m, "2026-10-07"), 7);
assert.equal(daysUsed(m, "2026-12-30"), 7, "never more than the trial");
m = stopped(m, "2026-10-04");
assert.equal(daysUsed(m, "2027-03-01"), 4, "time after stopping does not count");
assert.equal(stopped(m, "2026-10-06").stoppedOn, "2026-10-04", "stopping twice changes nothing");
assert.deepEqual(returnPlan(m, "2027-03-01"), { kind: "resume", daysUsed: 4, daysLeft: 3 });

// coming back: only the 3 days that are left, billing starts the day after them
const dates = trialDatesFor(returnPlan(m, "2027-03-01"), "2027-03-01");
assert.deepEqual(dates, { startsOn: "2027-03-01", firstBillableOn: "2027-03-04" });
// ... and stopping again later keeps counting from there
let m2 = resumed(m, "2027-03-01");
assert.equal(m2.daysBeforeRun, 4);
assert.equal(daysUsed(m2, "2027-03-02"), 6);
m2 = stopped(m2, "2027-03-03");
assert.equal(daysUsed(m2, "2027-06-01"), 7);
assert.equal(returnPlan(m2, "2027-06-01").kind, "used_up");

// the whole trial used: no trial, the first charge date is today
assert.deepEqual(trialDatesFor({ kind: "used_up", daysUsed: 7 }, "2027-06-01"), { startsOn: "2027-06-01", firstBillableOn: "2027-06-01" });
// never seen: a full 7-day trial from today
assert.deepEqual(trialDatesFor({ kind: "fresh" }, "2026-10-10"), { startsOn: "2026-10-10", firstBillableOn: "2026-10-17" });
assert.equal(returnPlan(null, "2026-10-10").kind, "fresh");
// approved and cancelled on the same day: 1 day used, 6 left
assert.deepEqual(returnPlan(stopped({ daysBeforeRun: 0, runStartedOn: "2026-10-01", stoppedOn: null }, "2026-10-01"), "2026-11-01"), { kind: "resume", daysUsed: 1, daysLeft: 6 });

// undoing a cancellation puts the company back to running
const undone = undoStop(stopped({ daysBeforeRun: 0, runStartedOn: "2026-10-01", stoppedOn: null }, "2026-10-02"));
assert.equal(undone.stoppedOn, null);
assert.equal(daysUsed(undone, "2026-10-05"), 5);

// a ledger entry with no run (a company from before trials) is read as it is stored
assert.equal(daysUsed({ daysBeforeRun: 7, runStartedOn: null, stoppedOn: null }, "2026-10-01"), 7);
assert.equal(returnPlan({ daysBeforeRun: 7, runStartedOn: null, stoppedOn: null }, "2026-10-01").kind, "used_up");

// plain words
assert.match(returningNote({ kind: "resume", daysUsed: 4, daysLeft: 3 }) ?? "", /4 of its 7.*only the 3/);
assert.match(returningNote({ kind: "used_up", daysUsed: 7 }) ?? "", /no new trial/);
assert.equal(returningNote({ kind: "fresh" }), null);
assert.match(welcomeBackNote(4) ?? "", /3 days/);
assert.equal(welcomeBackNote(0), null);
assert.equal(welcomeBackNote(7), null);

console.log("trial-memory-rules: all passed");
