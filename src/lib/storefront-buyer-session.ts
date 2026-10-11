// The signed cookie that says "this pharmacy signed in to this company's storefront". It holds the pharmacy's id, the storefront's id and
// the moment it stops working, signed with its own key so it can't be forged, moved to another storefront, or used as any other cookie.
// The server still checks on every visit that the account is approved (see storefront-buyers.ts). Same idea as affiliate-session.ts.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { BUYER_SESSION_DAYS } from "@/lib/storefront-buyer-rules";

export type BuyerSession = { b: string; s: string; exp: number };

function key(): Buffer {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("No secret is configured.");
  return createHash("sha256").update("storefront-buyer:" + secret).digest();
}
const sign = (payload: string) => createHmac("sha256", key()).update(payload).digest("base64url");

export function signBuyerSession(buyerId: string, storefrontId: string, nowMs = Date.now()): { value: string; maxAgeSec: number } {
  const t: BuyerSession = { b: buyerId, s: storefrontId, exp: nowMs + BUYER_SESSION_DAYS * 86400000 };
  const payload = Buffer.from(JSON.stringify(t)).toString("base64url");
  return { value: `${payload}.${sign(payload)}`, maxAgeSec: BUYER_SESSION_DAYS * 86400 };
}

/** The session if it is genuine and has not expired, else null. Never throws. */
export function readBuyerSession(raw: string | null | undefined, nowMs = Date.now()): BuyerSession | null {
  try {
    const [payload, sig] = String(raw ?? "").split(".");
    if (!payload || !sig) return null;
    const want = Buffer.from(sign(payload));
    const got = Buffer.from(sig);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    const t = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as BuyerSession;
    if (typeof t.b !== "string" || typeof t.s !== "string" || typeof t.exp !== "number" || t.exp <= nowMs) return null;
    return t;
  } catch {
    return null;
  }
}
