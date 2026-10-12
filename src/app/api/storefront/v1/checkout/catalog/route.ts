import type { NextRequest } from "next/server";
import { done, fail, preflight, runApi } from "@/lib/storefront-api-http";
import { loadCheckoutCatalog } from "@/lib/website-checkout";

export const dynamic = "force-dynamic";

/**
 * What the company is buying right now and what it pays: every product with the expiry bands and conditions it offers and the price for each
 * combination. A public key may read it (a website shows it to its visitors). Nothing here is a stock level or a customer record.
 */
export async function GET(req: NextRequest) {
  return runApi(req, "catalog-read", async ({ sf }) => {
    if (!sf.checkoutOpen) return fail("not_open", "This company is not taking orders through its website right now.");
    const c = await loadCheckoutCatalog(sf.organizationId);
    return done(200, {
      products: c.products.map((p) => ({
        id: p.id, name: p.name, code: p.code, ndc: p.ndc, category: p.category, standardPrice: p.price, expires: !p.noExpiration,
        expiryOptions: p.expiry.map((e) => ({ id: e.id, label: e.label, payoutPercent: Math.round(e.multiplier * 10000) / 100 })),
        conditions: p.conditions.map((x) => ({ id: x.id, name: x.name, payoutPercent: Math.round(x.multiplier * 10000) / 100 })),
      })),
      bonusTiers: c.bonusTiers,
    });
  });
}

export const OPTIONS = preflight;
