// Runs before every page and request. Its one job today: while a platform person is "viewing as a company" (the signed
// jj_view_as cookie), nothing may be changed and private areas stay closed. This is the central guard, so a new page or button
// can't forget to be read-only. (Ending the view is a plain link, /api/support/view-as/end.)

import { NextResponse, type NextRequest } from "next/server";
import { VIEW_COOKIE, readViewToken, viewModeVerdict } from "@/lib/view-as-token";

export function proxy(req: NextRequest) {
  const raw = req.cookies.get(VIEW_COOKIE)?.value;
  if (!raw) return NextResponse.next();
  // A cookie that has expired or isn't genuine does nothing here (the browser drops it at its expiry anyway).
  if (!readViewToken(raw)) return NextResponse.next();
  const verdict = viewModeVerdict(req.method, req.nextUrl.pathname);
  if (verdict.allow) return NextResponse.next();
  const wantsJson = req.nextUrl.pathname.startsWith("/api/");
  if (req.method === "GET" || req.method === "HEAD") {
    return wantsJson
      ? NextResponse.json({ error: verdict.reason }, { status: 403 })
      : NextResponse.redirect(new URL("/dashboard?viewblocked=1", req.url));
  }
  return new NextResponse(verdict.reason, { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export const config = {
  // Every route except Next's own files and images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt)$).*)"],
};
