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

// ---- Home screen arrangement ----
import { SECTION_IDS, defaultLayout, moveSection, normalizeLayout, parseLayout, serializeLayout, setAllOpen, toggleOpen, visibleOrder } from "../src/lib/dashboard-layout";
assert.deepEqual(defaultLayout(), { order: ["news", "purchasing", "receiving", "accounts"], open: [] }); // the news is first and everything starts closed
assert.deepEqual(parseLayout(null), defaultLayout());
assert.deepEqual(parseLayout("not json"), defaultLayout());
assert.deepEqual(parseLayout('"text"'), defaultLayout());
// Unknown names and repeats are dropped, missing sections come back at the end.
assert.deepEqual(normalizeLayout({ order: ["accounts", "bogus", "accounts", "news"], open: ["news", "x", "news"] }), { order: ["accounts", "news", "purchasing", "receiving"], open: ["news"] });
assert.deepEqual(normalizeLayout({ order: "nope", open: 5 }), defaultLayout());
assert.deepEqual(parseLayout(serializeLayout({ order: ["receiving", "news", "purchasing", "accounts"], open: ["accounts"] })), { order: ["receiving", "news", "purchasing", "accounts"], open: ["accounts"] });
// Moving.
const all = [...SECTION_IDS];
let l = defaultLayout();
l = moveSection(l, "accounts", -1, all);
assert.deepEqual(l.order, ["news", "purchasing", "accounts", "receiving"]);
l = moveSection(l, "news", 1, all);
assert.deepEqual(l.order, ["purchasing", "news", "accounts", "receiving"]);
assert.deepEqual(moveSection(l, "purchasing", -1, all), l); // already first: nothing changes
assert.deepEqual(moveSection(l, "receiving", 1, all), l); // already last
// A person who cannot see the analytics only has the news: moving among what is shown never disturbs the hidden ones.
assert.deepEqual(visibleOrder(l, ["news"]), ["news"]);
assert.deepEqual(moveSection(l, "news", 1, ["news"]), l);
const two = moveSection(defaultLayout(), "news", 1, ["news", "accounts"]);
assert.deepEqual(two.order, ["accounts", "purchasing", "receiving", "news"]);
// Opening and closing.
let o = toggleOpen(defaultLayout(), "purchasing");
assert.deepEqual(o.open, ["purchasing"]);
o = toggleOpen(o, "purchasing");
assert.deepEqual(o.open, []);
assert.deepEqual(setAllOpen(defaultLayout(), ["news", "accounts"], true).open, ["news", "accounts"]);
assert.deepEqual(setAllOpen(setAllOpen(defaultLayout(), all, true), all, false).open, []);

// The small summaries on a closed section.
import { accountsMini, attentionNotes, purchasingMini, receivingMini } from "../src/lib/analytics-mini";
import type { Pulse } from "../src/lib/home-stats";
const fx = { given: 6, confirmed: 4, fullProcess: 4, delivered: 3, received: 2, successful: 1, unsuccessful: 2, inProgress: 3 };
const zeroP = { purchasing: { quotesGiven: 0, quotedValue: 0, confirmed: 0, delivered: 0, funnel: { given: 0, confirmed: 0, fullProcess: 0, delivered: 0, received: 0, successful: 0, unsuccessful: 0, inProgress: 0 } }, receiving: { received: 0, receivedValue: 0, withDiscrepancy: 0, adjustments: 0 }, accounts: { paid: 0, paidValue: 0 } };
const pulse = {
  today: "2026-10-09",
  timeZone: "America/New_York",
  periods: { today: { ...zeroP, purchasing: { ...zeroP.purchasing, delivered: 3, funnel: fx }, receiving: { ...zeroP.receiving, received: 2 }, accounts: { paid: 1, paidValue: 10 } }, week: zeroP, month: zeroP },
  daily: { days: [], quotes: [], delivered: [], received: [], paid: [] },
  now: {
    purchasing: { waitingForCustomer: 0, onTheWay: 0, shippingTrouble: 1 },
    receiving: { inProgress: 6, waitingForDecision: 0, onTheWay: 2, waitingToOpen: 1 },
    accounts: { toPay: 2, toPayValue: 600, overdue: 1, overdueValue: 500, dueToday: 0, buckets: bucketOrders([{ dueDay: "2026-10-08", amount: 500 }, { dueDay: "2026-10-20", amount: 100 }], "2026-10-09"), decisions: { none: 0, review: 0, adjusted: 0, returned: 0 } },
  },
} as unknown as Pulse;
const pm = purchasingMini(pulse, "today");
assert.deepEqual(pm.chips.map((c) => c.text), ["6 quotations today", "67% full process", "1 successful", "2 unsuccessful"]);
assert.deepEqual(pm.bar.map((s) => s.n), [1, 2, 3]);
const rm = receivingMini(pulse, "today");
assert.deepEqual(rm.chips.map((c) => c.text), ["3 delivered today", "2 received today", "7 packages in the queue"]);
assert.deepEqual(rm.bar.map((s) => s.n), [2, 1, 6]);
const am = accountsMini(pulse, "today");
assert.equal(am.chips[0].tone, "red");
assert.deepEqual(am.bar.map((s) => s.n), [1, 0, 1, 0]);
assert.deepEqual(attentionNotes(pulse), ["1 order overdue", "1 package with a shipping problem"]);
assert.equal(receivingMini(pulse, "week").chips[2].text, "7 packages in the queue"); // the queue is "right now", whatever the period
assert.equal(purchasingMini(pulse, "week").chips.length, 3); // nothing given this week: no percentage chip

console.log("dashboard layout and mini summaries: all passed");
