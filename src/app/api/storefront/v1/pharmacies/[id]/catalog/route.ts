import type { NextRequest } from "next/server";
import { done, preflight, runApi } from "@/lib/storefront-api-http";
import { catalogFor } from "@/lib/storefront-orders";
import { pharmacyFor } from "@/lib/storefront-orders-api";

export const dynamic = "force-dynamic";

/** What this pharmacy may order: its own price-sheet lines at its own prices, each "inStock" true or false (never a count). */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/storefront/v1/pharmacies/[id]/catalog">) {
  const { id } = await ctx.params;
  return runApi(req, "pharmacy-read", async (c) => {
    const p = await pharmacyFor(c, id);
    if (!p.ok) return p.res;
    const items = await catalogFor(c.sf, p.buyer);
    return done(200, { pharmacy: { id: p.buyer.id, businessName: p.buyer.businessName }, items });
  });
}

export const OPTIONS = preflight;
