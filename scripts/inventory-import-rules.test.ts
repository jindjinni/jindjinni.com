// Inventory -> Import Stock: reading a spreadsheet of opening stock.
import assert from "node:assert/strict";
import { parseQuantity, parseMoney, parseStockDate, guessStockColumns, readStockRows, importFingerprint, templateCsv, MAX_IMPORT_ROWS, type ImportProduct } from "../src/lib/inventory-import-rules";
import { parseSpreadsheetFile } from "../src/lib/spreadsheet-import";

// quantity: whole numbers only
assert.equal(parseQuantity("50").value, 50);
assert.equal(parseQuantity(" 1,200 ").value, 1200);
assert.equal(parseQuantity("12.0").value, 12);
for (const bad of ["", "0", "-3", "2.5", "ten", "1000001"]) assert.ok(parseQuantity(bad).error, bad);

// money: dollars, never guessed
assert.equal(parseMoney("$12.50", "x").value, 12.5);
assert.equal(parseMoney("", "x").value, null);
assert.ok(!parseMoney("", "x").error);
assert.ok(parseMoney("12,5,0x", "the cost").error);
assert.ok(parseMoney("-4", "the cost").error);

// dates, in the shapes people type
const d = (s: string) => parseStockDate(s).date;
assert.equal(d("2027-08-31"), "2027-08-31");
assert.equal(d("2027-02"), "2027-02-28");
assert.equal(d("2028-02"), "2028-02-29");
assert.equal(d("5/31/2027"), "2027-05-31");
assert.equal(d("5/31/27"), "2027-05-31");
assert.equal(d("05/2027"), "2027-05-31");
assert.equal(d("05/27"), "2027-05-31");
assert.equal(d("May 2027"), "2027-05-31");
assert.equal(d("May 31, 2027"), "2027-05-31");
assert.equal(d("31 May 2027"), "2027-05-31");
assert.equal(d("Sept 2027"), "2027-09-30");
assert.equal(d("46630"), "2027-08-31", "an Excel date number");
assert.equal(d(""), null);
assert.ok(!parseStockDate("").error, "empty is fine");
for (const bad of ["2027-13-01", "2027-02-30", "13/2027", "soon", "2027-8-99", "1999-01-01", "Foo 2027"]) assert.ok(parseStockDate(bad).error, bad);

// columns are found by the headings people use
const g = guessStockColumns(["Item Name", "Qty", "Exp Date", "Lot #", "Unit Cost", "Grade", "Est. Low", "Highest Price", "Notes"]);
assert.equal(g.product, "Item Name");
assert.equal(g.quantity, "Qty");
assert.equal(g.expiration, "Exp Date");
assert.equal(g.lot, "Lot #");
assert.equal(g.cost, "Unit Cost");
assert.equal(g.condition, "Grade");
assert.equal(g.estLow, "Est. Low");
assert.equal(g.estHigh, "Highest Price");
assert.equal(g.brand, null);

// rows
const products: ImportProduct[] = [
  { id: "p1", name: "Dexcom G7 Sensor", brand: "Dexcom", noExpiration: false },
  { id: "p2", name: "Freestyle Libre 3 Plus Sensor", brand: "Libre", noExpiration: false },
  { id: "p3", name: "Omnipod 5 Pods", brand: "Omnipod", noExpiration: false },
  { id: "p4", name: "Glucose Meter", brand: "Other", noExpiration: true },
  { id: "p5", name: "Test Strips 50ct", brand: "Other", noExpiration: false },
  { id: "p6", name: "Test Strips 100ct", brand: "Other", noExpiration: false },
];
const conditions = ["Mint", "Dinged", "Minor Damage", "Damaged"];
const opts = { today: "2026-10-13", conditions, defaultCondition: "Mint" };
const csv = [
  "Product,Condition,Quantity,Expiration date,Lot number,Cost per unit,Estimated lowest price,Estimated highest price",
  "Dexcom G7 Sensor,Mint,50,2027-08-31,LOT1,12.50,14,16",        // row 2: fine
  "dexcom g7 sensor,dinged,10,05/2027,,,,",                       // row 3: fine, case differs
  "Freestyle Libre 3 Plus Sensor,,5,2025-01-31,,,,",              // row 4: blank condition (Mint assumed), already expired
  "Glucose Meter,Mint,3,2030-01-01,,,,",                          // row 5: never expires, date ignored
  "Test Strips,Mint,20,2027-01-01,,,,",                           // row 6: ambiguous -> needs a match
  "Dexcom G7 Sensor,Weird,5,2027-01-01,,,,",                      // row 7: bad condition
  "Dexcom G7 Sensor,Mint,2.5,2027-01-01,,,,",                     // row 8: bad quantity
  "Dexcom G7 Sensor,Mint,5,soon,,,,",                             // row 9: bad date
  "Dexcom G7 Sensor,Mint,5,2027-01-01,,20,30,10",                 // row 10: low above high
  "Mystery Gadget,Mint,5,2027-01-01,,,,",                         // row 11: no such product
  ",,,,,,,",                                                      // blank line
].join("\n");
const sheet = parseSpreadsheetFile(Buffer.from(csv), "stock.csv");
const r = readStockRows(sheet, guessStockColumns(sheet.headers), products, opts);
assert.equal(r.error, undefined);
const by = (n: number) => r.rows.find((x) => x.rowNo === n)!;
assert.equal(by(2).status, "ok");
assert.deepEqual([by(2).productId, by(2).condition, by(2).quantity, by(2).expiry, by(2).lot, by(2).unitCost, by(2).estLow, by(2).estHigh], ["p1", "Mint", 50, "2027-08-31", "LOT1", 12.5, 14, 16]);
assert.equal(by(3).status, "ok");
assert.equal(by(3).condition, "Dinged", "the company's own spelling of the condition");
assert.equal(by(3).expiry, "2027-05-31");
assert.equal(by(4).status, "ok");
assert.equal(by(4).condition, "Mint");
assert.ok(by(4).notes.some((n) => /Mint assumed/.test(n)) && by(4).notes.some((n) => /already passed/.test(n)));
assert.equal(by(5).expiry, null);
assert.ok(by(5).notes.some((n) => /never expires/.test(n)));
assert.equal(by(6).status, "match");
assert.equal(by(6).productId, null);
for (const n of [7, 8, 9, 10]) assert.equal(by(n).status, "problem", `row ${n}`);
assert.ok(by(7).problems[0].includes("Weird") && by(7).problems[0].includes("Mint, Dinged"));
assert.ok(by(8).problems[0].includes("whole number"));
assert.ok(by(9).problems[0].includes("soon"));
assert.ok(by(10).problems[0].includes("higher"));
assert.equal(by(11).status, "match");
assert.equal(r.counts.blank, 0, "the reader already drops empty lines");
assert.deepEqual([r.counts.ok, r.counts.match, r.counts.problem], [4, 2, 4]);
assert.equal(r.counts.units, 50 + 10 + 5 + 3);

// a row the person matched by hand becomes ok; a product that is not theirs is refused
const r2 = readStockRows(sheet, guessStockColumns(sheet.headers), products, { ...opts, matches: { "6": "p5", "11": "p-not-mine" } });
assert.equal(r2.rows.find((x) => x.rowNo === 6)!.status, "ok");
assert.equal(r2.rows.find((x) => x.rowNo === 6)!.productId, "p5");
assert.equal(r2.rows.find((x) => x.rowNo === 11)!.status, "problem");

// a brand column narrows an ambiguous name
const sheetB = parseSpreadsheetFile(Buffer.from("Product,Brand,Quantity\nSensor,Dexcom,4\n"), "b.csv");
const withBrand = readStockRows(sheetB, guessStockColumns(sheetB.headers), [...products, { id: "p9", name: "Libre Sensor", brand: "Libre", noExpiration: false }], opts);
assert.equal(withBrand.rows[0].productId, "p1");

// no condition column: the default is used silently (the page says so once); a missing needed column is an error, not a guess
const noCond = parseSpreadsheetFile(Buffer.from("Product,Quantity\nDexcom G7 Sensor,5\n"), "c.csv");
const rc = readStockRows(noCond, guessStockColumns(noCond.headers), products, { ...opts, defaultCondition: "Dinged" });
assert.equal(rc.rows[0].condition, "Dinged");
assert.equal(rc.rows[0].notes.length, 1, "only 'no expiration date'");
const noQty = parseSpreadsheetFile(Buffer.from("Product,Condition\nDexcom G7 Sensor,Mint\n"), "d.csv");
assert.match(readStockRows(noQty, guessStockColumns(noQty.headers), products, opts).error ?? "", /Quantity/);
const noProd = parseSpreadsheetFile(Buffer.from("Thing,Quantity\nx,1\n"), "e.csv");
assert.match(readStockRows(noProd, guessStockColumns(noProd.headers), products, opts).error ?? "", /Product/);
const headOnly = parseSpreadsheetFile(Buffer.from("Product,Quantity\n"), "f.csv");
assert.ok(readStockRows(headOnly, guessStockColumns(headOnly.headers), products, opts).error);
const huge = { headers: ["Product", "Quantity"], rows: Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => ({ Product: "Dexcom G7 Sensor", Quantity: "1" })) };
assert.match(readStockRows(huge, guessStockColumns(huge.headers), products, opts).error ?? "", /more than/);

// the same file always has the same fingerprint, a different file a different one
assert.equal(importFingerprint(Buffer.from("abc")), importFingerprint(Buffer.from("abc")));
assert.notEqual(importFingerprint(Buffer.from("abc")), importFingerprint(Buffer.from("abd")));
assert.match(importFingerprint(Buffer.from("abc")), /^imp_[0-9a-f]{32}$/);

// the template can be read back by the same reader
const tpl = parseSpreadsheetFile(Buffer.from(templateCsv(["Dexcom G7 Sensor", "Omnipod 5 Pods"])), "t.csv");
const rt = readStockRows(tpl, guessStockColumns(tpl.headers), products, opts);
assert.equal(rt.error, undefined);
assert.deepEqual([rt.counts.ok, rt.counts.problem, rt.counts.match], [2, 0, 0]);

console.log("inventory-import-rules ok");
