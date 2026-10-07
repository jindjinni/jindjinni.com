import { NextRequest, NextResponse } from "next/server";
import { requireOrgApi } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { providerBySlug, redirectUriFor } from "@/lib/email-connector";
import { makeState, newNonce } from "@/lib/email-connector-crypto";

export const dynamic = "force-dynamic";

const SETTINGS = "/dashboard/customer-service/email-settings";

// Step 1 of connecting a mailbox: an admin is sent to Google or Microsoft to sign in and approve "send email for me".
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const p = providerBySlug((await params).provider);
  if (!p) return new NextResponse("Unknown provider.", { status: 404 });
  const org = await requireOrgApi();
  if (!org) return NextResponse.redirect(new URL("/login", req.url));
  if (!isAdmin(org.role)) return new NextResponse("Only an owner or admin can connect an email.", { status: 403 });
  if (!p.configured()) return NextResponse.redirect(new URL(`${SETTINGS}?connect_error=not_configured`, req.url));

  const nonce = newNonce();
  const state = makeState({ o: org.organizationId, u: org.userId, n: nonce });
  const url = new URL(p.authUrl());
  url.searchParams.set("client_id", p.clientId());
  url.searchParams.set("redirect_uri", redirectUriFor(req.nextUrl.origin, p));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", p.scopes.join(" "));
  for (const [k, v] of Object.entries(p.extraAuth)) url.searchParams.set(k, v);
  url.searchParams.set("state", state);
  const res = NextResponse.redirect(url);
  res.cookies.set("ec_nonce", nonce, { httpOnly: true, sameSite: "lax", secure: req.nextUrl.protocol === "https:", path: "/api/email-connect", maxAge: 600 });
  return res;
}
