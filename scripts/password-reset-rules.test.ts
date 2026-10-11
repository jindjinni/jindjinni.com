import assert from "node:assert/strict";
import {
  PASSWORD_MIN, RESET_COOLDOWN_SEC, RESET_VALID_MINUTES, cooldownOver, emailCheck, hashResetToken, looksLikeResetToken, looksLikeStaffUsername,
  newResetToken, normalizeResetEmail, passwordProblem, resetEmailContent, resetStatus, resetUrl,
} from "../src/lib/password-reset-rules";

// email check
assert.equal(normalizeResetEmail("  Ann@Example.COM "), "ann@example.com");
assert.deepEqual(emailCheck("ann@example.com"), { ok: true });
assert.equal(emailCheck("").ok, false);
assert.equal(emailCheck("not-an-email").ok, false);
assert.equal(emailCheck("a b@c.com").ok, false);
const staff = emailCheck("maria_acme@staff.invalid");
assert.equal(staff.ok, false);
assert.ok(!staff.ok && staff.staff && /admin/i.test(staff.error));
assert.equal(looksLikeStaffUsername("maria_acme"), true);
assert.equal(looksLikeStaffUsername("a@b.com"), false);

// passwords
assert.equal(passwordProblem("longenough1", "longenough1"), null);
assert.ok(passwordProblem("short", "short")?.includes(String(PASSWORD_MIN)));
assert.ok(passwordProblem("longenough1", "different11")?.includes("match"));
assert.ok(passwordProblem("x".repeat(73), "x".repeat(73))?.includes("too long"));
assert.equal(passwordProblem("x".repeat(72), "x".repeat(72)), null);
assert.ok(passwordProblem("é".repeat(40), "é".repeat(40))?.includes("too long")); // 80 bytes

// tokens
const now = Date.parse("2026-10-11T12:00:00Z");
const a = newResetToken(now);
const b = newResetToken(now);
assert.notEqual(a.token, b.token);
assert.ok(looksLikeResetToken(a.token));
assert.equal(a.tokenHash, hashResetToken(a.token));
assert.notEqual(a.tokenHash, a.token);
assert.equal(a.tokenHash.length, 64);
assert.equal(Date.parse(a.expiresAt) - now, RESET_VALID_MINUTES * 60000);
assert.equal(looksLikeResetToken("short"), false);
assert.equal(looksLikeResetToken(a.token + "!"), false);
assert.equal(looksLikeResetToken("../".repeat(15)), false);

// status
assert.equal(resetStatus(null, now), "invalid");
assert.equal(resetStatus({ expiresAt: a.expiresAt, usedAt: null }, now), "valid");
assert.equal(resetStatus({ expiresAt: a.expiresAt, usedAt: "2026-10-11T12:01:00Z" }, now), "used");
assert.equal(resetStatus({ expiresAt: a.expiresAt, usedAt: null }, now + RESET_VALID_MINUTES * 60000), "expired");
assert.equal(resetStatus({ expiresAt: a.expiresAt, usedAt: null }, now + RESET_VALID_MINUTES * 60000 - 1), "valid");
assert.equal(resetStatus({ expiresAt: "garbage", usedAt: null }, now), "expired");

// cooldown
assert.equal(cooldownOver(null, now), true);
assert.equal(cooldownOver(new Date(now - 10_000).toISOString(), now), false);
assert.equal(cooldownOver(new Date(now - RESET_COOLDOWN_SEC * 1000).toISOString(), now), true);

// link + email
assert.equal(resetUrl("https://jindjinni.com/", a.token), `https://jindjinni.com/reset-password/${a.token}`);
const mail = resetEmailContent(resetUrl("https://jindjinni.com", a.token));
assert.ok(mail.text.includes(a.token) && mail.html.includes(a.token));
assert.ok(mail.text.includes("60 minutes"));
assert.ok(/ignore this email/.test(mail.text));

console.log("password-reset-rules: ok");
