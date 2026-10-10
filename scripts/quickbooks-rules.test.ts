import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ACK_LABEL, MAX_ROWS, NOTICE_POINTS, REPORT_META, TERMS_VERSION, ackOk, csvOf, fileOk, fromQboPayments, fromQboReport, kindsFor, lastDays, looksLikeMoney, refreshWait, tableFromGrid,
} from "../src/lib/quickbooks-rules";
import { makeState, readState } from "../src/lib/email-connector-crypto";
import { canPullReports, canSeeReport } from "../src/lib/quickbooks-access";

process.env.AUTH_SECRET = "test-secret";

// which reports whom
assert.deepEqual(kindsFor("accounts"), ["PAID", "OWED", "PNL"]);
assert.deepEqual(kindsFor("sales"), ["PAID", "OWED"]);
assert.equal(canSeeReport("accountant", undefined, "PNL"), true);
assert.equal(canSeeReport("customer_service", undefined, "PAID"), false);
assert.equal(canSeeReport("owner", undefined, "PNL"), true);
assert.equal(canPullReports("owner"), true);
assert.equal(canPullReports("customer_service"), false);
for (const k of ["PAID", "OWED", "PNL"] as const) assert.ok(REPORT_META[k].fileHint.length > 20);

// the notice
assert.ok(NOTICE_POINTS.length >= 5);
assert.ok(NOTICE_POINTS.join(" ").includes("only reads"));
assert.ok(NOTICE_POINTS.join(" ").toLowerCase().includes("not take responsibility"));
assert.ok(ACK_LABEL.length > 10);
assert.equal(ackOk(TERMS_VERSION), true);
assert.equal(ackOk("old"), false);
assert.equal(ackOk(null), false);

// the signed state carries the accepted version and refuses tampering
const st = makeState({ o: "org1", u: "u1", n: "nn", a: TERMS_VERSION });
assert.equal(readState(st)?.a, TERMS_VERSION);
assert.equal(readState(st.slice(0, -2) + "xx"), null);
assert.equal(readState(makeState({ o: "o", u: "u", n: "n" }, Date.now() - 20 * 60 * 1000)), null);

// a QuickBooks report becomes a flat table
const aging = fromQboReport(
  {
    Columns: { Column: [{ ColTitle: "" }, { ColTitle: "Current" }, { ColTitle: "1 - 30" }, { ColTitle: "Total" }] },
    Rows: {
      Row: [
        { type: "Data", ColData: [{ value: "Acme Rx" }, { value: "100.00" }, { value: "20.00" }, { value: "120.00" }] },
        { type: "Data", ColData: [{ value: "Bay Pharmacy" }, { value: "" }, { value: "5.00" }, { value: "5.00" }] },
        { type: "Section", Summary: { ColData: [{ value: "TOTAL" }, { value: "100.00" }, { value: "25.00" }, { value: "125.00" }] } },
      ],
    },
  },
  "Customer",
);
assert.deepEqual(aging.columns, ["Customer", "Current", "1 - 30", "Total"]);
assert.equal(aging.rows.length, 3);
assert.deepEqual(aging.bold, [2]);
assert.equal(aging.rows[1][1], "");

const pnl = fromQboReport({
  Columns: { Column: [{ ColTitle: "" }, { ColTitle: "Total" }] },
  Rows: {
    Row: [
      { type: "Section", Header: { ColData: [{ value: "Income" }, { value: "" }] }, Rows: { Row: [{ type: "Data", ColData: [{ value: "Sales" }, { value: "900.00" }] }] }, Summary: { ColData: [{ value: "Total Income" }, { value: "900.00" }] } },
      { type: "Section", Summary: { ColData: [{ value: "Net Income" }, { value: "400.00" }] } },
    ],
  },
});
assert.deepEqual(pnl.rows.map((r) => r[0]), ["Income", "  Sales", "Total Income", "Net Income"]);
assert.deepEqual(pnl.bold, [0, 2, 3]);
assert.deepEqual(fromQboReport({}).rows, []);

// payments newest first, with a total
const pay = fromQboPayments([
  { TxnDate: "2026-09-01", CustomerRef: { name: "A" }, TotalAmt: 10 },
  { TxnDate: "2026-10-01", CustomerRef: { name: "B" }, TotalAmt: 20.5, PaymentRefNum: "R1", UnappliedAmt: 5 },
]);
assert.equal(pay.rows[0][1], "B");
assert.equal(pay.rows[0][4], "5.00");
assert.deepEqual(pay.rows[2].slice(0, 3), ["Total", "2 payments", "30.50"]);
assert.deepEqual(pay.bold, [2]);
assert.deepEqual(fromQboPayments([]).rows, []);

// an uploaded export: title rows above the headings, empty leading column
const grid = [["A/R Aging Summary"], ["As of October 10, 2026"], ["", "Customer", "Current", "Total"], ["", "Acme", "10.00", "10.00"], ["", "TOTAL", "10.00", "10.00"]];
const t = tableFromGrid(grid);
assert.ok(t.ok);
if (t.ok) {
  assert.deepEqual(t.table.columns, ["Customer", "Current", "Total"]);
  assert.equal(t.table.rows.length, 2);
  assert.deepEqual(t.table.bold, [1]);
}
assert.equal(tableFromGrid([["only a title"]]).ok, false);
assert.equal(tableFromGrid([["a", "b"]]).ok, false);
assert.equal(tableFromGrid([]).ok, false);
const huge = tableFromGrid([["x", "y"], ...Array.from({ length: MAX_ROWS + 1 }, () => ["1", "2"])]);
assert.equal(huge.ok, false);

// downloads can't run formulas; numbers stay numbers
assert.equal(looksLikeMoney("-20.00"), true);
assert.equal(looksLikeMoney("(20.00)"), true);
assert.equal(looksLikeMoney("=1+1"), false);
const csv = csvOf({ columns: ["Name", "Amt"], rows: [["=HYPERLINK(\"x\")", "-5.00"], ["a, b", "1"]] });
assert.ok(csv.includes("'=HYPERLINK"));
assert.ok(csv.includes(",-5.00"));
assert.ok(csv.includes('"a, b"'));

// only CSV files
assert.equal(fileOk("report.csv"), true);
assert.equal(fileOk("REPORT.CSV"), true);
assert.equal(fileOk("report.xlsx"), false);
assert.equal(fileOk("report.csv.exe"), false);

// the cooldown and the date range
const now = Date.parse("2026-10-10T12:00:30Z");
assert.equal(refreshWait("2026-10-10T12:00:00.000Z", now), 30);
assert.equal(refreshWait("2026-10-10 11:00:00", now), 0);
assert.equal(refreshWait(null, now), 0);
assert.deepEqual(lastDays("2026-10-10", 90), { start: "2026-07-13", end: "2026-10-10" });

// READ ONLY: the QuickBooks data is reached by one function that only sends GET. Every other call is the sign-in itself.
const src = readFileSync(new URL("../src/lib/quickbooks.ts", import.meta.url), "utf8");
assert.equal((src.match(/fetch\(url,/g) ?? []).length, 1, "exactly one call to QuickBooks' data");
assert.ok(/fetch\(url, \{ method: "GET"/.test(src));
assert.ok(!/method: "(PUT|PATCH|DELETE)"/.test(src));
const posts = (src.match(/method: "POST"/g) ?? []).length;
assert.equal(posts, 3, "POST is only for the sign-in: code exchange, key refresh, revoke");
for (const f of ["../src/lib/quickbooks-service.ts", "../src/app/actions/quickbooks.ts"]) {
  const other = readFileSync(new URL(f, import.meta.url), "utf8");
  assert.ok(!/fetch\(/.test(other), `${f} never calls QuickBooks directly`);
}

console.log("quickbooks-rules: ok");
