import { NextRequest, NextResponse } from "next/server";
import { requireOrgApi } from "@/lib/tenant";
import { canConnectQuickBooks } from "@/lib/quickbooks-access";
import { quickbooksOn } from "@/lib/quickbooks-service";
import { qboAuthUrl, qboConfigured, qboRedirectUri, qboScope } from "@/lib/quickbooks";
import { ackOk } from "@/lib/quickbooks-rules";
import { makeState, newNonce } from "@/lib/email-connector-crypto";

export const dynamic = "force-dynamic";

const SETTINGS = "/dashboard/settings/connectors";

// Step 1 of connecting QuickBooks: an owner or admin who has accepted the notice is sent to QuickBooks to sign in and choose the
// company file. Nothing is saved here; the signed state only carries who started it and which notice version they accepted.
export async function GET(req: NextRequest) {
  const org = await requireOrgApi();
  if (!org) return NextResponse.redirect(new URL("/login", req.url));
  if (org.viewAs) return new NextResponse("You are looking at this company's account, so nothing can be changed.", { status: 403 });
  if (!canConnectQuickBooks(org.role)) return new NextResponse("Only an owner or admin can connect QuickBooks.", { status: 403 });
  if (!(await quickbooksOn(org.organizationId))) return new NextResponse("Not found.", { status: 404 });
  if (!ackOk(req.nextUrl.searchParams.get("ack"))) return NextResponse.redirect(new URL(`${SETTINGS}?qb_error=ack#quickbooks`, req.url));
  if (!qboConfigured()) return NextResponse.redirect(new URL(`${SETTINGS}?qb_error=not_configured#quickbooks`, req.url));

  const nonce = newNonce();
  const state = makeState({ o: org.organizationId, u: org.userId, n: nonce, a: req.nextUrl.searchParams.get("ack") ?? "" });
  const url = new URL(qboAuthUrl());
  url.searchParams.set("client_id", process.env.QBO_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", qboRedirectUri(req.nextUrl.origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", qboScope);
  url.searchParams.set("state", state);
  const res = NextResponse.redirect(url);
  res.cookies.set("qb_nonce", nonce, { httpOnly: true, sameSite: "lax", secure: req.nextUrl.protocol === "https:", path: "/api/quickbooks", maxAge: 600 });
  return res;
}
