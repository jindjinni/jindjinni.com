import { NextResponse } from "next/server";
import { sweepTracking } from "@/lib/tracking-service";
import { sweepIndustryWatch } from "@/lib/industry-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Nightly catch-up for tracking (see vercel.json), in case an update was missed, plus the industry news for the Home screen. Same protection as the other
// cron route: Vercel sends "Authorization: Bearer <CRON_SECRET>"; with no CRON_SECRET it refuses everything.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  // The Home screen's industry news is refreshed in the same nightly run (the hosting plan allows only a couple of scheduled jobs).
  const [tracking, industry] = await Promise.allSettled([sweepTracking(), sweepIndustryWatch()]);
  return NextResponse.json({
    ...(tracking.status === "fulfilled" ? tracking.value : { added: 0, refreshed: 0 }),
    industry: industry.status === "fulfilled" ? industry.value : { companies: 0, added: 0, failed: true },
  });
}
