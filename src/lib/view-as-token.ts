// The signed cookie that says "this signed-in platform person is currently looking at that company's account". It holds only a
// session id, the person's id and the moment it stops working, signed so it can't be forged or moved to another person. The
// real checks (consent still valid, session not ended, two-step on) happen on the server every time -- see lib/view-as.ts.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const VIEW_COOKIE = "jj_view_as";

export type ViewToken = { s: string; u: string; exp: number };

function key(): Buffer {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("No secret is configured.");
  return createHash("sha256").update("view-as:" + secret).digest();
}
const sign = (payload: string) => createHmac("sha256", key()).update(payload).digest("base64url");

export function signViewToken(t: ViewToken): string {
  const payload = Buffer.from(JSON.stringify(t)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The token if it is genuine and has not expired, else null. Never throws. */
export function readViewToken(raw: string | null | undefined, nowMs = Date.now()): ViewToken | null {
  try {
    const [payload, sig] = String(raw ?? "").split(".");
    if (!payload || !sig) return null;
    const want = Buffer.from(sign(payload));
    const got = Buffer.from(sig);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    const t = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ViewToken;
    if (typeof t.s !== "string" || typeof t.u !== "string" || typeof t.exp !== "number" || t.exp <= nowMs) return null;
    return t;
  } catch {
    return null;
  }
}

// ---- What a person who is only LOOKING may request (used by src/proxy.ts) --------------------------------------------------
/** Pages that stay closed while looking at someone else's account (private conversations, people's records, closing the company). */
const BLOCKED_PAGES = ["/dashboard/chat", "/dashboard/hr", "/dashboard/settings/close-company", "/dashboard/settings/jin-library", "/dashboard/lamp"];
/** The only data routes a looking session may fetch: pictures shown in pages, address suggestions, the human check, ending the view. */
const ALLOWED_API = ["/api/address-autocomplete", "/api/human-check", "/api/support/view-as/end", "/api/receiving/photos/", "/api/auth/session", "/api/auth/csrf"];

export type ViewVerdict = { allow: true } | { allow: false; reason: string };

/** Pure: may a request with this method and path go through while a "view as company" session is active? */
export function viewModeVerdict(method: string, pathname: string): ViewVerdict {
  const m = method.toUpperCase();
  if (m !== "GET" && m !== "HEAD") return { allow: false, reason: "You are viewing this company's account read-only. Nothing can be changed. End the view first." };
  if (pathname.startsWith("/api/")) {
    return ALLOWED_API.some((p) => pathname === p || pathname.startsWith(p)) ? { allow: true } : { allow: false, reason: "That isn't available while viewing a company's account." };
  }
  if (BLOCKED_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return { allow: false, reason: "That area stays private while viewing a company's account." };
  return { allow: true };
}
