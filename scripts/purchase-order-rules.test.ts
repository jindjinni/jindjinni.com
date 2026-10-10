import assert from "node:assert/strict";
import { OPERATION_OPTIONS, OPERATION_TYPES, documentOrder, operationDefaultText, operationLabel, parseOperationType, primaryDocument, readRequiredOperationType } from "../src/lib/operation-type";
import {
  FIRST_PO_SEQ,
  canMoveTo,
  cleanLines,
  cleanNdc,
  computeTotals,
  formatPoNumber,
  isDay,
  isEditable,
  licenseState,
  lineTotal,
  money,
  nextSeq,
  poFileName,
  usDate,
} from "../src/lib/purchase-order-rules";

// ---- operation type
assert.deepEqual([...OPERATION_TYPES], ["WHOLESALER", "DISTRIBUTOR", "BOTH"]);
assert.equal(OPERATION_OPTIONS.length, 3);
assert.equal(parseOperationType("distributor"), "DISTRIBUTOR");
assert.equal(parseOperationType(" both "), "BOTH");
assert.equal(parseOperationType(""), null);
assert.equal(parseOperationType("RETAILER"), null);
assert.equal(parseOperationType(null), null);
assert.equal(parseOperationType(42), null);
assert.equal(readRequiredOperationType("WHOLESALER").ok, true);
assert.equal(readRequiredOperationType(undefined).ok, false);
assert.equal(operationLabel(null), "Not answered yet");
assert.equal(operationLabel("BOTH"), "Both (we do both)");
// who gets which document: an unanswered company keeps what it had (quotations) and gets no purchase orders until it answers
// Everyone gets both documents; the answer only decides which comes first.
assert.equal(primaryDocument("WHOLESALER"), "QUOTATION");
assert.equal(primaryDocument("DISTRIBUTOR"), "PURCHASE_ORDER");
assert.equal(primaryDocument("BOTH"), "QUOTATION");
assert.equal(primaryDocument(null), "QUOTATION");
assert.deepEqual(documentOrder("DISTRIBUTOR"), ["PURCHASE_ORDER", "QUOTATION"]);
assert.deepEqual(documentOrder("WHOLESALER"), ["QUOTATION", "PURCHASE_ORDER"]);
assert.deepEqual(documentOrder(undefined), ["QUOTATION", "PURCHASE_ORDER"]);
for (const t of [...OPERATION_TYPES, null]) assert.ok(operationDefaultText(t).length > 20);

// ---- money in whole cents (the classic 0.1 + 0.2 drift must not show)
assert.equal(lineTotal(3, 0.1), 0.3);
assert.equal(lineTotal(61, 235), 14335);
const t = computeTotals([{ quantity: 4, unitCost: 4 }, { quantity: 9, unitCost: 65 }, { quantity: 5, unitCost: 13 }, { quantity: 61, unitCost: 235 }, { quantity: 1, unitCost: 35 }, { quantity: 2, unitCost: 57 }], 0);
assert.deepEqual(t, { subtotal: 15150, shipping: 0, total: 15150, units: 82 }); // the total on the sample order we were given
assert.deepEqual(computeTotals([{ quantity: 3, unitCost: 0.1 }, { quantity: 3, unitCost: 0.2 }], 1.15), { subtotal: 0.9, shipping: 1.15, total: 2.05, units: 6 });
assert.equal(computeTotals([], -5).total, 0);
assert.equal(money(15150), "$15,150.00");
assert.equal(money(4), "$4.00");

// ---- numbering
assert.equal(nextSeq([]), FIRST_PO_SEQ);
assert.equal(nextSeq([1001, 1002, 1005]), 1006);
assert.equal(nextSeq([5]), FIRST_PO_SEQ); // never goes below the first number
assert.equal(formatPoNumber(1001), "PO-1001");

// ---- statuses
assert.equal(canMoveTo("DRAFT", "SENT"), true);
assert.equal(canMoveTo("DRAFT", "RECEIVED"), false);
assert.equal(canMoveTo("SENT", "DRAFT"), true);
assert.equal(canMoveTo("SENT", "CONFIRMED"), true);
assert.equal(canMoveTo("CONFIRMED", "DRAFT"), false);
assert.equal(canMoveTo("RECEIVED", "CANCELLED"), false);
assert.equal(canMoveTo("CANCELLED", "DRAFT"), false);
assert.equal(isEditable("DRAFT"), true);
assert.equal(isEditable("SENT"), false);

// ---- NDC
assert.deepEqual(cleanNdc(""), { ok: true, ndc: null });
assert.deepEqual(cleanNdc("08508-3000-21"), { ok: true, ndc: "08508-3000-21" });
assert.deepEqual(cleanNdc("08508300021"), { ok: true, ndc: "08508-3000-21" }); // 11 digits without hyphens -> 5-4-2
assert.deepEqual(cleanNdc("1234-5678-90"), { ok: true, ndc: "1234-5678-90" });
const ambiguous = cleanNdc("1234567890"); // 10 digits without hyphens: three layouts, so it is kept as typed, not guessed
assert.deepEqual(ambiguous, { ok: true, ndc: "1234567890" });
assert.equal(cleanNdc("12-34").ok, false);
assert.equal(cleanNdc("ABC").ok, false);
assert.equal(cleanNdc("123456789012").ok, false); // 12 digits is a UPC, not an NDC

// ---- lines
assert.equal(cleanLines([]).ok, false);
assert.equal(cleanLines([{ name: "", quantity: 1, unitCost: 0 }]).ok, false); // an empty row is ignored, leaving no lines
const good = cleanLines([
  { partNumber: "08508-3000-21", ndc: "08508-3000-21", name: "Omnipod 5PK G6/G7(5)", size: "5", quantity: "61", unit: "ea", unitCost: "235" },
  { name: "Freestyle Libre 3 Plus", quantity: 9, unitCost: 65.005 },
  { name: "", quantity: 1, unitCost: 0 }, // blank row dropped
]);
assert.equal(good.ok, true);
if (good.ok) {
  assert.equal(good.lines.length, 2);
  assert.equal(good.lines[0].unit, "EA");
  assert.equal(good.lines[0].total, 14335);
  assert.equal(good.lines[1].unitCost, 65.01); // rounded to the cent
}
for (const bad of [
  { name: "X", quantity: 0, unitCost: 1 },
  { name: "X", quantity: 1.5, unitCost: 1 },
  { name: "X", quantity: 1, unitCost: -1 },
  { name: "X", quantity: 1, unitCost: "abc" },
  { name: "X", ndc: "12", quantity: 1, unitCost: 1 },
  { name: "", ndc: "08508-3000-21", quantity: 1, unitCost: 1 },
]) assert.equal(cleanLines([bad]).ok, false, JSON.stringify(bad));
const msg = cleanLines([{ name: "A", quantity: 1, unitCost: 1 }, { name: "B", quantity: 0, unitCost: 1 }]);
assert.equal(msg.ok === false && msg.error.startsWith("Line 2:"), true);

// ---- dates and licenses
assert.equal(isDay("2026-10-06"), true);
assert.equal(isDay("2026-02-30"), false);
assert.equal(isDay("10/06/2026"), false);
assert.equal(usDate("2026-10-06"), "10/06/2026");
assert.equal(usDate(null), "");
assert.equal(licenseState(null, "2026-10-09"), "none");
assert.equal(licenseState("garbage", "2026-10-09"), "none");
assert.equal(licenseState("2026-10-08", "2026-10-09"), "expired");
assert.equal(licenseState("2026-10-09", "2026-10-09"), "soon"); // good through today
assert.equal(licenseState("2026-12-08", "2026-10-09"), "soon"); // 60 days
assert.equal(licenseState("2026-12-09", "2026-10-09"), "ok");

// ---- file names
assert.equal(poFileName("PO-1001", "Acme Supply, LLC"), "PO-1001-Acme-Supply-LLC.pdf");
assert.equal(poFileName("PO-1001", ""), "PO-1001.pdf");

console.log("purchase-order-rules: all passed");
