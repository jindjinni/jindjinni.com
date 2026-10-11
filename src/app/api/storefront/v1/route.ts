import type { NextRequest } from "next/server";
import { done, preflight, runApi } from "@/lib/storefront-api-http";
import { API_VERSION } from "@/lib/storefront-api-rules";

export const dynamic = "force-dynamic";

/** Check the connection: which company the key belongs to and what its storefront accepts right now. */
export async function GET(req: NextRequest) {
  return runApi(req, "info", async ({ key, sf }) =>
    done(200, { version: API_VERSION, keyType: key.kind, company: { name: sf.displayName, handle: sf.handle }, accepting: { sellRequests: sf.sellOpen, pharmacyApplications: sf.buyOpen } }),
  );
}

export const OPTIONS = preflight;
