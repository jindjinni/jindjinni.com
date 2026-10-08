import { NextResponse } from "next/server";
import { endDuePlans } from "@/lib/plan-end";

export const dynamic = "force-dynamic";

// Nightly: switches off companies whose cancelled plan has run out (see vercel.json and lib/plan-end.ts). Same protection as the
// other cron routes: with no CRON_SECRET configured it refuses every call.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return NextResponse.json(await endDuePlans());
}
