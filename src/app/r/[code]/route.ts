import { NextResponse, type NextRequest } from "next/server";
import { findActiveAffiliateByCode } from "@/lib/pricing-service";
import { REF_COOKIE } from "@/lib/pricing-rules";

// An affiliate's link (/r/CODE): remembers the code for 30 days and sends the visitor to sign up. A code that does not exist is
// ignored (the visitor still lands on sign-up). Nothing about the affiliate is shown to the visitor.
export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const a = await findActiveAffiliateByCode(code).catch(() => null);
  const res = NextResponse.redirect(new URL("/signup", req.url));
  if (a?.code) res.cookies.set(REF_COOKIE, a.code, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
