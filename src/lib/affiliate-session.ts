// The signed cookie that says "this person signed in to the affiliate portal". It holds only the affiliate's id and the moment it stops
// working, signed so it can't be forged or moved to someone else. The server still checks on every visit that the person is an
// approved, active affiliate. (Same idea as view-as-token.ts, with its own key so one can never be used as the other.)

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { SESSION_DAYS } from "@/lib/affiliate-portal-rules";

export type AffiliateSession = { a: string; exp: number };

function key(): Buffer {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("No secret is configured.");
  return createHash("sha256").update("affiliate-portal:" + secret).digest();
}
const sign = (payload: string) => createHmac("sha256", key()).update(payload).digest("base64url");

export function signAffiliateSession(affiliateId: string, nowMs = Date.now()): { value: string; maxAgeSec: number } {
  const t: AffiliateSession = { a: affiliateId, exp: nowMs + SESSION_DAYS * 86400000 };
  const payload = Buffer.from(JSON.stringify(t)).toString("base64url");
  return { value: `${payload}.${sign(payload)}`, maxAgeSec: SESSION_DAYS * 86400 };
}

/** The session if it is genuine and has not expired, else null. Never throws. */
export function readAffiliateSession(raw: string | null | undefined, nowMs = Date.now()): AffiliateSession | null {
  try {
    const [payload, sig] = String(raw ?? "").split(".");
    if (!payload || !sig) return null;
    const want = Buffer.from(sign(payload));
    const got = Buffer.from(sig);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    const t = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AffiliateSession;
    if (typeof t.a !== "string" || typeof t.exp !== "number" || t.exp <= nowMs) return null;
    return t;
  } catch {
    return null;
  }
}
