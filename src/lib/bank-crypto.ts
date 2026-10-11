// Encryption for direct-deposit details (AES-256-GCM). Its own key, separate from the mailbox and connector keys: BANK_DATA_KEY if it is set
// (recommended: set a long random value in the hosting settings), otherwise derived from AUTH_SECRET under a different label. Each value is
// bound to the company and the record it belongs to (the "associated data"), so a stored value copied onto another record, or another
// company's, can't be read. Changing the key makes old values unreadable, which is the safe outcome.
//
// Never log, return or put in an email, audit note or URL anything this decrypts.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function secret(): string {
  const s = process.env.BANK_DATA_KEY || process.env.AUTH_SECRET;
  if (!s) throw new Error("No secret is configured for bank details.");
  return s;
}
const key = () => createHash("sha256").update("bank-data:" + secret()).digest();
const b64 = (b: Buffer) => b.toString("base64url");

/** `aad` ties the value to its owner, for example `${organizationId}|${requestId}`. */
export function encryptBank(plain: string, aad: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  c.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["b1", b64(iv), b64(c.getAuthTag()), b64(ct)].join(".");
}

/** The original text, or null when it can't be read (wrong key, wrong owner, damaged). Never throws. */
export function decryptBank(enc: string, aad: string): string | null {
  try {
    const [v, iv, tag, ct] = enc.split(".");
    if (v !== "b1" || !iv || !tag || !ct) return null;
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAAD(Buffer.from(aad, "utf8"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
