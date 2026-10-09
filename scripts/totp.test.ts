import assert from "node:assert/strict";
import { base32Decode, base32Encode, checkTotp, hashBackupCode, hotp, newBackupCodes, newTotpSecret, otpauthUri, totpNow, consumeBackupCode } from "../src/lib/totp";

// RFC 4226 Appendix D (secret "12345678901234567890")
const rfcKey = Buffer.from("12345678901234567890");
["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"].forEach((want, i) => assert.equal(hotp(rfcKey, i), want, `hotp ${i}`));
// RFC 6238 Appendix B (SHA-1, last 6 digits of the 8-digit values)
const rfc6238: [number, string][] = [[59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"]];
for (const [t, want] of rfc6238) assert.equal(hotp(rfcKey, Math.floor(t / 30)), want, `totp @${t}`);

// base32 round trip + known value
assert.equal(base32Encode(Buffer.from("foobar")), "MZXW6YTBOI");
assert.equal(base32Decode("mzxw 6ytb-oi")!.toString(), "foobar");
assert.equal(base32Decode("not base32!"), null);
const s = newTotpSecret();
assert.equal(s.length, 32);
assert.deepEqual(base32Decode(s), base32Decode(s.toLowerCase()));

// window, replay, garbage
const now = 1_700_000_000_000;
const code = totpNow(s, now);
const step = checkTotp(s, code, now, null)!;
assert.ok(step > 0);
assert.equal(checkTotp(s, code, now, step), null, "same step cannot be reused");
assert.equal(checkTotp(s, code, now, step + 1), null, "older than last used");
assert.equal(checkTotp(s, totpNow(s, now - 30_000), now, null) !== null, true, "previous step ok (drift)");
assert.equal(checkTotp(s, totpNow(s, now + 30_000), now, null) !== null, true, "next step ok (drift)");
assert.equal(checkTotp(s, totpNow(s, now + 90_000), now, null), null, "3 steps ahead refused");
assert.equal(checkTotp(s, "12345", now, null), null);
assert.equal(checkTotp(s, "abcdef", now, null), null);
assert.equal(checkTotp(s, code.slice(0, 3) + " " + code.slice(3), now, null), step, "spaces ignored");

// backup codes
const codes = newBackupCodes(10);
assert.equal(new Set(codes).size, 10);
for (const c of codes) assert.match(c, /^[a-z2-9]{5}-[a-z2-9]{5}$/);
const hashes = codes.map(hashBackupCode);
const left = consumeBackupCode(hashes, codes[3].toUpperCase().replace("-", " "))!;
assert.equal(left.length, 9);
assert.equal(consumeBackupCode(left, codes[3]), null, "single use");
assert.equal(consumeBackupCode(hashes, "zzzzz-zzzzz"), null);
assert.equal(consumeBackupCode(hashes, "123456"), null);

assert.match(otpauthUri("jindjinni", "a@b.com", "ABC234"), /^otpauth:\/\/totp\/jindjinni%3Aa%40b\.com\?secret=ABC234&issuer=jindjinni/);
console.log("totp tests passed");
