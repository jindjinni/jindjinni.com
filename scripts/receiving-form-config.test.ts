import assert from "node:assert/strict";
import { cleanFormConfig, fieldHidden, fieldOptional, photoHidden, serializeFormConfig, STANDARD_FORM } from "../src/lib/receiving-form-config";
import { computeMissingInfo, type ShipmentFacts } from "../src/lib/receiving-rules";

// reading what was saved: junk is ignored
assert.deepEqual(cleanFormConfig(null), STANDARD_FORM);
assert.deepEqual(cleanFormConfig("not json"), STANDARD_FORM);
assert.deepEqual(cleanFormConfig({ hiddenPhotos: ["SHIPPING_LABEL", "ITEM_PRODUCT", "PAYMENT_CONFIRMATION", 5], hiddenFields: ["carrier", "trackingNumber"], optional: ["receivingNotes", "receivedBy"] }),
  { hiddenPhotos: ["SHIPPING_LABEL"], hiddenFields: ["carrier"], optional: ["receivingNotes"], hiddenPicks: [], extraPicks: {} });
// the per-product photos and the accounts documents can never be hidden
assert.equal(cleanFormConfig({ hiddenPhotos: ["ITEM_DAMAGE", "REVISED_INVOICE", "PAYMENT_CONFIRMATION"] }).hiddenPhotos.length, 0);
// the standard form stores nothing
assert.equal(serializeFormConfig(STANDARD_FORM), null);
assert.equal(serializeFormConfig({ ...STANDARD_FORM, hiddenPhotos: ["SHIPPING_LABEL"] }), '{"hiddenPhotos":["SHIPPING_LABEL"],"hiddenFields":[],"optional":[]}');
assert.deepEqual(cleanFormConfig(serializeFormConfig({ ...STANDARD_FORM, hiddenPhotos: ["DAMAGE"], hiddenFields: ["doubleBoxed"], optional: ["quantityMatches"] })), { ...STANDARD_FORM, hiddenPhotos: ["DAMAGE"], hiddenFields: ["doubleBoxed"], optional: ["quantityMatches"] });
assert.equal(photoHidden(null, "SHIPPING_LABEL"), false);
assert.equal(photoHidden({ ...STANDARD_FORM, hiddenPhotos: ["SHIPPING_LABEL"] }, "SHIPPING_LABEL"), true);
assert.equal(fieldHidden({ ...STANDARD_FORM, hiddenFields: ["carrier"] }, "carrier"), true);
assert.equal(fieldOptional(undefined, "receivingNotes"), false);

// what a shipment still needs, with and without the company's settings
const empty = { trackingNumber: "1Z", receivedAt: "2026-10-12T10:00", receivedByUserId: "u1" } as unknown as ShipmentFacts;
const std = computeMissingInfo(empty, {}, []);
assert.ok(std.includes("Photo - Shipping Label") && std.includes("Receiving Notes") && std.includes("Overall Packaging Condition") && std.includes("Does Quantity Match What Was Quoted?") && std.includes("Adjustment Needed?"));
const cfg = { hiddenPhotos: ["SHIPPING_LABEL", "PACKAGE_AS_OPENED"], hiddenFields: [], optional: ["receivingNotes", "quantityMatches"] } as const;
const custom = computeMissingInfo(empty, {}, [], { ...STANDARD_FORM, hiddenPhotos: [...cfg.hiddenPhotos], optional: [...cfg.optional] });
assert.ok(!custom.includes("Photo - Shipping Label") && !custom.includes("Photo - Package As Opened"));
assert.ok(!custom.includes("Receiving Notes") && !custom.includes("Does Quantity Match What Was Quoted?"));
// everything else is still asked for
assert.ok(custom.includes("Photo - Unopened Package") && custom.includes("Photo - Complete Contents") && custom.includes("Overall Packaging Condition") && custom.includes("Adjustment Needed?"));
assert.ok(custom.includes("At least one product line in Verify What Arrived"));
// hiding the damage photo stops asking for it when there is damage, but the notes are still required
const dmg = { ...empty, externalDamage: "YES" } as unknown as ShipmentFacts;
assert.ok(computeMissingInfo(dmg, {}, []).includes("Damage Photos"));
const dmgCfg = computeMissingInfo(dmg, {}, [], { ...STANDARD_FORM, hiddenPhotos: ["DAMAGE"] });
assert.ok(!dmgCfg.includes("Damage Photos") && dmgCfg.includes("Damage Notes"));
console.log("receiving-form-config ok");
