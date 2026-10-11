import type { NextRequest } from "next/server";
import { done, fail, preflight, publicIpLimit, readJson, runApi } from "@/lib/storefront-api-http";
import { LIMITS } from "@/lib/storefront-api-rules";
import { cleanApplication } from "@/lib/storefront-buyer-rules";
import { submitApplication } from "@/lib/storefront-buyers";

export const dynamic = "force-dynamic";

const KEYS = ["businessName", "contactName", "email", "phone", "street1", "street2", "city", "state", "zip", "npi", "deaNumber", "licenseNumber", "licenseState", "notes"] as const;

/**
 * A pharmacy's application from the company's own website. It waits for the company's team to approve it (Sales > Web accounts).
 * Pharmacies are asked for NPI, DEA and state license only; an NCPDP number is never part of an application. Applying again with the same
 * email gives the same answer, so this can't be used to find out who has an account.
 */
export async function POST(req: NextRequest) {
  return runApi(req, "application-create", async (ctx) => {
    if (!ctx.sf.buyOpen) return fail("not_open", "This company is not taking pharmacy applications right now.");
    const limited = await publicIpLimit(ctx, "sfapi-apply", LIMITS.publicApplyPerIp);
    if (limited) return limited;
    const read = await readJson(req);
    if (!read.ok) return read.res;
    const cleaned = cleanApplication(Object.fromEntries(KEYS.map((k) => [k, read.body[k]])) as Record<(typeof KEYS)[number], unknown>);
    if (!cleaned.ok) return fail("invalid_request", cleaned.error);
    const saved = await submitApplication(ctx.sf, cleaned.value, { source: "API" });
    if (!saved.ok) return fail("daily_limit", saved.error);
    return done(202, { received: true });
  });
}

export const OPTIONS = preflight;
