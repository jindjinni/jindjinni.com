import assert from "node:assert/strict";
import { addDaysYmd, auditorLabel, auditorTitle, averageDaysToAnswer, casesByMonth, checkAuditor, daysBetween, dueInfo, lastMonths, missingSummary, reminders, topCounts } from "../src/lib/audit-insights";

// ---- due dates
const today = "2026-10-10";
assert.equal(daysBetween(today, "2026-10-13"), 3);
assert.equal(daysBetween(today, "2026-10-08"), -2);
assert.equal(addDaysYmd("2026-12-30", 3), "2027-01-02");
assert.deepEqual(dueInfo("2026-10-08", "NEW_REQUEST", today), { kind: "OVERDUE", days: -2, label: "Overdue by 2 days" });
assert.equal(dueInfo("2026-10-09", "NEW_REQUEST", today).label, "Overdue by 1 day");
assert.equal(dueInfo("2026-10-10", "READY_TO_SEND", today).kind, "TODAY");
assert.equal(dueInfo("2026-10-11", "NEW_REQUEST", today).label, "Due tomorrow");
assert.equal(dueInfo("2026-10-17", "NEW_REQUEST", today).kind, "SOON");
assert.equal(dueInfo("2026-10-17", "NEW_REQUEST", today).label, "Due in 7 days");
assert.equal(dueInfo("2026-10-18", "NEW_REQUEST", today).kind, "LATER");
assert.equal(dueInfo(null, "NEW_REQUEST", today).kind, "NONE");
assert.equal(dueInfo("not a day", "NEW_REQUEST", today).kind, "NONE");
for (const s of ["SENT", "COMPLETE", "CANCELLED"]) assert.equal(dueInfo("2020-01-01", s, today).kind, "DONE", s);
assert.equal(dueInfo("2020-01-01", "FOLLOW_UP_REQUIRED", today).kind, "OVERDUE");

const cases = [
  { id: "a", status: "NEW_REQUEST", dueOn: "2026-10-12" },
  { id: "b", status: "READY_TO_SEND", dueOn: "2026-10-01" },
  { id: "c", status: "SENT", dueOn: "2026-09-01" },
  { id: "d", status: "NEW_REQUEST", dueOn: null },
  { id: "e", status: "WAITING_FOR_INFORMATION", dueOn: "2026-10-10" },
  { id: "f", status: "NEW_REQUEST", dueOn: "2026-11-30" },
  { id: "g", status: "NEW_REQUEST", dueOn: "2026-09-20" },
];
const r = reminders(cases, today);
assert.deepEqual(r.overdue.map((c) => c.id), ["g", "b"]); // oldest first
assert.deepEqual(r.today.map((c) => c.id), ["e"]);
assert.deepEqual(r.soon.map((c) => c.id), ["a"]);
assert.equal(r.count, 4);

// ---- months
assert.deepEqual(lastMonths("2026-02-15", 4), ["2025-11", "2025-12", "2026-01", "2026-02"]);
const months = lastMonths("2026-10-10", 3);
const byM = casesByMonth([
  { auditType: "PBM", createdAt: "2026-10-02 10:00:00" }, { auditType: "PBM", createdAt: "2026-10-03T10:00:00Z" }, { auditType: "INTERNAL", createdAt: "2026-09-30 23:59:59" },
  { auditType: "REGULATORY", createdAt: "2026-08-01 00:00:00" }, { auditType: "REGULATORY", createdAt: "2026-07-31 00:00:00" }, { auditType: "OTHER", createdAt: "2026-10-04 00:00:00" },
], months);
assert.deepEqual(byM.map((x) => [x.month, x.INTERNAL, x.PBM, x.REGULATORY, x.total]), [["2026-08", 0, 0, 1, 1], ["2026-09", 1, 0, 0, 1], ["2026-10", 0, 2, 0, 2]]);

// ---- average time
assert.equal(averageDaysToAnswer([]), null);
assert.equal(averageDaysToAnswer([{ requestReceivedOn: null, createdAt: "2026-10-01 09:00:00", sentAt: null }]), null);
assert.equal(averageDaysToAnswer([
  { requestReceivedOn: "2026-10-01", createdAt: "2026-10-05 09:00:00", sentAt: "2026-10-04T12:00:00.000Z" }, // 3
  { requestReceivedOn: null, createdAt: "2026-10-01 09:00:00", sentAt: "2026-10-02T12:00:00.000Z" }, // 1
  { requestReceivedOn: "2026-10-09", createdAt: "2026-10-09 09:00:00", sentAt: "2026-10-01T12:00:00.000Z" }, // negative: ignored
]), 2);

// ---- counts
assert.deepEqual(topCounts(["B", "A", "A", " ", null, "B", "C", "A"], 2), [{ name: "A", count: 3 }, { name: "B", count: 2 }]);
assert.deepEqual(topCounts(["x  y", "x y"]), [{ name: "x y", count: 2 }]);
assert.equal(auditorLabel({ pbmName: null, agency: "Ohio Board", auditorCompany: "Z", auditorName: "P" }), "Ohio Board");
assert.equal(auditorLabel({ pbmName: null, agency: null, auditorCompany: null, auditorName: null }), null);

// ---- data gaps: only columns a file really has are judged
const ms = missingSummary([
  { columns: [{ key: "ndc" }, { key: "productDescription" }, { key: "invoiceNumber" }, { key: "quantity" }, { key: "date" }], rows: [
    { ndc: "", productDescription: "10-Day", invoiceNumber: "INV-1", quantity: 2, date: "2026-10-01", productName: "Omnipod 5" },
    { ndc: null, productDescription: "", invoiceNumber: "", quantity: 0, date: "", productName: "Omnipod 5" },
  ] },
  { columns: [{ key: "ndc" }, { key: "quantity" }], rows: [{ ndc: "08508-3000-21", quantity: 1, productName: "Libre" }, { ndc: "", quantity: 4, productName: "Dexcom G7" }] },
]);
assert.equal(ms.rows, 4);
assert.deepEqual(ms.byKind, { ndc: 3, description: 1, invoiceNumber: 1, quantity: 1, date: 1 });
assert.deepEqual(ms.products, [{ name: "Omnipod 5", count: 2 }, { name: "Dexcom G7", count: 1 }]);

// ---- directory
assert.deepEqual(checkAuditor({ kind: "PBM", name: " Pat  Lee ", company: "Express Scripts", email: " PAT@X.com ", phone: "", notes: " hi " }), { ok: true, value: { kind: "PBM", name: "Pat Lee", company: "Express Scripts", email: "pat@x.com", phone: null, notes: "hi" } });
assert.deepEqual(checkAuditor({ kind: "bogus", name: "", company: "Ohio Board", email: "", phone: "", notes: "" }).ok, true);
assert.equal((checkAuditor({ kind: "bogus", name: "", company: "Ohio Board", email: "", phone: "", notes: "" }) as { value: { kind: string } }).value.kind, "OTHER");
assert.equal(checkAuditor({ kind: "PBM", name: "", company: " ", email: "", phone: "", notes: "" }).ok, false);
assert.equal(checkAuditor({ kind: "PBM", name: "Pat", company: "", email: "not-an-email", phone: "", notes: "" }).ok, false);
assert.equal(checkAuditor({ kind: "PBM", name: "Pat", company: "", email: "a@b.com, c@d.com", phone: "", notes: "" }).ok, false);
assert.equal(auditorTitle({ name: "Pat Lee", company: "Express Scripts", email: "pat@x.com" }), "Express Scripts — Pat Lee (pat@x.com)");
assert.equal(auditorTitle({ name: null, company: "Ohio Board", email: null }), "Ohio Board");

console.log("audit-insights: ok");
