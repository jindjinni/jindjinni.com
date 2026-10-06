import { NextResponse, type NextRequest } from "next/server";

// Moved: the serial list is part of the Lot & Serial Tracker CSV.
export function GET(req: NextRequest) {
  const url = new URL("/api/receiving/tracker/csv", req.url);
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));
  url.searchParams.set("view", "serials");
  return NextResponse.redirect(url);
}
