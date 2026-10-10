// Encryption for the saved mailbox permission, and the signed "state" that carries a Google sign-in through its round trip.
// The key comes from EMAIL_TOKEN_KEY, or is derived from AUTH_SECRET so no extra setup is needed. Changing the secret
// makes old tokens unreadable; the connection then shows "needs reconnect", which is the safe outcome.

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function secret(): string {
  const s = process.env.EMAIL_TOKEN_KEY || process.env.AUTH_SECRET;
  if (!s) throw new Error("No secret is configured for the email connector.");
  return s;
}
const key = () => createHash("sha256").update("email-connector:" + secret()).digest();
const b64 = (b: Buffer) => b.toString("base64url");

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", b64(iv), b64(c.getAuthTag()), b64(ct)].join(".");
}

/** The original token, or null when it can't be read (wrong key, damaged). Never throws. */
export function decryptToken(enc: string): string | null {
  try {
    const [v, iv, tag, ct] = enc.split(".");
    if (v !== "v1" || !iv || !tag || !ct) return null;
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** o = company, u = person, n = one-time code; m = the department mailbox being connected (empty for the company's main email). */
export type OAuthState = { o: string; u: string; n: string; exp: number; m?: string; /** The notice version the person accepted (QuickBooks). */ a?: string };
const sign = (payload: string) => createHmac("sha256", key()).update("state:" + payload).digest("base64url");

export function makeState(s: Omit<OAuthState, "exp">, now = Date.now(), ttlMs = 10 * 60 * 1000): string {
  const payload = Buffer.from(JSON.stringify({ ...s, exp: now + ttlMs })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The state if it is genuine and not expired, else null. */
export function readState(raw: string | null | undefined, now = Date.now()): OAuthState | null {
  try {
    const [payload, sig] = String(raw ?? "").split(".");
    if (!payload || !sig) return null;
    const want = Buffer.from(sign(payload));
    const got = Buffer.from(sig);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    if (typeof s.o !== "string" || typeof s.u !== "string" || typeof s.n !== "string" || typeof s.exp !== "number" || s.exp < now) return null;
    if (s.m !== undefined && typeof s.m !== "string") return null;
    if (s.a !== undefined && typeof s.a !== "string") return null;
    return s;
  } catch {
    return null;
  }
}

export const newNonce = () => randomBytes(16).toString("base64url");
