import { NextRequest, NextResponse } from "next/server";
import { requireOrgApi } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { exchangeCode, providerBySlug, redirectUriFor, saveConnection } from "@/lib/email-connector";
import { readState } from "@/lib/email-connector-crypto";

export const dynamic = "force-dynamic";

const SETTINGS = "/dashboard/customer-service/email-settings";

// Step 2: the provider sends the admin back here with a one-time code. We check it is the same admin and company that
// started the sign-in, trade the code for the mailbox's address and permission, save them, and return to Email Settings.
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const p = providerBySlug((await params).provider);
  if (!p) return new NextResponse("Unknown provider.", { status: 404 });
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`${SETTINGS}?${q}`, req.url));
    res.cookies.set("ec_nonce", "", { path: "/api/email-connect", maxAge: 0 });
    return res;
  };
  const org = await requireOrgApi();
  if (!org) return NextResponse.redirect(new URL("/login", req.url));
  if (!isAdmin(org.role)) return new NextResponse("Only an owner or admin can connect an email.", { status: 403 });

  const q = req.nextUrl.searchParams;
  if (q.get("error")) return back("connect_error=denied");
  const state = readState(q.get("state"));
  const nonce = req.cookies.get("ec_nonce")?.value;
  if (!state || !nonce || state.n !== nonce || state.o !== org.organizationId || state.u !== org.userId) return back("connect_error=state");
  const code = q.get("code");
  if (!code) return back("connect_error=denied");

  const r = await exchangeCode(p, code, redirectUriFor(req.nextUrl.origin, p));
  if (!r.ok) return back(`connect_error=${r.error}`);
  await saveConnection(org.organizationId, org.userId, p.key, r.email, r.refreshToken);
  return back("connected=1");
}
