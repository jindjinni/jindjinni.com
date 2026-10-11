import type { NextRequest } from "next/server";
import { done, fail, preflight, runApi } from "@/lib/storefront-api-http";
import { orderByReference } from "@/lib/storefront-orders";
import { orderJson, pharmacyFor, validReference } from "@/lib/storefront-orders-api";

export const dynamic = "force-dynamic";

/** One of the pharmacy's own orders by its reference (another pharmacy's order looks exactly like a missing one). */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/storefront/v1/pharmacies/[id]/orders/[reference]">) {
  const { id, reference } = await ctx.params;
  return runApi(req, "order-read", async (c) => {
    const p = await pharmacyFor(c, id);
    if (!p.ok) return p.res;
    if (!validReference(reference)) return fail("not_found", "No order with that reference.");
    const o = await orderByReference(c.sf, p.buyer.id, reference.toUpperCase());
    return o ? done(200, orderJson(o)) : fail("not_found", "No order with that reference.");
  });
}

export const OPTIONS = preflight;
