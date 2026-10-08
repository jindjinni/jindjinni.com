// Unit tests for the billing calendar (src/lib/billing-schedule.ts). Run: npx tsx scripts/billing-schedule.test.ts
import assert from "node:assert/strict";
import { MONTHLY_CENTS, YEARLY_CENTS } from "../src/lib/billing-config";
import {
  addDays, addYear, billingDateOf, chargeSchedule, daysBetween, daysInMonth, isIsoDate, longDay, nextCharge, prorate, rangeText,
  scheduleIfTrialStarts, trialFrom, trialState, TRIAL_DAYS,
} from "../src/lib/billing-schedule";

let n = 0;
const t = (name: string, fn: () => void) => { try { fn(); n++; console.log("PASS ", name); } catch (e) { console.log("FAIL ", name, "\n", e); process.exitCode = 1; } };

t("prorate: known values", () => {
  assert.equal(prorate(97_700, 17, 31), 53_577); // 53,577.42 -> down
  assert.equal(prorate(97_700, 29, 30), 94_443); // 94,443.33 -> down
  assert.equal(prorate(97_700, 31, 31), 97_700);
  assert.equal(prorate(97_700, 0, 31), 0);
  assert.equal(prorate(1, 1, 2), 1); // half a cent rounds up
  assert.equal(prorate(100, 1, 3), 33);
});
t("prorate: rejects nonsense", () => {
  assert.throws(() => prorate(1.5, 1, 30));
  assert.throws(() => prorate(100, 31, 30));
  assert.throws(() => prorate(100, -1, 30));
  assert.throws(() => prorate(100, 1, 0));
});
t("calendar helpers", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2027-02-28", 1), "2027-03-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(daysBetween("2026-10-08", "2026-10-15"), 7);
  assert.equal(daysInMonth(2028, 2), 29); assert.equal(daysInMonth(2100, 2), 28); assert.equal(daysInMonth(2026, 4), 30);
  assert.equal(addYear("2028-02-29"), "2029-02-28");
  assert.equal(addYear("2026-10-15"), "2027-10-15");
  assert.ok(isIsoDate("2028-02-29") && !isIsoDate("2027-02-29") && !isIsoDate("2026-13-01") && !isIsoDate("2026-1-1") && !isIsoDate(null));
});
t("billing date uses the billing time zone, across daylight-saving changes", () => {
  assert.equal(billingDateOf(new Date("2026-10-09T02:30:00Z")), "2026-10-08"); // 10:30pm Eastern
  assert.equal(billingDateOf(new Date("2026-10-09T04:00:00Z")), "2026-10-09"); // midnight Eastern
  assert.equal(billingDateOf(new Date("2026-11-01T03:59:00Z")), "2026-10-31");
  assert.equal(billingDateOf(new Date("2026-11-01T04:00:00Z")), "2026-11-01");
  assert.equal(billingDateOf(new Date("2026-11-02T04:59:00Z")), "2026-11-01"); // still 11:59pm EST the day DST ended
  assert.equal(billingDateOf(new Date("2026-11-02T05:00:00Z")), "2026-11-02");
  assert.equal(billingDateOf(new Date("2027-01-01T04:59:00Z")), "2026-12-31");
});
t("trial is 7 days: approved Oct 8 -> free Oct 8-14, first paid day Oct 15", () => {
  const tr = trialFrom("2026-10-08");
  assert.deepEqual(tr, { startsOn: "2026-10-08", lastFreeDay: "2026-10-14", firstBillableOn: "2026-10-15" });
  assert.equal(daysBetween(tr.startsOn, tr.firstBillableOn), TRIAL_DAYS);
});
t("worked example: approved Oct 8 2026, monthly", () => {
  const { charges } = scheduleIfTrialStarts("monthly", "2026-10-08", 3);
  assert.deepEqual(charges[0], { date: "2026-10-15", kind: "prorated", amountCents: 53_577, coversFrom: "2026-10-15", coversTo: "2026-10-31", days: 17, daysInMonth: 31 });
  assert.deepEqual(charges[1], { date: "2026-11-01", kind: "monthly", amountCents: MONTHLY_CENTS, coversFrom: "2026-11-01", coversTo: "2026-11-30" });
  assert.equal(charges[2].date, "2026-12-01");
});
t("trial that ends exactly on the 1st: first charge is the full month, no proration", () => {
  const { trial, charges } = scheduleIfTrialStarts("monthly", "2026-10-25");
  assert.equal(trial.firstBillableOn, "2026-11-01");
  assert.equal(charges[0].kind, "monthly"); assert.equal(charges[0].amountCents, MONTHLY_CENTS); assert.equal(charges[0].date, "2026-11-01");
});
t("trial that runs into the next month: prorated for that next month (a few days after the 1st)", () => {
  const { trial, charges } = scheduleIfTrialStarts("monthly", "2026-10-26");
  assert.equal(trial.firstBillableOn, "2026-11-02");
  assert.equal(charges[0].kind, "prorated"); assert.equal(charges[0].days, 29); assert.equal(charges[0].daysInMonth, 30); assert.equal(charges[0].amountCents, 94_443);
  assert.equal(charges[1].date, "2026-12-01");
});
t("year-end and leap-year cases", () => {
  let c = scheduleIfTrialStarts("monthly", "2026-12-28").charges; // billable Jan 4
  assert.equal(c[0].date, "2027-01-04"); assert.equal(c[0].days, 28); assert.equal(c[0].daysInMonth, 31); assert.equal(c[1].date, "2027-02-01");
  c = scheduleIfTrialStarts("monthly", "2028-02-20").charges; // billable Feb 27, leap Feb
  assert.equal(c[0].date, "2028-02-27"); assert.equal(c[0].days, 3); assert.equal(c[0].daysInMonth, 29); assert.equal(c[0].amountCents, prorate(MONTHLY_CENTS, 3, 29));
  c = scheduleIfTrialStarts("monthly", "2027-01-25").charges; // billable Feb 1
  assert.equal(c[0].kind, "monthly"); assert.equal(c[0].date, "2027-02-01");
  c = scheduleIfTrialStarts("monthly", "2026-10-24").charges; // billable Oct 31, one day left
  assert.equal(c[0].days, 1); assert.equal(c[0].amountCents, prorate(MONTHLY_CENTS, 1, 31));
});
t("yearly: whole year after the trial, same date every year, no proration", () => {
  const { trial, charges } = scheduleIfTrialStarts("yearly", "2026-10-08", 3);
  assert.equal(trial.firstBillableOn, "2026-10-15");
  assert.deepEqual(charges.map((c) => [c.date, c.kind, c.amountCents]), [["2026-10-15", "yearly", YEARLY_CENTS], ["2027-10-15", "yearly", YEARLY_CENTS], ["2028-10-15", "yearly", YEARLY_CENTS]]);
  assert.equal(charges[0].coversTo, "2027-10-14");
  const leap = chargeSchedule("yearly", "2028-02-29", 3);
  assert.deepEqual(leap.map((c) => c.date), ["2028-02-29", "2029-02-28", "2030-02-28"]);
  assert.equal(leap[0].coversTo, "2029-02-27");
});
t("trial state", () => {
  const tr = trialFrom("2026-10-08");
  assert.deepEqual(trialState(tr, "2026-10-08"), { state: "in_trial", daysLeft: 7, lastFreeDay: "2026-10-14", firstBillableOn: "2026-10-15" });
  assert.equal((trialState(tr, "2026-10-14") as { daysLeft: number }).daysLeft, 1);
  assert.equal(trialState(tr, "2026-10-15").state, "ended");
  assert.equal(trialState({ startsOn: null, firstBillableOn: null }, "2026-10-15").state, "none");
});
t("next charge", () => {
  assert.equal(nextCharge("monthly", "2026-10-15", "2026-10-10")!.date, "2026-10-15");
  assert.equal(nextCharge("monthly", "2026-10-15", "2026-10-16")!.date, "2026-11-01");
  assert.equal(nextCharge("monthly", "2026-10-15", "2026-11-01")!.date, "2026-11-01");
});
t("words", () => {
  assert.equal(longDay("2026-10-15"), "October 15, 2026");
  assert.equal(rangeText("2026-10-15", "2026-10-31"), "October 15 to 31");
  assert.equal(rangeText("2026-12-28", "2027-01-03"), "December 28 to January 3");
});

// Sweep: every possible start day across four years, both plans.
t("sweep every start day 2024-2027: no gaps, no overlaps, no double billing, sane amounts", () => {
  let checked = 0;
  for (let d = "2024-01-01"; d <= "2027-12-31"; d = addDays(d, 1)) {
    const tr = trialFrom(d);
    assert.equal(daysBetween(tr.startsOn, tr.firstBillableOn), 7, d);
    assert.equal(addDays(tr.lastFreeDay, 1), tr.firstBillableOn, d);
    for (const plan of ["monthly", "yearly"] as const) {
      const cs = chargeSchedule(plan, tr.firstBillableOn, 26);
      assert.equal(cs[0].date, tr.firstBillableOn, `${plan} ${d}: first charge is on the first paid day`);
      assert.equal(cs[0].coversFrom, tr.firstBillableOn, `${plan} ${d}: first charge starts on the first paid day`);
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i];
        assert.ok(Number.isInteger(c.amountCents) && c.amountCents > 0, `${plan} ${d} #${i}: whole cents`);
        assert.equal(c.date, c.coversFrom, `${plan} ${d} #${i}: charged on the day service starts (prepaid)`);
        assert.ok(c.coversTo >= c.coversFrom, `${plan} ${d} #${i}`);
        if (i > 0) assert.equal(addDays(cs[i - 1].coversTo, 1), c.coversFrom, `${plan} ${d} #${i}: no gap or overlap`);
        if (plan === "monthly") {
          if (c.kind === "prorated") {
            assert.equal(i, 0, `${d}: only the first monthly charge can be prorated`);
            assert.ok(c.amountCents <= MONTHLY_CENTS && c.days! >= 1 && c.days! < c.daysInMonth!, `${d}: proration within the month`);
            assert.equal(daysBetween(c.coversFrom, c.coversTo) + 1, c.days);
            assert.equal(c.amountCents, prorate(MONTHLY_CENTS, c.days!, c.daysInMonth!));
            assert.equal(c.coversTo.slice(8), String(c.daysInMonth).padStart(2, "0"));
          } else {
            assert.equal(c.kind, "monthly");
            assert.equal(c.amountCents, MONTHLY_CENTS);
            assert.equal(c.date.slice(8), "01", `${d}: full months are charged on the 1st`);
            assert.equal(c.coversTo, addDays(c.coversFrom, daysInMonth(+c.coversFrom.slice(0, 4), +c.coversFrom.slice(5, 7)) - 1));
          }
        } else {
          assert.equal(c.kind, "yearly"); assert.equal(c.amountCents, YEARLY_CENTS);
          assert.equal(c.date.slice(5), i === 0 ? cs[0].date.slice(5) : c.date.slice(5));
        }
        checked++;
      }
    }
  }
  assert.ok(checked > 70_000);
});
t("sweep: a monthly customer never pays more in the first period than a full month, and months add up", () => {
  for (let d = "2026-01-01"; d <= "2026-12-31"; d = addDays(d, 1)) {
    const cs = chargeSchedule("monthly", trialFrom(d).firstBillableOn, 13);
    const days = daysBetween(cs[0].coversFrom, cs[12].coversTo) + 1;
    let covered = 0; for (const c of cs) covered += daysBetween(c.coversFrom, c.coversTo) + 1;
    assert.equal(covered, days, d);
  }
});

console.log(`\n${n} passed${process.exitCode ? ", SOME FAILED" : ", 0 failed"}`);
