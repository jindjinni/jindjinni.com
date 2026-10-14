import assert from "node:assert/strict";
import { DEFAULT_LABEL_SIZE, LABEL_SIZES, isLabelSize, labelFileType, labelSizeOf, labelSizeShort, parseLabelSize } from "../src/lib/label-sizes";

// Shippo's own tokens (docs.goshippo.com, Shipping label sizes)
assert.equal(labelFileType("4x6"), "PDF_4x6");
assert.equal(labelFileType("4x8"), "PDF_4x8");
assert.equal(labelFileType("a6"), "PDF_A6");
assert.equal(labelFileType("2.3x7.5"), "PDF_2.3x7.5");
assert.equal(labelFileType("letter"), "PDF");
// the default keeps today's full-page PDF
assert.equal(DEFAULT_LABEL_SIZE, "letter");
assert.equal(labelFileType(undefined), "PDF");
assert.equal(labelFileType("nonsense"), "PDF");
// parsing never invents a size
assert.equal(parseLabelSize("4x6"), "4x6");
assert.equal(parseLabelSize("PDF_4x6"), "letter");
assert.equal(parseLabelSize(undefined, "4x6"), "4x6");
assert.equal(parseLabelSize("", "4x8"), "4x8");
assert.equal(parseLabelSize("bad", "bad"), "letter");
assert.equal(parseLabelSize(null, null), "letter");
assert.ok(isLabelSize("a6") && !isLabelSize("A6") && !isLabelSize(4));
// every size has a name, a plain note and a unique key/token
assert.equal(new Set(LABEL_SIZES.map((s) => s.key)).size, LABEL_SIZES.length);
assert.equal(new Set(LABEL_SIZES.map((s) => s.token)).size, LABEL_SIZES.length);
for (const s of LABEL_SIZES) assert.ok(s.name.length > 3 && s.fits.length > 20);
assert.equal(labelSizeShort("4x6"), "4 × 6 in");
assert.equal(labelSizeShort("letter"), "Full page, 8.5 × 11 in");
assert.equal(labelSizeOf("4x6").key, "4x6");
console.log("label-sizes ok");

// buying: without a size the transaction call is exactly what Purchasing always made (no second argument); with one, Shippo's token is passed
import { buyLabels } from "../src/lib/shipping-labels";
(async () => {
  const calls: unknown[][] = [];
  const deps = {
    createShipment: async () => ({ object_id: "shp", status: "SUCCESS", rates: [] }) as never,
    pickRate: () => ({ object_id: "rate1", amount: "9.10" }) as never,
    createTransaction: async (...a: unknown[]) => { calls.push(a); return { object_id: "tx", status: "SUCCESS", label_url: "https://x/1.pdf", tracking_number: "1Z1" } as never; },
  };
  const base = { addressFrom: {} as never, addressTo: {} as never, parcel: { lengthIn: 1, widthIn: 1, heightIn: 1, weightLb: 1 } };
  await buyLabels(deps, "UPS_GROUND", 1, base);
  await buyLabels(deps, "UPS_GROUND", 1, base, labelFileType("4x6"));
  assert.deepEqual(calls, [["rate1"], ["rate1", "PDF_4x6"]]);
  console.log("label-sizes buy ok");
})();
