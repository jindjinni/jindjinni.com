// The unsubscribe link in every marketing email. It carries the company and the address, signed so it can't be forged or
// pointed at someone else: anyone holding a valid link can unsubscribe that one address, and nothing more.
import { createHmac, timingSafeEqual } from "node:crypto";

const secret = () => process.env.MARKETING_TOKEN_KEY || process.env.AUTH_SECRET || "dev-only-secret";
const sign = (payload: string) => createHmac("sha256", secret()).update(`marketing-unsub:${payload}`).digest("hex").slice(0, 32);

export function makeUnsubscribeToken(organizationId: string, channel: "EMAIL" | "TEXT", addressKey: string): string {
  const payload = Buffer.from(JSON.stringify({ o: organizationId, c: channel, a: addressKey })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readUnsubscribeToken(token: string): { organizationId: string; channel: "EMAIL" | "TEXT"; addressKey: string } | null {
  const [payload, sig] = String(token ?? "").split(".");
  if (!payload || !sig) return null;
  const want = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const v = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { o?: string; c?: string; a?: string };
    if (!v.o || !v.a || (v.c !== "EMAIL" && v.c !== "TEXT")) return null;
    return { organizationId: v.o, channel: v.c, addressKey: v.a };
  } catch {
    return null;
  }
}

export const unsubscribeUrl = (origin: string, token: string) => `${origin.replace(/\/$/, "")}/unsubscribe/${token}`;
