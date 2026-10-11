import type { NextRequest } from "next/server";
import { done, fail, preflight, readJson, runApi } from "@/lib/storefront-api-http";
import { listOrders, placeOrder } from "@/lib/storefront-orders";
import { cleanOrderRequest } from "@/lib/storefront-order-rules";
import { orderJson, pharmacyFor } from "@/lib/storefront-orders-api";

export const dynamic = "force-dynamic";

/** The pharmacy's orders, newest first. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/storefront/v1/pharmacies/[id]/orders">) {
  const { id } = await ctx.params;
  return runApi(req, "order-read", async (c) => {
    const p = await pharmacyFor(c, id);
    if (!p.ok) return p.res;
    return done(200, { orders: await listOrders(c.sf, p.buyer.id) });
  });
}

/**
 * Places an order for the pharmacy. Body: { idempotencyKey, items: [{ id, quantity }], poNumber?, notes? } where each id is a catalog line's id.
 * The price and the stock check are done here. Sending the same idempotencyKey again returns the first order instead of making a second.
 * Confirmed at once ("confirmed") unless the company holds large orders for review ("in_review").
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/storefront/v1/pharmacies/[id]/orders">) {
  const { id } = await ctx.params;
  return runApi(req, "order-create", async (c) => {
    const p = await pharmacyFor(c, id);
    if (!p.ok) return p.res;
    const read = await readJson(req);
    if (!read.ok) return read.res;
    const b = read.body;
    const cleaned = cleanOrderRequest({ key: b.idempotencyKey ?? req.headers.get("idempotency-key"), lines: b.items, poNumber: b.poNumber, notes: b.notes });
    if (!cleaned.ok) return fail("invalid_request", cleaned.error);
    const res = await placeOrder(c.sf, p.buyer.id, cleaned.value, { source: "API" });
    if (res.ok) return done(res.created ? 201 : 200, { created: res.created, ...orderJson(res.order) });
    if (res.code === "unavailable") return fail("items_unavailable", res.error, { items: (res.unavailable ?? []).map((u) => ({ id: u.itemId, name: u.name })) });
    if (res.code === "not_open") return fail("not_open", res.error);
    if (res.code === "invalid") return fail("invalid_request", res.error);
    if (res.code === "too_many") return fail("daily_limit", res.error);
    return fail("server_error", res.error);
  });
}

export const OPTIONS = preflight;
