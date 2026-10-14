import assert from "node:assert/strict";
import { describeExpiry, parseExpiryInput, rangeText, toInputText } from "../src/lib/expiry-range-rules";

const ok = (s: string) => { const r = parseExpiryInput(s); assert.ok(r.ok, `${s}: ${!r.ok ? r.error : ""}`); return r as Extract<typeof r, { ok: true }>; };
const bad = (s: string) => { const r = parseExpiryInput(s); assert.ok(!r.ok, `${s} should fail`); return (r as Extract<typeof r, { ok: false }>).error; };

// the user's own examples
for (const s of ["8/2027-6/2028", "8/2027 - 6/2028", "8/2027 to 6/2028", "Aug 2027 - Jun 2028", "08/2027–06/2028", "2027-08 - 2028-06", "2027-08-2028-06", "August 2027 through June 2028"]) {
  const r = ok(s);
  assert.deepEqual([r.from, r.to, r.kind], ["2027-08-31", "2028-06-30", "range"], s);
}
// two-digit years only inside a range
assert.deepEqual([ok("5/27 to 11/28").from, ok("5/27 to 11/28").to], ["2027-05-31", "2028-11-30"]);
assert.deepEqual([ok("5/27-11/28").from, ok("5/27-11/28").to], ["2027-05-31", "2028-11-30"]);
assert.match(bad("5/27"), /full year/);
// a single month means its last day; a single day is itself
assert.deepEqual([ok("8/2027").from, ok("8/2027").to, ok("8/2027").kind], ["2027-08-31", null, "month"]);
assert.equal(ok("2028-02").from, "2028-02-29");
assert.equal(ok("Feb 2027").from, "2027-02-28");
assert.deepEqual([ok("2027-08-15").from, ok("2027-08-15").kind], ["2027-08-15", "day"]);
assert.equal(ok("8/15/2027").from, "2027-08-15");
// empty = none
assert.deepEqual(ok("  "), { ok: true, from: null, to: null, kind: "none" });
// a range of one month is just that month
assert.deepEqual([ok("8/2027-8/2027").from, ok("8/2027-8/2027").to], ["2027-08-31", null]);
// a day inside a range keeps its day
assert.deepEqual([ok("2027-08-15 to 2028-06-30").from, ok("2027-08-15 to 2028-06-30").to], ["2027-08-15", "2028-06-30"]);
// mistakes are explained
assert.match(bad("6/2028-8/2027"), /after the second/);
assert.match(bad("13/2027"), /couldn't read/);
assert.match(bad("2/30/2027"), /couldn't read/);
assert.match(bad("soon"), /couldn't read/);
assert.match(bad("8/2027-"), /couldn't read/);
// text for the screen
assert.equal(rangeText("2027-08-31", "2028-06-30"), "8/2027 – 6/2028");
assert.equal(rangeText("2027-08-31", null), null);
assert.equal(toInputText("2027-08-31", "2028-06-30"), "8/2027-6/2028");
assert.equal(toInputText("2027-08-31", null), "8/2027");
assert.equal(toInputText("2027-08-15", null), "2027-08-15");
assert.equal(toInputText("2027-03-10", "2027-06-20"), "2027-03-10 to 2027-06-20");
for (const [a, b] of [["2027-08-31", "2028-06-30"], ["2027-03-10", "2027-06-20"], ["2027-08-31", null], ["2027-08-15", null], ["2027-08-15", "2028-06-30"]] as const) {
  const r = parseExpiryInput(toInputText(a, b));
  assert.ok(r.ok && r.from === a && (r.to ?? null) === b, `round trip ${a} ${b}`);
}
assert.equal(toInputText(null, null), "");
assert.equal(describeExpiry(parseExpiryInput("8/2027-6/2028")), "Aug 2027 through Jun 2028");
assert.equal(describeExpiry(parseExpiryInput("8/2027")), "Aug 2027");
assert.equal(describeExpiry(parseExpiryInput("8/15/2027")), "Aug 15, 2027");
console.log("expiry-range-rules ok");
