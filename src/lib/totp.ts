// Two-step sign-in codes (the 6-digit numbers an authenticator app shows), made with Node's own crypto -- no extra packages.
// RFC 6238 (TOTP) on top of RFC 4226 (HOTP), SHA-1, 6 digits, 30-second steps: what Google Authenticator, Authy, 1Password and
// Microsoft Authenticator all expect. Pure helpers here; the secret is stored encrypted (see actions/two-step.ts).

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const STEP_SECONDS = 30;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** null when the text is not valid base32. Spaces, dashes and case are ignored. */
export function base32Decode(text: string): Buffer | null {
  const clean = text.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
  if (!clean) return null;
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh 160-bit secret, as the base32 text people type into an authenticator app. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  msg.writeUInt32BE(counter >>> 0, 4);
  const h = createHmac("sha1", secret).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}

export const stepOf = (nowMs: number): number => Math.floor(nowMs / 1000 / STEP_SECONDS);

/** The code an authenticator shows for this secret at this moment (used by tests and the check below). */
export function totpNow(secretB32: string, nowMs = Date.now()): string {
  const key = base32Decode(secretB32);
  if (!key) throw new Error("Bad secret");
  return hotp(key, stepOf(nowMs));
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * The time step this code matches, or null. Accepts the previous, current and next step (clock drift), and refuses any
 * step at or before `lastStep` so a code that was already used -- or one older than the last used -- can never work twice.
 */
export function checkTotp(secretB32: string, code: string, nowMs: number, lastStep: number | null | undefined): number | null {
  const digits = String(code ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(digits)) return null;
  const key = base32Decode(secretB32);
  if (!key) return null;
  const now = stepOf(nowMs);
  let found: number | null = null;
  for (const step of [now - 1, now, now + 1]) {
    if (step <= (lastStep ?? -1)) continue;
    if (same(hotp(key, step), digits)) found = step;
  }
  return found;
}

/** The address an authenticator app reads (shown as a QR picture, and as the typed key for people who can't scan). */
export function otpauthUri(issuer: string, account: string, secretB32: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

// ---- Backup codes: one-time codes for a lost phone ---------------------------------------------------------------------
const BACKUP_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no look-alikes (i, l, o, 0, 1)

export function newBackupCodes(count = 10): string[] {
  const out: string[] = [];
  while (out.length < count) {
    const bytes = randomBytes(10);
    let s = "";
    for (const b of bytes) s += BACKUP_ALPHABET[b % BACKUP_ALPHABET.length];
    out.push(`${s.slice(0, 5)}-${s.slice(5)}`);
  }
  return out;
}

/** What a typed backup code is compared as: lower case, letters and digits only. */
export const normalizeBackupCode = (s: string) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const looksLikeBackupCode = (s: string) => /^[a-z0-9]{10}$/.test(normalizeBackupCode(s));
export const hashBackupCode = (s: string) => createHash("sha256").update("backup:" + normalizeBackupCode(s)).digest("hex");

/** The list left after using `code`, or null when it matches none (each code works once). */
export function consumeBackupCode(hashes: string[], code: string): string[] | null {
  if (!looksLikeBackupCode(code)) return null;
  const h = hashHex(code);
  const i = hashes.findIndex((x) => same(x, h));
  if (i < 0) return null;
  return hashes.filter((_, j) => j !== i);
}
const hashHex = hashBackupCode;

export function parseHashes(raw: string | null | undefined): string[] {
  try {
    const v: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
