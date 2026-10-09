import assert from "node:assert/strict";
import { qrMatrix, qrSvg } from "../src/lib/qr";

// Structure checks (the picture was also decoded with a real QR reader while building; see docs).
const m = qrMatrix("hello")!;
assert.equal(m.length, 21, "version 1 is 21 squares wide");
// finder pattern top-left: 7x7 ring with a 3x3 core
for (let i = 0; i < 7; i++) { assert.equal(m[0][i], true); assert.equal(m[6][i], true); assert.equal(m[i][0], true); assert.equal(m[i][6], true); }
assert.equal(m[1][1], false); assert.equal(m[3][3], true);
// timing pattern alternates
for (let i = 8; i < 13; i++) assert.equal(m[6][i], i % 2 === 0);
// always-dark module
assert.equal(m[m.length - 8][8], true);
// sizes grow with the text, and too-long text is refused
assert.equal(qrMatrix("A".repeat(106))!.length, 41);
assert.equal(qrMatrix("A".repeat(213))!.length, 57);
assert.equal(qrMatrix("A".repeat(214)), null);
assert.match(qrSvg("otpauth://totp/x?secret=ABC")!, /^<svg [^>]*viewBox="0 0 \d+ \d+"/);
assert.equal(JSON.stringify(qrMatrix("same")), JSON.stringify(qrMatrix("same")), "deterministic");
console.log("qr tests passed");
