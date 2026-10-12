import type { NextRequest } from "next/server";
import { done, fail, preflight, publicIpLimit, readJson, runApi } from "@/lib/storefront-api-http";
import { LIMITS } from "@/lib/storefront-api-rules";
import { cleanCart } from "@/lib/checkout-rules";
import { lineDetail, loadCheckoutCatalog, priceCart } from "@/lib/website-checkout";

export const dynamic = "force-dynamic";

/** Prices a cart from the company's own price list so the website can show the payout before the customer submits. Saves nothing. */
export async function POST(req: NextRequest) {
  return runApi(req, "checkout-quote", async (ctx) => {
    if (!ctx.sf.checkoutOpen) return fail("not_open", "This company is not taking orders through its website right now.");
    const limited = await publicIpLimit(ctx, "sfapi-quote", LIMITS.publicSellPerIp * 20);
    if (limited) return limited;
    const read = await readJson(req);
    if (!read.ok) return read.res;
    const cart = cleanCart(read.body.items);
    if (!cart.ok) return fail("invalid_request", cart.error);
    const priced = await priceCart(ctx.sf.organizationId, await loadCheckoutCatalog(ctx.sf.organizationId), cart.lines);
    if (!priced.ok) return fail("invalid_request", priced.error);
    const c = priced.cart;
    return done(200, {
      lines: c.lines.map((l) => ({ productId: l.productId, name: l.name, detail: lineDetail(l), quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: l.lineTotal })),
      itemsTotal: c.itemsTotal, bonus: c.bonus, total: c.total,
    });
  });
}

export const OPTIONS = preflight;
