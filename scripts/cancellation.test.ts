// Unit tests for the cancellation and refund policy (src/lib/cancellation.ts). Run: npx tsx scripts/cancellation.test.ts
import assert from "node:assert/strict";
import { YEARLY_CENTS } from "../src/lib/billing-config";
import { addDays, daysBetween, lastDayOfMonth, trialFrom } from "../src/lib/billing-schedule";
import { cancellationOutcome, serviceHasEnded, yearlyTermContaining } from "../src/lib/cancellation";

let n = 0;
const t = (name: string, fn: () => void) => { try { fn(); n++; console.log("PASS ", name); } catch (e) { console.log("FAIL ", name, "\n", e); process.exitCode = 1; } };

t("monthly: no refund, service to the end of the month you cancel in", () => {
  const o = cancellationOutcome({ plan: "monthly", today: "2026-11-10", firstBillableOn: "2026-10-15", paid: true });
  assert.deepEqual([o.kind, o.serviceEndsOn, o.refundCents], ["monthly", "2026-11-30", 0]);
  assert.equal(cancellationOutcome({ plan: "monthly", today: "2026-11-30", firstBillableOn: "2026-10-15", paid: true }).serviceEndsOn, "2026-11-30");
  assert.equal(cancellationOutcome({ plan: "monthly", today: "2026-11-01", firstBillableOn: "2026-10-15", paid: true }).serviceEndsOn, "2026-11-30");
  assert.equal(cancellationOutcome({ plan: "monthly", today: "2028-02-03", firstBillableOn: "2026-10-15", paid: true }).serviceEndsOn, "2028-02-29");
});
t("cancelling in the free trial: free to the end of the trial, no charge, no refund", () => {
  const tr = trialFrom("2026-10-08");
  for (const plan of ["monthly", "yearly"] as const) {
    const o = cancellationOutcome({ plan, today: "2026-10-10", firstBillableOn: tr.firstBillableOn, paid: false });
    assert.deepEqual([o.kind, o.serviceEndsOn, o.refundCents], ["trial", "2026-10-14", 0]);
  }
  assert.equal(cancellationOutcome({ plan: "yearly", today: "2026-10-14", firstBillableOn: "2026-10-15", paid: false }).kind, "trial");
  assert.equal(cancellationOutcome({ plan: "yearly", today: "2026-10-15", firstBillableOn: "2026-10-15", paid: true }).kind, "yearly");
});
t("yearly: service to month end, unused days refunded", () => {
  // year Oct 15 2026 - Oct 14 2027 (365 days). Cancel Jan 10 2027 -> service to Jan 31, unused Feb 1 - Oct 14.
  const o = cancellationOutcome({ plan: "yearly", today: "2027-01-10", firstBillableOn: "2026-10-15", paid: true });
  assert.equal(o.serviceEndsOn, "2027-01-31");
  assert.equal(o.termEndsOn, "2027-10-14");
  assert.equal(o.unusedDays, daysBetween("2027-01-31", "2027-10-14"));
  assert.equal(o.unusedDays, 256);
  assert.equal(o.termDays, 365);
  assert.equal(o.refundCents, Math.floor((2 * YEARLY_CENTS * 256 + 365) / (2 * 365)));
  assert.equal(o.refundCents, 736_368); // $7,363.68
});
t("yearly: three whole months used -> about nine months back", () => {
  // Cancel in the third month (Dec 20): service to Dec 31 (2.5 months used), unused Jan 1 - Oct 14.
  const o = cancellationOutcome({ plan: "yearly", today: "2026-12-20", firstBillableOn: "2026-10-15", paid: true });
  assert.equal(o.serviceEndsOn, "2026-12-31");
  assert.ok(o.refundCents > YEARLY_CENTS * 0.77 && o.refundCents < YEARLY_CENTS * 0.8, String(o.refundCents));
});
t("yearly: cancelling in the last month of the term refunds nothing", () => {
  const o = cancellationOutcome({ plan: "yearly", today: "2027-10-05", firstBillableOn: "2026-10-15", paid: true });
  assert.deepEqual([o.serviceEndsOn, o.refundCents, o.unusedDays], ["2027-10-14", 0, 0]);
});
t("yearly: second year uses the second term", () => {
  const o = cancellationOutcome({ plan: "yearly", today: "2027-11-20", firstBillableOn: "2026-10-15", paid: true });
  assert.equal(o.termEndsOn, "2028-10-14"); assert.equal(o.serviceEndsOn, "2027-11-30"); assert.equal(o.termDays, 366); // spans 29 Feb 2028
  assert.deepEqual(yearlyTermContaining("2026-10-15", "2027-10-15"), { from: "2027-10-15", to: "2028-10-14" });
  assert.deepEqual(yearlyTermContaining("2026-10-15", "2027-10-14"), { from: "2026-10-15", to: "2027-10-14" });
});
t("nothing paid means nothing refunded", () => {
  assert.equal(cancellationOutcome({ plan: "yearly", today: "2027-01-10", firstBillableOn: "2026-10-15", paid: false }).refundCents, 0);
});
t("a company without trial dates or a plan falls back to the monthly rule", () => {
  assert.deepEqual(cancellationOutcome({ plan: null, today: "2026-10-10", firstBillableOn: null, paid: false }).kind, "monthly");
  assert.deepEqual(cancellationOutcome({ plan: "yearly", today: "2026-10-10", firstBillableOn: null, paid: true }).refundCents, 0);
});
t("service has ended only after the last day", () => {
  assert.equal(serviceHasEnded("2026-11-30", "2026-11-30"), false);
  assert.equal(serviceHasEnded("2026-11-30", "2026-12-01"), true);
  assert.equal(serviceHasEnded(null, "2026-12-01"), false);
});
t("sweep every cancel day for 4 years, many start days: invariants", () => {
  for (let start = "2026-01-01"; start <= "2026-12-31"; start = addDays(start, 11)) {
    const first = trialFrom(start).firstBillableOn;
    for (let d = start; d <= addDays(start, 4 * 366); d = addDays(d, 1)) {
      for (const plan of ["monthly", "yearly"] as const) {
        const o = cancellationOutcome({ plan, today: d, firstBillableOn: first, paid: true });
        assert.ok(o.serviceEndsOn >= d, `${plan} ${start} ${d}: service never ends before the cancel day`);
        assert.ok(o.refundCents >= 0 && o.refundCents < YEARLY_CENTS, `${plan} ${d}: refund within bounds`);
        assert.ok(Number.isInteger(o.refundCents));
        if (plan === "monthly" || o.kind === "trial") assert.equal(o.refundCents, 0);
        if (o.kind === "monthly") assert.equal(o.serviceEndsOn, lastDayOfMonth(d));
        if (o.kind === "yearly") {
          assert.ok(o.serviceEndsOn <= o.termEndsOn!);
          assert.ok(o.serviceEndsOn === lastDayOfMonth(d) || o.serviceEndsOn === o.termEndsOn);
          assert.equal(o.unusedDays, daysBetween(o.serviceEndsOn, o.termEndsOn!));
          // the later in the year you cancel, the smaller the refund (within one term)
          const next = cancellationOutcome({ plan, today: addDays(d, 1), firstBillableOn: first, paid: true });
          if (next.kind === "yearly" && next.termEndsOn === o.termEndsOn) assert.ok(next.refundCents <= o.refundCents, `${d}: refund never grows`);
        }
      }
    }
  }
});

console.log(`\n${n} passed${process.exitCode ? ", SOME FAILED" : ", 0 failed"}`);
