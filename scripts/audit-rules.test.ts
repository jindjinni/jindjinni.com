import assert from "node:assert/strict";
import {
  MONEY_KEYS, PBM_COLUMNS, assertPbmSafe, blockers, buildRows, caseNumber, columnsFor, dedupeLines, dropBlankColumns, fileNameFor, lineWarnings,
  pbmSubject, regulatorySubject, presetRange, safeguards, safePart, sortLines, summarize, usDate, workingStatus, type SourceLine,
} from "../src/lib/audit-rules";

const L = (o: Partial<SourceLine> & { lineId: string; invoiceId: string }): SourceLine => ({
  invoiceNumber: "INV-1001", date: "2026-03-05", position: 0, productId: "p1", productKey: "k1", productName: "Dexcom G7 Sensor", ndc: "08627-0016-01",
  packageDescription: "10-Day", quantity: 3, unitPrice: 199.5, invoiceShipping: 25, invoiceDiscount: 10, ...o,
});
const lines: SourceLine[] = [
  L({ lineId: "b", invoiceId: "i2", invoiceNumber: "INV-1010", date: "2026-04-01", productName: "OneTouch Ultra", ndc: "53885-0245-50", packageDescription: "50ct", quantity: 2, unitPrice: 20 }),
  L({ lineId: "a2", invoiceId: "i1", position: 1, productName: "Dexcom G7 Receiver", ndc: null, packageDescription: null, quantity: 1, unitPrice: 300 }),
  L({ lineId: "a1", invoiceId: "i1", position: 0 }),
  L({ lineId: "a1", invoiceId: "i1", position: 0 }), // the same line reached twice
];

// duplicates and order: date, then invoice number, then place on the invoice
assert.equal(dedupeLines(lines).length, 3);
assert.deepEqual(sortLines(dedupeLines(lines)).map((l) => l.lineId), ["a1", "a2", "b"]);

// the PBM template can never carry money, and building one proves it
assert.deepEqual(PBM_COLUMNS.map((c) => c.header), ["Type", "Date", "Invoice Number", "NDC / NRC", "Pharmacy Name", "Product Name / Item", "Product Description / Box Count / Device Duration", "Quantity Sold"]);
assert.doesNotThrow(() => assertPbmSafe(PBM_COLUMNS));
assert.throws(() => assertPbmSafe([...PBM_COLUMNS, columnsFor("INTERNAL").find((c) => c.key === "unitPrice")!]));
const pbm = buildRows("PBM", lines, { name: "Example Pharmacy LLC", ncpdp: "5746826" }, { includePharmacy: false });
assert.equal(pbm.rows.length, 3);
for (const r of pbm.rows) for (const k of MONEY_KEYS) assert.ok(!(k in r), `PBM row has ${k}`);
assert.equal(JSON.stringify(pbm.rows).includes("199.5"), false);
assert.equal(JSON.stringify(pbm.rows).includes("300"), false);
assert.deepEqual(pbm.rows[0], { type: "Invoice", date: "2026-03-05", invoiceNumber: "INV-1001", ndc: "08627-0016-01", pharmacyName: "Example Pharmacy LLC", productName: "Dexcom G7 Sensor", productDescription: "10-Day", quantity: 3 });
// even with every option on, a PBM report has the same eight columns
assert.deepEqual(columnsFor("PBM", { includePharmacy: true }).map((c) => c.key), PBM_COLUMNS.map((c) => c.key));

// internal: prices, line totals; shipping and discount once per invoice, on its first line
const internal = buildRows("INTERNAL", lines, { name: "Example Pharmacy LLC", ncpdp: "5746826" });
assert.equal(internal.rows[0].unitPrice, 199.5);
assert.equal(internal.rows[0].lineTotal, 598.5);
assert.equal(internal.rows[0].shipping, 25);
assert.equal(internal.rows[0].discount, 10);
assert.equal(internal.rows[1].shipping, null);
assert.equal(internal.rows[2].shipping, 25);
assert.ok(!internal.columns.some((c) => c.key === "pharmacyName"));
assert.ok(columnsFor("INTERNAL", { includePharmacy: true }).some((c) => c.key === "ncpdp"));
// blank columns are left out
const noDisc = buildRows("INTERNAL", [L({ lineId: "z", invoiceId: "iz", invoiceDiscount: 0, invoiceShipping: 0 })], { name: "P", ncpdp: null });
const kept = dropBlankColumns(noDisc.columns, noDisc.rows).map((c) => c.key);
assert.ok(!kept.includes("shipping") && !kept.includes("discount") && kept.includes("unitPrice"));

// checks before generating
const base = { type: "PBM" as const, pharmacyName: "Example Pharmacy LLC", ncpdp: "5746826", startDate: "2026-01-01", endDate: "2026-06-30", deviceAnswer: "YES" as const, auditorName: "A. Auditor" };
assert.deepEqual(blockers(base), []);
assert.match(blockers({ ...base, ncpdp: null }).join(" "), /NCPDP/);
assert.match(blockers({ ...base, deviceAnswer: "UNCLEAR" }).join(" "), /Confirm with the auditor/);
assert.match(blockers({ ...base, deviceAnswer: null }).join(" "), /Confirm with the auditor/);
assert.match(blockers({ ...base, deviceAnswer: "NO" }).join(" "), /not asking for device/);
assert.match(blockers({ ...base, startDate: "2026-07-01" }).join(" "), /after the end date/);
assert.match(blockers({ ...base, startDate: null }).join(" "), /start date/);
assert.match(blockers({ ...base, pharmacyName: "" }).join(" "), /Choose the pharmacy/);
assert.match(blockers({ ...base, auditorName: "", auditorEmail: "" }).join(" "), /who the auditor is/);
assert.deepEqual(blockers({ type: "INTERNAL", pharmacyName: "P", ncpdp: null, startDate: "2026-01-01", endDate: "2026-01-31", deviceAnswer: null }), []);

// data-quality flags keep the line in and name the gap
const w = lineWarnings(lines);
assert.deepEqual(w.map((x) => x.code).sort(), ["MISSING_DESCRIPTION", "MISSING_NDC"]);
assert.equal(lineWarnings([L({ lineId: "q", invoiceId: "iq", invoiceNumber: null, quantity: 0, date: null })]).length, 3);

// counts, safeguards, status
assert.deepEqual(summarize(pbm.rows), { rows: 3, invoices: 2, products: 3, units: 6 });
assert.deepEqual(safeguards("PBM"), { pricing: "excluded", shipping: "excluded", locked: true });
assert.equal(safeguards("INTERNAL").pricing, "included");
assert.equal(workingStatus({ type: "PBM", deviceAnswer: "UNCLEAR", hasFile: false, blockers: 0 }), "DEVICE_CONFIRMATION_NEEDED");
assert.equal(workingStatus({ type: "PBM", deviceAnswer: "YES", hasFile: false, blockers: 1 }), "WAITING_FOR_INFORMATION");
assert.equal(workingStatus({ type: "PBM", deviceAnswer: "YES", hasFile: false, blockers: 0 }), "READY_TO_GENERATE");
assert.equal(workingStatus({ type: "INTERNAL", deviceAnswer: null, hasFile: true, blockers: 0 }), "READY_TO_SEND");

// names, numbers, dates
assert.equal(caseNumber(2026, 1), "AUD-2026-00001");
assert.equal(caseNumber(2026, 12345), "AUD-2026-12345");
assert.equal(safePart("Example/Pharmacy: LLC?"), "ExamplePharmacy_LLC");
assert.equal(safePart("???"), "Pharmacy");
assert.equal(fileNameFor("PBM", "Example Pharmacy LLC", "5746826", "2026-01-01", "2026-06-30"), "Example_Pharmacy_LLC_5746826_PBMAudit_2026-01-01_to_2026-06-30.xlsx");
assert.equal(fileNameFor("INTERNAL", "Example Pharmacy LLC", "5746826", "2026-01-01", "2026-06-30", 2), "Example_Pharmacy_LLC_InternalAudit_2026-01-01_to_2026-06-30_v2.xlsx");
assert.equal(pbmSubject("Example Pharmacy LLC", "5746826"), "Example Pharmacy LLC Audit – NCPDP #5746826");
assert.deepEqual(presetRange("current-month", "2026-10-10"), { start: "2026-10-01", end: "2026-10-31" });
assert.deepEqual(presetRange("previous-month", "2026-01-15"), { start: "2025-12-01", end: "2025-12-31" });
assert.deepEqual(presetRange("previous-month", "2026-03-15"), { start: "2026-02-01", end: "2026-02-28" });
assert.deepEqual(presetRange("current-quarter", "2026-10-10"), { start: "2026-10-01", end: "2026-12-31" });
assert.deepEqual(presetRange("previous-quarter", "2026-02-10"), { start: "2025-10-01", end: "2025-12-31" });
assert.deepEqual(presetRange("previous-quarter", "2026-10-10"), { start: "2026-07-01", end: "2026-09-30" });
assert.deepEqual(presetRange("current-year", "2026-10-10"), { start: "2026-01-01", end: "2026-12-31" });
assert.deepEqual(presetRange("previous-year", "2026-10-10"), { start: "2025-01-01", end: "2025-12-31" });
assert.equal(usDate("2026-01-31"), "01/31/2026");


// ---- regulatory (phase 2) ----------------------------------------------------------------------------------------
{
  const info = { name: "Example Pharmacy LLC", ncpdp: "5746826", address: "1 Main St\nDallas, TX 75001" };
  const plain = buildRows("REGULATORY", lines, info, { includePharmacy: false });
  assert.deepEqual(plain.columns.map((c) => c.key), ["type", "date", "invoiceNumber", "ndc", "productName", "productDescription", "quantity", "unitPrice", "lineTotal", "shipping", "discount"]);
  assert.ok(plain.rows.every((r) => !("pharmacyName" in r) && !("ncpdp" in r) && !("pharmacyAddress" in r)), "the pharmacy is not named unless chosen");
  assert.equal(plain.rows[0].unitPrice, 199.5);
  assert.equal(plain.rows[0].shipping, 25);
  assert.equal(plain.columns.find((c) => c.key === "discount")?.header, "Financial Adjustments / Discount");
  const named = buildRows("REGULATORY", lines, info, { includePharmacy: true });
  assert.deepEqual(named.columns.map((c) => c.key).slice(0, 6), ["type", "date", "invoiceNumber", "pharmacyName", "ncpdp", "pharmacyAddress"]);
  assert.equal(named.rows[0].pharmacyAddress, "1 Main St\nDallas, TX 75001");
  // a PBM file is still the same eight columns and never gets an address
  assert.ok(!columnsFor("PBM", { includePharmacy: true }).some((c) => c.key === "pharmacyAddress"));
  assert.ok(!pbm.rows.some((r) => "pharmacyAddress" in r));
  // file name: the case number stands in for the pharmacy unless the pharmacy is named
  assert.equal(fileNameFor("REGULATORY", "Example Pharmacy LLC", "5746826", "2026-01-01", "2026-06-30", 1, { includePharmacy: false, caseNumber: "AUD-2026-00004" }), "AUD-2026-00004_RegulatoryAudit_2026-01-01_to_2026-06-30.xlsx");
  assert.equal(fileNameFor("REGULATORY", "Example Pharmacy LLC", "5746826", "2026-01-01", "2026-06-30", 2, { includePharmacy: true, caseNumber: "AUD-2026-00004" }), "Example_Pharmacy_LLC_RegulatoryAudit_2026-01-01_to_2026-06-30_v2.xlsx");
  // blockers: kind of regulator, who they are, and the device answer
  const base = { type: "REGULATORY" as const, pharmacyName: "Example Pharmacy LLC", ncpdp: null, startDate: "2026-01-01", endDate: "2026-06-30", deviceAnswer: "YES" as const };
  assert.equal(blockers({ ...base, subtype: "STATE_BOARD", agency: "TX Board of Pharmacy" }).length, 0);
  assert.ok(blockers({ ...base, subtype: null, agency: "TX Board" }).some((b) => /kind of regulator/.test(b)));
  assert.ok(blockers({ ...base, subtype: "FEDERAL", agency: null }).some((b) => /who the regulator is/.test(b)));
  assert.ok(blockers({ ...base, deviceAnswer: "UNCLEAR", subtype: "FEDERAL", agency: "FDA" }).some((b) => /Confirm with the auditor/.test(b)));
  // the email subject leaves the pharmacy out unless it is named in the file
  assert.equal(regulatorySubject({ caseNumber: "AUD-2026-00004", agency: "TX Board of Pharmacy", reference: "R-77", pharmacyName: "Example Pharmacy LLC", includePharmacy: false, start: null, end: null }), "TX Board of Pharmacy records request – Ref R-77 – AUD-2026-00004");
  assert.ok(regulatorySubject({ caseNumber: "AUD-2026-00004", agency: null, reference: null, pharmacyName: "Example Pharmacy LLC", includePharmacy: true, start: null, end: null }).includes("Example Pharmacy LLC"));
}
console.log("audit-rules: all passed");
