import assert from "node:assert/strict";
import { allocateTake, buildLines, type StockLayer } from "../src/lib/inventory-rules";
import { availability, buildStockMap, shortfalls } from "../src/lib/sales-rules";
import { expiryDisplay } from "../src/lib/expiry-range-rules";

// how an expiration prints
assert.equal(expiryDisplay("2027-08-31", "2028-06-30"), "8/2027 – 6/2028");
assert.equal(expiryDisplay("2027-08-31", null), "8/2027");
assert.equal(expiryDisplay("2028-08-15", null), "8/15/2028");
assert.equal(expiryDisplay(null, null), "");

const TODAY = "2026-10-14";
const layer = (expiry: string | null, expiryEnd: string | null, quantity: number, lot = "L"): StockLayer => ({
  source: "MANUAL", refId: "r", productKey: "p1", productId: "p1", productName: "Pods", brand: "Omnipod", condition: "Mint", expiry, expiryEnd, lot, quantity, unitCost: null, day: TODAY,
});
const layers = [layer("2027-08-31", "2028-06-30", 20, "A"), layer("2027-05-31", "2028-11-30", 7, "B"), layer("2027-08-31", null, 3, "C"), layer("2028-08-15", null, 4, "D")];
const ranges = [{ label: "7+ months", minMonths: 7, maxMonths: null }];

// exact group keys name a month or a month range, and the sale takes only from that layer
const take = (groupKey: string | null, quantity: number) => allocateTake(layers, { productKey: "p1", condition: "Mint", groupKey, quantity }, TODAY, ranges);
let r = take("x:2027-08|2028-06", 15);
assert.ok(r.ok && r.takes.length === 1 && r.takes[0].lot === "A" && r.takes[0].quantity === 15, "takes from the 8/2027-6/2028 range only");
r = take("x:2027-08|2028-06", 21);
assert.ok(!r.ok && r.available === 20, "can't take more than that range holds");
r = take("x:2027-08", 3);
assert.ok(r.ok && r.takes[0].lot === "C", "a single month is its own group, not merged with the range");
r = take(null, 10);
assert.ok(r.ok && r.takes[0].lot === "B", "no group: earliest first");

// the stock map carries the exact groups and availability uses them
const exact = buildLines(layers, TODAY, ranges, new Map(), { groupBy: "range" });
const lines = buildLines(layers, TODAY, ranges, new Map());
const map = buildStockMap(lines, exact);
const cond = map.p1.conditions.mint;
assert.equal(cond.onHand, 34);
assert.deepEqual(cond.exact.map((g) => [g.key, g.onHand]), [["x:2027-05|2028-11", 7], ["x:2027-08", 3], ["x:2027-08|2028-06", 20], ["x:2028-08", 4]]);
assert.deepEqual(availability(map, {}, "p1", "Mint", "x:2027-08|2028-06"), { onHand: 20, held: 0, available: 20 });
// a draft holding 12 of that range leaves 8 of it, and the pile as a whole 22
const held = { "p1|mint|x:2027-08|2028-06": 12 };
assert.deepEqual(availability(map, held, "p1", "Mint", "x:2027-08|2028-06"), { onHand: 20, held: 12, available: 8 });
assert.equal(availability(map, held, "p1", "Mint", null).available, 22);
// asking for more than the range has left is a shortfall even though the pile has plenty
const sf = shortfalls(map, held, [{ productKey: "p1", productName: "Pods", condition: "Mint", groupKey: "x:2027-08|2028-06", quantity: 9 }]);
assert.equal(sf.length, 1);
assert.equal(sf[0].available, 8);
// units with no date can't be picked by date but are still in the pile
const noDate = buildStockMap(buildLines([...layers, layer(null, null, 5, "N")], TODAY, ranges, new Map()), buildLines([...layers, layer(null, null, 5, "N")], TODAY, ranges, new Map(), { groupBy: "range" }));
assert.equal(noDate.p1.conditions.mint.onHand, 39);
assert.equal(noDate.p1.conditions.mint.exact.length, 4);

console.log("stock-picker-rules ok");
