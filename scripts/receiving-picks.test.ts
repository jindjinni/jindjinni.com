// Receiving Intake Form pick lists: the standard lists, per-company hide/add, exclusive options, and the text written from the picks.
import assert from "node:assert/strict";
import { cleanFormConfig, serializeFormConfig, STANDARD_FORM } from "../src/lib/receiving-form-config";
import {
  CUSTOM_NOTE_LABEL, PICK_SECTIONS, PICK_SECTION_KEYS, cleanPicks, emptyPicks, legacyFromPicks, optionsFor, pickId, picksEmpty, serializePicks, summaryLines, togglePick,
} from "../src/lib/receiving-picks";
import { computeMissingInfo, type ShipmentFacts } from "../src/lib/receiving-rules";

// the six lists, with the wording and counts of the owner's document (the "Custom ... Note" lines are the Custom note tab)
const count = (k: string) => PICK_SECTIONS.find((s) => s.key === k)!.options.length;
assert.equal(PICK_SECTIONS.length, 6);
assert.deepEqual([count("packaging"), count("damage"), count("adjustment"), count("outcome"), count("adjOutcome"), count("warning")], [15, 14, 22, 19, 16, 7]);
for (const k of PICK_SECTION_KEYS) assert.ok(CUSTOM_NOTE_LABEL[k], k);
for (const s of PICK_SECTIONS) {
  assert.equal(new Set(s.options).size, s.options.length, `${s.key} has no repeats`);
  for (const e of s.exclusive) assert.ok(s.options.includes(e), `${s.key} exclusive "${e}" is an option`);
  assert.ok(!s.options.some((o) => /^Custom /i.test(o)), `${s.key} has no Custom option (it is the Custom note tab)`);
}
assert.ok(PICK_SECTIONS[0].options.includes("Amazon Box Used – Prohibited"));

// a company sees the standard list until it changes it
assert.equal(optionsFor("damage", STANDARD_FORM).length, 14);
const hid = { ...STANDARD_FORM, hiddenPicks: [pickId("damage", "Sticky Residue")], extraPicks: { damage: ["Box Wet", "box wet", "Water Stain"] } };
const opts = optionsFor("damage", hid).map((o) => o.label);
assert.ok(!opts.includes("Sticky Residue") && opts.includes("Box Wet") && opts.includes("Water Stain"));
assert.equal(opts.filter((o) => o.toLowerCase() === "box wet").length, 1, "an added option is not doubled");
assert.equal(optionsFor("damage", hid).find((o) => o.label === "Box Wet")?.own, true);

// the company settings keep the new parts, clean them, and store nothing when unused
assert.equal(serializeFormConfig(STANDARD_FORM), null);
const c = cleanFormConfig({ hiddenPicks: ["damage:sticky-residue", "nonsense:x", "damage:BAD CAPS", 5], extraPicks: { damage: ["  Box   Wet ", "", "x".repeat(300)], bogus: ["no"], packaging: "no" } });
assert.deepEqual(c.hiddenPicks, ["damage:sticky-residue"]);
assert.equal(c.extraPicks.damage?.[0], "Box Wet");
assert.equal(c.extraPicks.damage?.[1].length, 90);
assert.equal(c.extraPicks.packaging, undefined);
assert.deepEqual(cleanFormConfig(serializeFormConfig(c)), c);
assert.equal(serializeFormConfig({ ...STANDARD_FORM, hiddenPhotos: ["DAMAGE"] }), '{"hiddenPhotos":["DAMAGE"],"hiddenFields":[],"optional":[]}');

// ticking: exclusive options stand alone
let d: string[] = [];
d = togglePick("damage", d, "Crushed Box", true);
d = togglePick("damage", d, "Torn / Ripped Box", true);
assert.deepEqual(d, ["Crushed Box", "Torn / Ripped Box"]);
d = togglePick("damage", d, "No Damage", true);
assert.deepEqual(d, ["No Damage"]);
d = togglePick("damage", d, "Crushed Box", true);
assert.deepEqual(d, ["Crushed Box"]);
assert.deepEqual(togglePick("damage", d, "Crushed Box", false), []);
assert.deepEqual(togglePick("damage", ["Crushed Box"], "Crushed Box", true), ["Crushed Box"], "ticking twice is harmless");

// what is read back from the browser or the database
const p = cleanPicks({ damage: ["Crushed Box", "Made Up", "Crushed Box"], warning: ["No Warning Needed", "Formal Warning"], custom: { damage: "  wet corner  ", warning: 5, bogus: "x" } }, STANDARD_FORM);
assert.deepEqual(p.damage, ["Crushed Box"]);
assert.deepEqual(p.warning, ["No Warning Needed"], "an exclusive option ticked with others keeps only the first");
assert.equal(p.custom.damage, "wet corner");
assert.equal(p.custom.warning, "");
assert.deepEqual(cleanPicks("not json"), emptyPicks());
assert.deepEqual(cleanPicks(null), emptyPicks());
// a company's own option is accepted for that company only
assert.deepEqual(cleanPicks({ damage: ["Box Wet"] }, hid).damage, ["Box Wet"]);
assert.deepEqual(cleanPicks({ damage: ["Box Wet"] }, STANDARD_FORM).damage, []);
// an option the company has since hidden is still read back (old records keep their ticks)
assert.deepEqual(cleanPicks({ damage: ["Sticky Residue"] }, hid).damage, ["Sticky Residue"]);
assert.equal(serializePicks(emptyPicks()), null);
assert.ok(picksEmpty(emptyPicks()));
assert.equal(picksEmpty({ ...emptyPicks(), custom: { ...emptyPicks().custom, outcome: "x" } }), false);

// the old text fields, written from the picks
const e = legacyFromPicks(emptyPicks());
assert.deepEqual(e, { damageNotes: "", packagingIssueNotes: "", adjustmentDetails: "", receivingNotes: "" });
const full = cleanPicks({
  packaging: ["Not Double Boxed", "Recycled Box Used"], damage: ["Crushed Box"], adjustment: ["Expired – Cannot Accept"],
  outcome: ["Customer Did Not Follow Packaging Instructions – Supplies Arrived Damaged"], adjOutcome: ["Price Adjustment Required", "Up to 50% Deduction"], warning: ["Courtesy Warning"],
  custom: { damage: "corner wet", outcome: "called customer" },
});
const t = legacyFromPicks(full);
assert.equal(t.packagingIssueNotes, "Not Double Boxed; Recycled Box Used");
assert.equal(t.damageNotes, "Crushed Box. Note: corner wet");
assert.equal(t.adjustmentDetails, "Expired – Cannot Accept");
assert.equal(t.receivingNotes, "Outcome: Customer Did Not Follow Packaging Instructions – Supplies Arrived Damaged. Note: called customer\nRecommended adjustment: Price Adjustment Required; Up to 50% Deduction\nCustomer warning level: Courtesy Warning");
// a custom note alone is enough
assert.equal(legacyFromPicks(cleanPicks({ custom: { packaging: "box taped shut twice" } })).packagingIssueNotes, "box taped shut twice");
assert.deepEqual(summaryLines(full).map((l) => l.title), ["Packaging issues", "Damage noted", "Adjustment details", "Receiving outcome", "Recommended adjustment outcome", "Customer warning level"]);
assert.deepEqual(summaryLines(emptyPicks()), []);

// the existing "missing info" rules are satisfied by the written text (picks or custom note), and not by nothing
const base = { trackingNumber: "1Z", receivedAt: "2026-10-12T10:00", receivedByUserId: "u1", externalDamage: "YES", overallPackaging: "NOT_ACCEPTABLE", quantityMatches: "YES", adjustmentNeeded: "YES" } as unknown as ShipmentFacts;
const none = computeMissingInfo({ ...base, ...e }, {}, []);
assert.ok(none.includes("Damage Notes") && none.includes("Packaging Issue Notes") && none.includes("Adjustment Details") && none.includes("Receiving Notes"));
const some = computeMissingInfo({ ...base, ...t }, {}, []);
assert.ok(!some.includes("Damage Notes") && !some.includes("Packaging Issue Notes") && !some.includes("Adjustment Details") && !some.includes("Receiving Notes"));

console.log("receiving-picks.test.ts: ok");
