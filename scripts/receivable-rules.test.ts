import assert from "node:assert/strict";
import { AGE_BUCKETS, ageBucket, daysLate, dayWords, dueText, inNoticeWindow, noticeReadiness, owedSummary, paymentNoticeEmail, paymentProblem } from "../src/lib/receivable-rules";

const today = "2026-10-10";
// how late
assert.equal(daysLate("2026-10-10", today), 0);
assert.equal(daysLate("2026-10-11", today), 0);
assert.equal(daysLate("2026-10-09", today), 1);
assert.equal(daysLate(null, today), 0);
assert.equal(daysLate("nonsense", today), 0);
assert.equal(ageBucket("2026-10-10", today), "CURRENT");
assert.equal(ageBucket("2026-11-10", today), "CURRENT");
assert.equal(ageBucket("2026-10-09", today), "D1_30");
assert.equal(ageBucket("2026-09-10", today), "D1_30"); // exactly 30 days late
assert.equal(ageBucket("2026-09-09", today), "D31_60"); // 31
assert.equal(ageBucket("2026-08-11", today), "D31_60"); // 60
assert.equal(ageBucket("2026-08-10", today), "D60_PLUS"); // 61
assert.equal(ageBucket(null, today), "CURRENT");
assert.deepEqual(AGE_BUCKETS, ["D60_PLUS", "D31_60", "D1_30", "CURRENT"]);
assert.equal(dueText("2026-10-13", today), "Due in 3 days");
assert.equal(dueText("2026-10-11", today), "Due tomorrow");
assert.equal(dueText("2026-10-10", today), "Due today");
assert.equal(dueText("2026-10-09", today), "1 day late");
assert.equal(dueText("2026-10-01", today), "9 days late");
assert.equal(dueText(null, today), "No due date");

// totals
const rows = [
  { id: "a", dueDate: "2026-10-01", total: 100, amountPaid: 40 }, // 60 owed, 9 late
  { id: "b", dueDate: "2026-08-01", total: 200, amountPaid: 0 }, // 70 late
  { id: "c", dueDate: "2026-10-15", total: 50.55, amountPaid: 0 }, // due in 5 days
  { id: "d", dueDate: "2026-12-01", total: 10, amountPaid: 0 }, // far off
  { id: "e", dueDate: "2026-09-01", total: 30, amountPaid: 30 }, // paid in full: ignored
];
const sum = owedSummary(rows, today);
assert.equal(sum.owed, 320.55);
assert.equal(sum.pastDue, 260);
assert.equal(sum.dueSoon, 50.55);
assert.equal(sum.count, 4);
assert.deepEqual(sum.byBucket.D60_PLUS, { count: 1, owed: 200 });
assert.deepEqual(sum.byBucket.D1_30, { count: 1, owed: 60 });
assert.deepEqual(sum.byBucket.D31_60, { count: 0, owed: 0 });
assert.deepEqual(sum.byBucket.CURRENT, { count: 2, owed: 60.55 });
assert.deepEqual(owedSummary([], today).owed, 0);

// payments
const inv = { total: 100, amountPaid: 40 };
assert.equal(paymentProblem(inv, { amount: 60, paidOn: today }), null);
assert.equal(paymentProblem(inv, { amount: 10.5, paidOn: today }), null);
assert.match(paymentProblem(inv, { amount: 60.01, paidOn: today })!, /more than the \$60\.00 still owed/);
assert.match(paymentProblem(inv, { amount: 0, paidOn: today })!, /Enter the amount/);
assert.match(paymentProblem(inv, { amount: -5, paidOn: today })!, /Enter the amount/);
assert.match(paymentProblem(inv, { amount: NaN, paidOn: today })!, /Enter the amount/);
assert.match(paymentProblem(inv, { amount: 5, paidOn: "10/10/2026" })!, /Enter the day/);
assert.match(paymentProblem({ total: 100, amountPaid: 100 }, { amount: 5, paidOn: today })!, /already paid in full/);

// the email
assert.equal(dayWords("2026-10-09"), "Oct 9, 2026");
assert.equal(dayWords("garbage"), "garbage");
const mail = paymentNoticeEmail({ company: "Alpha Rx", contact: "Dana", invoiceNumber: "1042", amount: 1234.5, paidOn: "2026-10-09", balance: 0, note: null, from: "Plantarz" });
assert.equal(mail.subject, "Payment received - invoice 1042 - Plantarz");
assert.match(mail.text, /^Hello Dana,/);
assert.match(mail.text, /payment of \$1,234\.50 on Oct 9, 2026 for invoice 1042/);
assert.match(mail.text, /now paid in full/);
assert.match(mail.text, /Thank you,\nPlantarz$/);
const part = paymentNoticeEmail({ company: "Alpha Rx", contact: null, invoiceNumber: "1043", amount: 40, paidOn: "2026-10-09", balance: 60, note: "  Your next payment is due Nov 1.  ", from: "Plantarz" });
assert.match(part.text, /^Hello,/);
assert.match(part.text, /balance still open on this invoice is \$60\.00/);
assert.match(part.text, /Your next payment is due Nov 1\.\n\nThank you/);
assert.doesNotMatch(part.text, /paid in full/);
// the email never mentions money other than this payment and the open balance (no prices, no total)
assert.doesNotMatch(mail.text, /total/i);

// readiness
assert.equal(noticeReadiness({ to: "a@b.co", handled: false, invoiceVoid: false }).ready, true);
assert.deepEqual(noticeReadiness({ to: "", handled: false, invoiceVoid: false }).blockers, ["Add the customer's email address."]);
assert.equal(noticeReadiness({ to: "nope", handled: false, invoiceVoid: false }).ready, false);
assert.equal(noticeReadiness({ to: "a@b.co", handled: true, invoiceVoid: false }).ready, false);
assert.equal(noticeReadiness({ to: "a@b.co", handled: false, invoiceVoid: true }).ready, false);
assert.equal(noticeReadiness({ to: "x", handled: true, invoiceVoid: true }).blockers.length, 3);

// window
assert.equal(inNoticeWindow("2026-09-10", today), true);
assert.equal(inNoticeWindow("2026-09-09", today), false);
assert.equal(inNoticeWindow(today, today), true);

console.log("receivable-rules: ok");
