// The HTTP side of the website connection (/api/storefront/v1/...): reads the key, decides who is calling and what they may do, applies
// the limits, and turns the answer into JSON. Every route goes through runApi so no route can forget a check.
//
// Order of checks: too many wrong keys from one address -> key present and genuine -> a SECRET key never from a browser -> a PUBLIC key only
// from a listed website address -> the key may do this action -> the storefront's door is open (feature on, not hidden, company approved)
// -> per-key limit. The company is the key's company; nothing in the request body can change it.

import { NextResponse, type NextRequest } from "next/server";
import { clientIp } from "@/lib/human-check";
import { rateCheck, rateHit } from "@/lib/rate-limit";
import { findPublicStorefrontById, type PublicStorefront } from "@/lib/storefront-public";
import { lookupApiKey, type KeyContext } from "@/lib/storefront-api";
import { ERROR_STATUS, LIMITS, MAX_BODY_BYTES, bearerOf, mayDo, originAllowed, originsFromText, type ApiAction, type ApiErrorCode } from "@/lib/storefront-api-rules";

export type ApiCtx = { key: KeyContext; sf: PublicStorefront; origin: string | null; ip: string };
export type ApiResult = { status: number; body: unknown };

export const done = (status: number, body: unknown): ApiResult => ({ status, body });
export const fail = (code: ApiErrorCode, message: string, extra?: Record<string, unknown>): ApiResult => ({ status: ERROR_STATUS[code], body: { error: { code, message, ...extra } } });

function reply(res: ApiResult, origin: string | null, corsOk: boolean): NextResponse {
  const h = new Headers({ "Cache-Control": "no-store", Vary: "Origin" });
  // A browser may read the answer only when the website is one the company listed (errors are echoed too, so the developer can see why).
  if (origin && (corsOk || res.status >= 400)) h.set("Access-Control-Allow-Origin", origin);
  return NextResponse.json(res.body, { status: res.status, headers: h });
}

/** The reply to a browser's "may I?" check. The real request is checked in full, so this only lets the browser send it. */
export function preflight(req: NextRequest): NextResponse {
  const origin = req.headers.get("origin");
  const h = new Headers({
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  });
  if (origin) h.set("Access-Control-Allow-Origin", origin);
  return new NextResponse(null, { status: 204, headers: h });
}

export async function runApi(req: NextRequest, action: ApiAction, handler: (ctx: ApiCtx) => Promise<ApiResult>): Promise<NextResponse> {
  const origin = req.headers.get("origin");
  try {
    const ip = await clientIp();
    if (!(await rateCheck("sfapi-bad", ip, LIMITS.badKeyPerIp, 3600)).allowed) return reply(fail("rate_limited", "Too many wrong keys from this address. Wait an hour and check the key."), origin, false);

    const raw = bearerOf(req.headers.get("authorization"));
    if (!raw) return reply(fail("missing_key", "Send your key as: Authorization: Bearer <key>"), origin, false);
    const key = await lookupApiKey(raw);
    if (!key) {
      await rateHit("sfapi-bad", ip, LIMITS.badKeyPerIp, 3600);
      return reply(fail("invalid_key", "That key is not valid, or it has been turned off."), origin, false);
    }

    if (key.kind === "secret" && origin) return reply(fail("secret_key_in_browser", "A secret key must only be used from your website's server, never in a web page. Use a public key in the browser."), origin, false);
    let corsOk = false;
    if (key.kind === "public") {
      const listed = originsFromText(key.allowedOrigins);
      if (!originAllowed(origin, listed)) return reply(fail("origin_not_allowed", "This public key only works from the website addresses listed in your settings (Settings > Storefront > Connect your website)."), origin, false);
      corsOk = true;
    }
    if (!mayDo(key.kind, action)) return reply(fail("not_allowed_for_key", "This key can't do that. Use your secret key from your website's server."), origin, corsOk);

    const sf = await findPublicStorefrontById(key.storefrontId, key.organizationId);
    if (!sf) return reply(fail("storefront_unavailable", "This storefront is not available right now."), origin, corsOk);

    if (key.kind === "secret" && !(await rateHit("sfapi-key", key.keyId, LIMITS.secretPerKey, 3600)).allowed) return reply(fail("rate_limited", "Too many requests with this key this hour. Try again later."), origin, corsOk);

    return reply(await handler({ key, sf, origin, ip }), origin, corsOk);
  } catch (err) {
    console.error("[storefront-api] failed:", err);
    return reply(fail("server_error", "Something went wrong on our side. Please try again."), origin, false);
  }
}

/** The JSON a website sent, as an object. Too big, empty or not an object gives a plain error instead. */
export async function readJson(req: NextRequest): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; res: ApiResult }> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY_BYTES) return { ok: false, res: fail("too_large", `Send less than ${Math.floor(MAX_BODY_BYTES / 1000)} KB.`) };
  let text = "";
  try { text = await req.text(); } catch { return { ok: false, res: fail("invalid_request", "Could not read the request.") }; }
  if (text.length > MAX_BODY_BYTES) return { ok: false, res: fail("too_large", `Send less than ${Math.floor(MAX_BODY_BYTES / 1000)} KB.`) };
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: false, res: fail("invalid_request", "Send a JSON object.") };
    return { ok: true, body: v as Record<string, unknown> };
  } catch {
    return { ok: false, res: fail("invalid_request", "The body must be JSON (Content-Type: application/json).") };
  }
}

/** The per-address limit for a browser form: a public key's callers are held to the storefront forms' limits. */
export async function publicIpLimit(ctx: ApiCtx, scope: string, max: number): Promise<ApiResult | null> {
  if (ctx.key.kind !== "public") return null;
  const r = await rateHit(scope, `${ctx.key.keyId}:${ctx.ip}`, max, 3600);
  return r.allowed ? null : fail("rate_limited", "Too many tries from this connection. Please wait an hour and try again.");
}
