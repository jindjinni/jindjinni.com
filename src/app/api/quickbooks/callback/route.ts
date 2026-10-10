import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requireOrgApi } from "@/lib/tenant";
import { canConnectQuickBooks } from "@/lib/quickbooks-access";
import { quickbooksOn } from "@/lib/quickbooks-service";
import { companyNameFor, exchangeCode, qboRedirectUri, saveQuickBooks } from "@/lib/quickbooks";
import { ackOk } from "@/lib/quickbooks-rules";
import { readState } from "@/lib/email-connector-crypto";
import { logActivity } from "@/lib/hr-service";

export const dynamic = "force-dynamic";

const SETTINGS = "/dashboard/settings/connectors";

// Step 2: QuickBooks sends the person back with a one-time code and the company file's id. We check it is the same person and
// company that started the sign-in and that they accepted the notice, trade the code for a key, and save the key encrypted.
export async function GET(req: NextRequest) {
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`${SETTINGS}?${q}#quickbooks`, req.url));
    res.cookies.set("qb_nonce", "", { path: "/api/quickbooks", maxAge: 0 });
    return res;
  };
  const org = await requireOrgApi();
  if (!org) return NextResponse.redirect(new URL("/login", req.url));
  if (org.viewAs) return new NextResponse("You are looking at this company's account, so nothing can be changed.", { status: 403 });
  if (!canConnectQuickBooks(org.role)) return new NextResponse("Only an owner or admin can connect QuickBooks.", { status: 403 });
  if (!(await quickbooksOn(org.organizationId))) return new NextResponse("Not found.", { status: 404 });

  const q = req.nextUrl.searchParams;
  const state = readState(q.get("state"));
  const nonce = req.cookies.get("qb_nonce")?.value;
  const stateOk = !!state && !!nonce && state.n === nonce && state.o === org.organizationId && state.u === org.userId && ackOk(state.a);
  if (q.get("error")) return back("qb_error=denied");
  if (!stateOk || !state) return back("qb_error=state");
  const code = q.get("code");
  const realmId = q.get("realmId") ?? "";
  if (!code || !/^[0-9A-Za-z_-]{3,40}$/.test(realmId)) return back("qb_error=denied");

  const r = await exchangeCode(code, qboRedirectUri(req.nextUrl.origin));
  if (!r.ok) return back("qb_error=exchange");
  const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, org.userId)).limit(1);
  const name = await companyNameFor(realmId, r.accessToken);
  await saveQuickBooks(org.organizationId, { userId: org.userId, name: u?.name || u?.email || null }, { realmId, refreshToken: r.refreshToken, companyName: name, termsVersion: state.a ?? "" });
  await logActivity(org, "OTHER", `Connected QuickBooks${name ? ` (${name})` : ""}`);
  return back("qb_connected=1");
}
