import { NextResponse } from "next/server";
import { sweepTracking } from "@/lib/tracking-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Nightly catch-up for tracking (see vercel.json), in case an update was missed. Same protection as the other
// cron route: Vercel sends "Authorization: Bearer <CRON_SECRET>"; with no CRON_SECRET it refuses everything.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return NextResponse.json(await sweepTracking());
}
