import type { NextRequest } from "next/server";
import { done, fail, preflight, runApi } from "@/lib/storefront-api-http";
import { REFERENCE_PATTERN } from "@/lib/storefront-api-rules";
import { orderToApi } from "@/lib/website-checkout-api";
import { loadOrderView, orderViewUrl } from "@/lib/website-checkout";

export const dynamic = "force-dynamic";

/** One order's quotation, label and tracking, for the website to show its customer. Secret key only. Never returns bank details. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/storefront/v1/checkout/orders/[reference]">) {
  const { reference } = await ctx.params;
  return runApi(req, "checkout-read", async ({ sf }) => {
    const ref = reference.toUpperCase();
    if (!REFERENCE_PATTERN.test(ref)) return fail("not_found", "No order with that reference.");
    const order = await loadOrderView(sf.organizationId, ref);
    if (!order) return fail("not_found", "No order with that reference.");
    return done(200, { ...orderToApi(order), statusPage: orderViewUrl(sf.organizationId, sf.handle, ref) });
  });
}

export const OPTIONS = preflight;
