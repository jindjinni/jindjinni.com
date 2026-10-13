import assert from "node:assert/strict";
import { cleanManualNote, readManualTracking } from "../src/lib/tracking-manual-rules";

const ok = (n: string, c = "auto") => {
  const r = readManualTracking(n, c);
  assert.ok(r.ok, `${n}: ${!r.ok ? r.error : ""}`);
  return r as Extract<typeof r, { ok: true }>;
};

// spaces and case are cleaned, the carrier is picked from the shape of the number
assert.deepEqual(ok("1z 999 aa1 0123 4567 84"), { ok: true, trackingNumber: "1Z999AA10123456784", carrier: "UPS" });
assert.equal(ok("9400 1118 9922 3456 7890 12").carrier, "USPS");
assert.equal(ok("794644790138").carrier, "FedEx");
assert.equal(ok("ABCD12345678").carrier, "Other");
// a person's choice of carrier wins over the guess
assert.equal(ok("1Z999AA10123456784", "FedEx").carrier, "FedEx");
assert.equal(ok("1Z999AA10123456784", "ups").carrier, "UPS");
// a scanned USPS barcode (420 + ZIP + number) is reduced to the real number
assert.equal(ok("420" + "33023" + "9400111899223456789012").trackingNumber, "9400111899223456789012");
assert.equal(ok("420" + "330231234" + "9400111899223456789012").trackingNumber, "9400111899223456789012");
// dashes are dropped
assert.equal(ok("9400-1118-9922-3456-7890-12").trackingNumber, "9400111899223456789012");
// refusals are in plain words
for (const bad of ["", "   ", null, undefined]) { const r = readManualTracking(bad as string, "auto"); assert.ok(!r.ok && /Type/.test(r.error)); }
assert.ok(!readManualTracking("12345", "auto").ok);
assert.ok(!readManualTracking("A".repeat(41), "auto").ok);
assert.ok(!readManualTracking("1Z999AA1012345678#", "auto").ok);
assert.ok(!readManualTracking("1Z999AA10123456784", "DHL").ok);
// notes
assert.equal(cleanManualNote("  label from\n  pirateship  "), "label from pirateship");
assert.equal(cleanManualNote("   "), null);
assert.equal(cleanManualNote("x".repeat(300))?.length, 120);
console.log("tracking-manual-rules ok");
