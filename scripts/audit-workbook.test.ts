import assert from "node:assert/strict";
import { buildRows, type SourceLine } from "../src/lib/audit-rules";
import { buildAuditWorkbook, readWorkbookText } from "../src/lib/audit-workbook";
import JSZip from "jszip";

const line = (o: Partial<SourceLine> & { lineId: string; invoiceId: string }): SourceLine => ({
  invoiceNumber: "INV-1001", date: "2026-03-05", position: 0, productId: "p1", productKey: "k1", productName: "Dexcom G7 Sensor", ndc: "08627-0016-01",
  packageDescription: "10-Day", quantity: 3, unitPrice: 199.5, invoiceShipping: 25.75, invoiceDiscount: 10.25, ...o,
});
const lines = [line({ lineId: "1", invoiceId: "i1" }), line({ lineId: "2", invoiceId: "i1", position: 1, productName: "OneTouch Ultra", ndc: "53885-0245-50", packageDescription: "50ct", unitPrice: 412.37, quantity: 2 })];
const info = { caseNumber: "AUD-2026-00001", pharmacyName: "Example Pharmacy LLC", ncpdp: "5746826", start: "2026-01-01", end: "2026-06-30", auditor: "A. Auditor", requestingOrganization: "ACME PBM", generatedOn: "2026-10-10", generatedBy: "Pat Staff" };

(async () => {
  // PBM file: no money anywhere, in any sheet, in the raw XML either
  const pbm = buildRows("PBM", lines, { name: "Example Pharmacy LLC", ncpdp: "5746826" });
  const buf = await buildAuditWorkbook({ ...info, type: "PBM" }, pbm.columns, pbm.rows);
  const back = await readWorkbookText(buf);
  assert.equal(back.hiddenSheets, 0);
  assert.deepEqual(back.sheets.map((s) => s.name), ["AUDIT INFORMATION", "PURCHASE RECORDS"]);
  const text = JSON.stringify(back.sheets);
  for (const bad of ["199.5", "412.37", "25.75", "10.25", "Price", "Shipping", "Discount", "Total", "$"]) assert.ok(!text.includes(bad), `PBM file contains ${bad}`);
  const zip = await JSZip.loadAsync(buf);
  for (const name of Object.keys(zip.files)) {
    if (zip.files[name].dir) continue;
    const xml = await zip.files[name].async("string");
    for (const bad of ["199.5", "412.37", "25.75", "10.25", "Price Per Unit", "Shipping Cost"]) assert.ok(!xml.includes(bad), `${name} contains ${bad}`);
  }
  const rec = back.sheets[1].rows;
  assert.deepEqual(rec[0], ["Type", "Date", "Invoice Number", "NDC / NRC", "Pharmacy Name", "Product Name / Item", "Product Description / Box Count / Device Duration", "Quantity Sold"]);
  assert.deepEqual(rec[1], ["Invoice", "2026-03-05", "INV-1001", "08627-0016-01", "Example Pharmacy LLC", "Dexcom G7 Sensor", "10-Day", 3]);
  assert.equal(rec.length, 3);
  assert.ok(JSON.stringify(back.sheets[0].rows).includes("5746826"));

  // a PBM workbook refuses money columns outright
  const internal = buildRows("INTERNAL", lines, { name: "Example Pharmacy LLC", ncpdp: "5746826" });
  await assert.rejects(() => buildAuditWorkbook({ ...info, type: "PBM" }, internal.columns, internal.rows), /can never contain/);

  // internal file: prices, shipping and discount are there as numbers
  const ib = await buildAuditWorkbook({ ...info, type: "INTERNAL" }, internal.columns, internal.rows);
  const iback = await readWorkbookText(ib);
  const ir = iback.sheets[1].rows;
  assert.deepEqual(ir[0].slice(0, 4), ["Invoice Number", "Date", "NDC / NRC", "Product Name / Item"]);
  assert.ok(ir[0].includes("Price Per Unit") && ir[0].includes("Shipping Cost"));
  const hdr = ir[0] as string[];
  assert.equal(ir[1][hdr.indexOf("Price Per Unit")], 199.5);
  assert.equal(ir[1][hdr.indexOf("Shipping Cost")], 25.75);
  assert.equal(ir[2][hdr.indexOf("Price Per Unit")], 412.37);
  console.log("audit-workbook: all passed");
})().catch((e) => { console.error(e); process.exit(1); });
