import type { NextRequest } from "next/server";
import { done, fail, preflight, publicIpLimit, readJson, runApi } from "@/lib/storefront-api-http";
import { LIMITS, sellInputFromBody } from "@/lib/storefront-api-rules";
import { cleanSellRequest } from "@/lib/storefront-rules";
import { submitSellRequest } from "@/lib/storefront-public";

export const dynamic = "force-dynamic";

/**
 * A seller's request from the company's own website. It becomes a New "website request" for the company's team, exactly like one sent
 * from the storefront page. The website can't set a price, status or company. The same request sent twice in a day gives the same reference.
 */
export async function POST(req: NextRequest) {
  return runApi(req, "sell-request-create", async (ctx) => {
    if (!ctx.sf.sellOpen) return fail("not_open", "This company is not taking offers through its website right now.");
    const limited = await publicIpLimit(ctx, "sfapi-sell", LIMITS.publicSellPerIp);
    if (limited) return limited;
    const read = await readJson(req);
    if (!read.ok) return read.res;
    const mapped = sellInputFromBody(read.body);
    if (!mapped.ok) return fail("invalid_request", mapped.error);
    const cleaned = cleanSellRequest(mapped.input);
    if (!cleaned.ok) return fail("invalid_request", cleaned.error);
    const saved = await submitSellRequest(ctx.sf, cleaned.value, { source: "API", isDonation: mapped.isDonation });
    if (!saved.ok) return fail("daily_limit", saved.error);
    return done(201, { reference: saved.reference, status: "received" });
  });
}

export const OPTIONS = preflight;
