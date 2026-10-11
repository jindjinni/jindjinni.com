import type { NextRequest } from "next/server";
import { done, fail, preflight, publicIpLimit, readJson, runApi } from "@/lib/storefront-api-http";
import { LIMITS, sellInputFromBody } from "@/lib/storefront-api-rules";
import { cleanSellRequest } from "@/lib/storefront-rules";
import { submitSellRequest } from "@/lib/storefront-public";
import { cleanPayout, type Payout } from "@/lib/bank-rules";

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
    // Direct-deposit details (optional). Only a website's server (secret key) may send them: a key that sits in a web page could be copied by
    // anyone and used to put someone else's account number on a seller. They are checked before anything is saved, stored encrypted, and
    // never sent back, logged or put in an email.
    let payout: Payout | undefined;
    const sentPayout = read.body.payout;
    if (sentPayout !== undefined && sentPayout !== null) {
      if (ctx.key.kind !== "secret") return fail("not_allowed_for_key", "Bank details can only be sent from your website's server with your secret key, never from a web page.");
      if (typeof sentPayout !== "object" || Array.isArray(sentPayout)) return fail("invalid_request", "payout must be an object with ownerName, routingNumber, accountNumber and accountType.");
      const p = cleanPayout(sentPayout as Record<string, unknown> as { ownerName: unknown; routingNumber: unknown; accountNumber: unknown; accountType: unknown });
      if (!p.ok) return fail("invalid_request", p.error);
      payout = p.value;
    }
    const saved = await submitSellRequest(ctx.sf, cleaned.value, { source: "API", isDonation: mapped.isDonation, payout });
    if (!saved.ok) return fail("daily_limit", saved.error);
    return done(201, { reference: saved.reference, status: "received", ...(payout ? { bankDetails: saved.created ? "received" : "not_saved_request_already_sent" } : {}) });
  });
}

export const OPTIONS = preflight;
