import type { NextRequest } from "next/server";
import { done, fail, preflight, runApi } from "@/lib/storefront-api-http";
import { REFERENCE_PATTERN } from "@/lib/storefront-api-rules";
import { requestStatusByReference } from "@/lib/storefront-api";

export const dynamic = "force-dynamic";

/** Where a request stands (received / quotation made / declined) and, once the team has made it, the free shipping label. Secret key only. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/storefront/v1/sell-requests/[reference]">) {
  const { reference } = await ctx.params;
  return runApi(req, "sell-request-read", async ({ sf }) => {
    const ref = reference.toUpperCase();
    if (!REFERENCE_PATTERN.test(ref)) return fail("not_found", "No request with that reference.");
    const found = await requestStatusByReference(sf.organizationId, ref);
    return found ? done(200, found) : fail("not_found", "No request with that reference.");
  });
}

export const OPTIONS = preflight;
