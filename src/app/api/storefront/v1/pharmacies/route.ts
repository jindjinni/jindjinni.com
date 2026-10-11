import type { NextRequest } from "next/server";
import { done, fail, preflight, runApi } from "@/lib/storefront-api-http";
import { findPharmacyByEmail, orderingOpen } from "@/lib/storefront-orders";

export const dynamic = "force-dynamic";

/** Finds the approved pharmacy with this email (?email=...), so the website can order for it. Secret key only; the website signs its own pharmacies in. */
export async function GET(req: NextRequest) {
  return runApi(req, "pharmacy-read", async ({ sf }) => {
    if (!(await orderingOpen(sf))) return fail("not_open", "This company is not taking online orders right now.");
    const found = await findPharmacyByEmail(sf, req.nextUrl.searchParams.get("email"));
    if (!found) return fail("not_found", "No approved pharmacy with that email.");
    return done(200, { pharmacy: found });
  });
}

export const OPTIONS = preflight;
