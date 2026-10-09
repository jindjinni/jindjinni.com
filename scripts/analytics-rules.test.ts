import assert from "node:assert/strict";
import { DUE_BUCKETS, bucketOf, bucketOrders, buildFunnel, countByDay, dropped, lastDays, outcomeOf, pct, stepsReached, type QuoteFacts } from "../src/lib/analytics-rules";

const q = (o: Partial<QuoteFacts> = {}): QuoteFacts => ({ day: "2026-10-09", status: "QUOTED", labelProvided: false, hasTracking: false, delivered: false, packageStatus: "Pre-Transit", receivedByUs: false, decision: null, ...o });

// A fresh quotation has only been given and is still open.
assert.deepEqual(stepsReached(q()), { given: true, confirmed: false, fullProcess: false, delivered: false, received: false });
assert.equal(outcomeOf(q()), "open");

// Full process means a free label AND a tracking number; either alone is not enough.
assert.equal(stepsReached(q({ status: "CONFIRMED", labelProvided: true })).fullProcess, false);
assert.equal(stepsReached(q({ status: "CONFIRMED", hasTracking: true })).fullProcess, false);
assert.equal(stepsReached(q({ status: "CONFIRMED", labelProvided: true, hasTracking: true })).fullProcess, true);

// A later step implies the earlier ones (an imported order that was received without a label still counts as passed).
assert.deepEqual(stepsReached(q({ status: "RECEIVED", receivedByUs: true })), { given: true, confirmed: true, fullProcess: true, delivered: true, received: true });

// Outcomes.
assert.equal(outcomeOf(q({ status: "CANCELLED" })), "unsuccessful");
assert.equal(outcomeOf(q({ status: "CONFIRMED", packageStatus: "Returned" })), "unsuccessful");
assert.equal(outcomeOf(q({ status: "RECEIVED", receivedByUs: true, decision: "NEED_TO_BE_RETURNED" })), "unsuccessful");
assert.equal(outcomeOf(q({ status: "RECEIVED", receivedByUs: true, decision: "NEED_TO_BE_PAID" })), "successful");
assert.equal(outcomeOf(q({ status: "CONFIRMED", labelProvided: true, hasTracking: true, packageStatus: "In Transit" })), "open");

// The funnel never grows from one step to the next, and the three outcomes add up to everything given.
const rows: QuoteFacts[] = [
  q(),
  q({ status: "CANCELLED" }),
  q({ status: "CONFIRMED", labelProvided: true, hasTracking: true, packageStatus: "In Transit" }),
  q({ status: "CONFIRMED", labelProvided: true, hasTracking: true, packageStatus: "Delivered", delivered: true }),
  q({ status: "RECEIVED", labelProvided: true, hasTracking: true, packageStatus: "Delivered", delivered: true, receivedByUs: true, decision: "PAID" }),
  q({ status: "RECEIVED", receivedByUs: true, delivered: true, decision: "NEED_TO_BE_RETURNED" }),
];
const f = buildFunnel(rows);
assert.deepEqual([f.given, f.confirmed, f.fullProcess, f.delivered, f.received], [6, 4, 4, 3, 2]);
assert.equal(f.successful, 1);
assert.equal(f.unsuccessful, 2);
assert.equal(f.inProgress, 3);
assert.equal(f.successful + f.unsuccessful + f.inProgress, f.given);
assert.deepEqual(buildFunnel([]), { given: 0, confirmed: 0, fullProcess: 0, delivered: 0, received: 0, successful: 0, unsuccessful: 0, inProgress: 0 });

assert.equal(pct(1, 3), 33);
assert.equal(pct(5, 0), 0);
assert.equal(dropped(6, 4), 2);
assert.equal(dropped(4, 6), 0);

// Payments due, as of Friday October 9, 2026.
const today = "2026-10-09";
assert.equal(bucketOf("2026-09-30", today), "overdueLong");
assert.equal(bucketOf("2026-10-02", today), "overdue"); // exactly 7 days late
assert.equal(bucketOf("2026-10-08", today), "overdue");
assert.equal(bucketOf("2026-10-09", today), "today");
assert.equal(bucketOf("2026-10-10", today), "tomorrow");
assert.equal(bucketOf("2026-10-14", today), "later");
assert.equal(bucketOf(null, today), "noDay");
const b = bucketOrders([{ dueDay: "2026-10-09", amount: 10.1 }, { dueDay: "2026-10-09", amount: 20.2 }, { dueDay: "2026-10-01", amount: 5 }, { dueDay: undefined, amount: 1 }], today);
assert.deepEqual(b.today, { count: 2, amount: 30.3 });
assert.deepEqual(b.overdueLong, { count: 1, amount: 5 });
assert.equal(b.noDay.count, 1);
assert.equal(DUE_BUCKETS.reduce((n, x) => n + b[x.key].count, 0), 4);

// Day series.
assert.deepEqual(lastDays("2026-10-09", 3), ["2026-10-07", "2026-10-08", "2026-10-09"]);
assert.equal(lastDays("2026-03-02", 7)[0], "2026-02-24");
assert.deepEqual(countByDay(lastDays("2026-10-09", 3), ["2026-10-09", "2026-10-09", "2026-10-07", "2026-09-01", ""]), [1, 0, 2]);

console.log("analytics-rules: all passed");
