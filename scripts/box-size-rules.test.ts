import assert from "node:assert/strict";
import { cleanSizeName, MAX_NAME, parseBoxSize, recentSizes, sizeKey, sizeLabel } from "../src/lib/box-size-rules";

const ok = (l: unknown, w: unknown, h: unknown) => { const r = parseBoxSize({ lengthIn: l, widthIn: w, heightIn: h }); assert.ok(r.ok); return r.ok ? r.size : null; };
assert.deepEqual(ok("25", " 21 ", 21), { lengthIn: 25, widthIn: 21, heightIn: 21 });
assert.deepEqual(ok("12.345", "8", "6.5"), { lengthIn: 12.35, widthIn: 8, heightIn: 6.5 }, "rounded to hundredths");
for (const bad of [["", 1, 1], [1, "abc", 1], [1, 1, 0], [-2, 1, 1], [61, 1, 1], [1, 1, null], [1, NaN, 1]] as const) {
  assert.equal(parseBoxSize({ lengthIn: bad[0], widthIn: bad[1], heightIn: bad[2] }).ok, false, JSON.stringify(bad));
}
assert.match((parseBoxSize({ lengthIn: 1, widthIn: "x", heightIn: 1 }) as { error: string }).error, /how wide/);
assert.match((parseBoxSize({ lengthIn: 99, widthIn: 1, heightIn: 1 }) as { error: string }).error, /60 inches/);
assert.equal(parseBoxSize({ lengthIn: 60, widthIn: 1, heightIn: 1 }).ok, true, "60 is allowed");

// same box whichever way round
assert.equal(sizeKey({ lengthIn: 25, widthIn: 21, heightIn: 21 }), sizeKey({ lengthIn: 21, widthIn: 25, heightIn: 21 }));
assert.notEqual(sizeKey({ lengthIn: 25, widthIn: 21, heightIn: 21 }), sizeKey({ lengthIn: 21, widthIn: 17, heightIn: 17 }));
assert.equal(sizeLabel({ lengthIn: 25, widthIn: 21, heightIn: 21 }), "25 × 21 × 21 in");
assert.equal(sizeLabel({ lengthIn: 12.5, widthIn: 8, heightIn: 6 }), "12.5 × 8 × 6 in");

// names
assert.deepEqual(cleanSizeName("  Medium   box "), { ok: true, name: "Medium box" });
assert.deepEqual(cleanSizeName("   "), { ok: true, name: null });
assert.deepEqual(cleanSizeName(undefined), { ok: true, name: null });
assert.equal(cleanSizeName("x".repeat(MAX_NAME + 1)).ok, false);

// earlier sizes: counted, never the weight, skipped when saved, junk ignored
const p = (l: number, w: number, h: number, wt = 5) => JSON.stringify({ lengthIn: l, widthIn: w, heightIn: h, weightLb: wt });
const list = [p(21, 17, 17), p(25, 21, 21, 9), p(21, 25, 21, 3), null, "not json", JSON.stringify({ weightLb: 4 }), p(12, 8, 6)];
const r = recentSizes(list, new Set());
assert.deepEqual(r.map((x) => [x.lengthIn, x.widthIn, x.heightIn, x.count]), [[25, 21, 21, 2], [21, 17, 17, 1], [12, 8, 6, 1]], "25x21x21 twice (any order) first, ties by recency");
assert.ok(r.every((x) => !("weightLb" in x) && !("first" in x)));
assert.deepEqual(recentSizes(list, new Set([sizeKey({ lengthIn: 21, widthIn: 21, heightIn: 25 })])).map((x) => x.count), [1, 1], "a saved or removed size isn't suggested again");
assert.equal(recentSizes(Array.from({ length: 20 }, (_, i) => p(i + 1, 2, 3)), new Set(), 6).length, 6);
assert.deepEqual(recentSizes([], new Set()), []);
console.log("box-size-rules ok");
